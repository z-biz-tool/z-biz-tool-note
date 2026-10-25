// AI 密钥的存取与一次性迁移。
//
// 背景（迁移前的真实存储位置）：`ai.apiKey` 曾以明文 JSON 存在 localStorage
// 的 `aiConfig` 键里（App.tsx 写入/读出），任何能读 WebView 存储的代码都能
// 拿到。现在密钥只进 OS 密钥库（macOS 钥匙串 / Windows 凭据管理器 /
// Linux Secret Service），localStorage 只留非敏感项（模型、接口地址等）。
//
// 数据流：
//   保存：SettingsDialog → App.onSaveAI → saveAiConfigToStores
//         → keychain 写/删（save_secret / delete_secret）
//         → localStorage 写剥掉 apiKey 的 aiConfig
//   启动：loadAiConfigFromStores → 先做一次性迁移（migratePlaintextApiKey：
//         旧明文搬进 keychain 成功后擦除旧位置）→ 再从 keychain 读回
//
// account 命名与 Rust src-tauri/src/secrets.rs 的 account_for 规范对齐：
// "ai.apiKey"、"ai.provider.<name>.key"（service = "z-biz-tool-note"）。
//
// 注意：electronAPI 是**动态 import** 的。它的静态导入链里有 dialogs.tsx，
// 而前端单测跑在 `node --experimental-strip-types` 上 —— Node 的类型剥离
// 只认 .ts，碰到 .tsx 直接报 Unknown file extension。把桥层隔离在按需 import
// 里，本模块的纯逻辑（迁移 / 剥离 / 装载）就能被测试直接注入假后端跑起来。

import type { AIConfig } from "../types";

/** localStorage 里非敏感 AI 配置的键（与迁移前同一个键，历史数据才找得到） */
export const AI_CONFIG_KEY = "aiConfig";

/** 默认 AI 密钥在 keychain 里的 account（命名空间化，勿改：改了旧密钥就读不回） */
export const AI_APIKEY_ACCOUNT = "ai.apiKey";

export const DEFAULT_AI_CONFIG: AIConfig = {
  baseURL: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  enabled: false,
};

/** 配置存储抽象（App 里是 localStorage；单测注入内存实现，不碰全局） */
export interface SettingsStorage {
  read(key: string): string | null;
  write(key: string, value: string): void;
}

/** 密钥后端抽象（默认走 keychain 桥层；单测注入假实现） */
export interface SecretBackend {
  save(account: string, value: string): Promise<boolean>;
  load(account: string): Promise<string | null>;
  remove(account: string): Promise<boolean>;
}

/** 去掉 apiKey 的配置副本：localStorage 落盘只留非敏感项。 */
export function withoutApiKey(cfg: AIConfig): Omit<AIConfig, "apiKey"> {
  const { apiKey: _key, ...rest } = cfg;
  return rest;
}

/**
 * 一次性迁移：发现旧位置（localStorage aiConfig）有明文密钥，就搬进 keychain
 * 并擦除旧位置。返回搬走的明文（没有则空串）。
 *
 * 两条硬规则：
 * - keychain 写入**失败**就原样留着旧位置 —— 宁可暂留明文，不能把用户的密钥
 *   弄丢（本机 keychain 不可用时唯一的副本就是它）；
 * - 只有写入成功才擦除，且只擦 apiKey 一个字段，其余配置原样写回。
 */
export async function migratePlaintextApiKey(
  storage: SettingsStorage,
  backend: SecretBackend,
): Promise<string> {
  const raw = storage.read(AI_CONFIG_KEY);
  if (!raw) return "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return ""; // 旧数据坏了：当没有处理，密钥自然也无从搬起
  }
  if (!parsed || typeof parsed !== "object") return "";
  const plain = (parsed as { apiKey?: unknown }).apiKey;
  if (typeof plain !== "string" || !plain) return "";
  if (!(await backend.save(AI_APIKEY_ACCOUNT, plain))) return "";
  const { apiKey: _drop, ...rest } = parsed as Record<string, unknown>;
  storage.write(AI_CONFIG_KEY, JSON.stringify(rest));
  return plain;
}

/**
 * 启动时装载 AI 配置：非敏感项从 localStorage 读，密钥从 keychain 读回。
 * 迁移刚搬走的明文直接复用，省一次 IPC。
 */
export async function loadAiConfig(
  storage: SettingsStorage,
  backend: SecretBackend,
  fallback: AIConfig = DEFAULT_AI_CONFIG,
): Promise<AIConfig> {
  let cfg: AIConfig = { ...fallback, apiKey: "" };
  const raw = storage.read(AI_CONFIG_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      // 旧版本可能存着明文 apiKey：先合进来让迁移看得见，migrate 之后这里
      // 的明文值也会被 keychain 返回值覆盖，不会漏进 state 之外的任何地方。
      if (parsed && typeof parsed === "object") cfg = { ...cfg, ...parsed };
    } catch {
      // 读不出来的 localStorage 当不存在，走默认配置
    }
  }
  const migrated = await migratePlaintextApiKey(storage, backend);
  const key = migrated || (await backend.load(AI_APIKEY_ACCOUNT)) || "";
  return { ...cfg, apiKey: key };
}

/**
 * 保存 AI 配置：密钥只进 keychain；密钥落库成功后才把剥掉 apiKey 的配置
 * 写回 localStorage。落库失败返回 false —— 此时 localStorage 保持原样，
 * 调用方应报错，用户的密钥不会因为这次失败的保存而丢失。
 */
export async function saveAiConfig(
  storage: SettingsStorage,
  backend: SecretBackend,
  cfg: AIConfig,
): Promise<boolean> {
  const ok = cfg.apiKey
    ? await backend.save(AI_APIKEY_ACCOUNT, cfg.apiKey)
    : await backend.remove(AI_APIKEY_ACCOUNT);
  if (!ok) return false;
  storage.write(AI_CONFIG_KEY, JSON.stringify(withoutApiKey(cfg)));
  return true;
}

/* ───────────────────────── 生产装配（localStorage + keychain 桥层） ───────────────────────── */

const localStorageSettings: SettingsStorage = {
  read: (key) => localStorage.getItem(key),
  write: (key, value) => localStorage.setItem(key, value),
};

/** 桥层返回值统一是 {success, ...}；这里收窄成 SecretBackend 的布尔/null 口径 */
function keychainBackend(api: {
  invoke(channel: string, ...args: unknown[]): Promise<any>;
}): SecretBackend {
  return {
    save: async (account, value) => {
      const r = await api.invoke("save-secret", account, value);
      return r?.success === true;
    },
    load: async (account) => {
      const r = await api.invoke("load-secret", account);
      return r?.success === true && typeof r.value === "string"
        ? r.value
        : null;
    },
    remove: async (account) => {
      const r = await api.invoke("delete-secret", account);
      return r?.success === true;
    },
  };
}

async function withBackend<T>(
  fn: (backend: SecretBackend) => Promise<T>,
): Promise<T> {
  const { electronAPI } = await import("./electronAPI");
  return fn(keychainBackend(electronAPI));
}

export const loadAiConfigFromStores = (): Promise<AIConfig> =>
  withBackend((b) => loadAiConfig(localStorageSettings, b, DEFAULT_AI_CONFIG));

export const saveAiConfigToStores = (cfg: AIConfig): Promise<boolean> =>
  withBackend((b) => saveAiConfig(localStorageSettings, b, cfg));
