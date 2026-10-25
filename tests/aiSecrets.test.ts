// src/lib/aiSecrets.ts 的密钥迁移回归。
//
// Why 该测：这是把 AI API Key 从 localStorage 明文搬进 OS 密钥库的那层逻辑。
// 两条最容易坏、且坏了用户完全看不出的事：
//   1) 迁移只搬不擦 / 擦了没搬成 —— 明文要么留在旧位置（迁移白做），
//      要么被擦掉却没进 keychain（用户密钥直接丢失，下次打开 AI 用不了）；
//   2) 保存时把 apiKey 又写回 localStorage —— 明文存储复活。
// 这两条在界面上都没有任何可见症状，只能靠单测钉住。
//
// 跑法：node --experimental-strip-types --test tests/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { installHooks } from "./helpers/hooks.ts";

installHooks();

const {
  AI_APIKEY_ACCOUNT,
  AI_CONFIG_KEY,
  loadAiConfig,
  migratePlaintextApiKey,
  saveAiConfig,
  withoutApiKey,
} = await import("../src/lib/aiSecrets.ts");

/** 内存版配置存储（Node 里没有 localStorage，也不该为单测造一个全局） */
function memoryStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    read: (k: string) => map.get(k) ?? null,
    write: (k: string, v: string) => void map.set(k, v),
  };
}

/** 假密钥后端：记录调用，可按配置让 save 失败 */
function fakeBackend(
  opts: { failSave?: boolean; stored?: string | null } = {},
) {
  const calls: string[] = [];
  return {
    calls,
    save: async (account: string, value: string) => {
      calls.push(`save:${account}`);
      if (opts.failSave) return false;
      opts.stored = value;
      return true;
    },
    load: async (account: string) => {
      calls.push(`load:${account}`);
      return opts.stored ?? null;
    },
    remove: async (account: string) => {
      calls.push(`remove:${account}`);
      opts.stored = null;
      return true;
    },
  };
}

const CFG = (over: Record<string, unknown> = {}) => ({
  baseURL: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  enabled: true,
  ...over,
});

/* ───────────────────── 命名规范 ───────────────────── */

test("密钥 account 用命名空间化 key（与 Rust account_for 对齐）", () => {
  assert.equal(AI_APIKEY_ACCOUNT, "ai.apiKey");
});

/* ───────────────────── 一次性迁移 ───────────────────── */

test("旧位置有明文密钥：搬进 keychain，旧位置擦掉，返回搬走的明文", async () => {
  const storage = memoryStorage({
    [AI_CONFIG_KEY]: JSON.stringify(
      CFG({ apiKey: "sk-old-plaintext", model: "deepseek-chat" }),
    ),
  });
  const backend = fakeBackend();

  const migrated = await migratePlaintextApiKey(storage, backend);

  assert.equal(migrated, "sk-old-plaintext");
  assert.deepEqual(backend.calls, [`save:${AI_APIKEY_ACCOUNT}`]);
  const left = JSON.parse(storage.read(AI_CONFIG_KEY)!);
  assert.ok(!("apiKey" in left), "旧位置的 apiKey 字段必须被擦除");
  assert.equal(left.model, "deepseek-chat", "非敏感项原样保留");
});

test("没有明文密钥（新格式或从没配过）：不碰 keychain，返回空串", async () => {
  for (const raw of [
    null,
    JSON.stringify(CFG()),
    "{ 坏 JSON",
    '"字符串不是对象"',
  ]) {
    const storage = memoryStorage(raw === null ? {} : { [AI_CONFIG_KEY]: raw });
    const backend = fakeBackend();
    const migrated = await migratePlaintextApiKey(storage, backend);
    assert.equal(migrated, "");
    assert.deepEqual(backend.calls, [], "不该有无谓的 keychain 调用");
  }
});

test("keychain 写入失败：明文留在旧位置原样不动，绝不弄丢用户密钥", async () => {
  const original = JSON.stringify(CFG({ apiKey: "sk-only-copy" }));
  const storage = memoryStorage({ [AI_CONFIG_KEY]: original });
  const backend = fakeBackend({ failSave: true });

  const migrated = await migratePlaintextApiKey(storage, backend);

  assert.equal(migrated, "");
  assert.equal(
    storage.read(AI_CONFIG_KEY),
    original,
    "写入失败时旧位置必须原样保留",
  );
});

/* ───────────────────── 保存路径 ───────────────────── */

test("保存：密钥只进 keychain，localStorage 里没有 apiKey 字段", async () => {
  const storage = memoryStorage();
  const backend = fakeBackend();

  const ok = await saveAiConfig(
    storage,
    backend,
    CFG({ apiKey: "sk-new", model: "glm-4-flash" }),
  );

  assert.equal(ok, true);
  assert.deepEqual(backend.calls, [`save:${AI_APIKEY_ACCOUNT}`]);
  const stored = JSON.parse(storage.read(AI_CONFIG_KEY)!);
  assert.ok(!("apiKey" in stored), "明文密钥不许落 localStorage");
  assert.equal(stored.model, "glm-4-flash", "非敏感项照常落盘");
});

test("保存空密钥：走删除而不是存空串", async () => {
  const storage = memoryStorage();
  const backend = fakeBackend({ stored: "sk-old" });

  const ok = await saveAiConfig(storage, backend, CFG({ apiKey: "" }));

  assert.equal(ok, true);
  assert.deepEqual(backend.calls, [`remove:${AI_APIKEY_ACCOUNT}`]);
});

test("保存时 keychain 失败：localStorage 保持原样并报失败，密钥不丢", async () => {
  const original = JSON.stringify(CFG({ apiKey: "sk-old-plaintext" }));
  const storage = memoryStorage({ [AI_CONFIG_KEY]: original });
  const backend = fakeBackend({ failSave: true });

  const ok = await saveAiConfig(storage, backend, CFG({ apiKey: "sk-new" }));

  assert.equal(ok, false);
  assert.equal(storage.read(AI_CONFIG_KEY), original);
});

/* ───────────────────── 启动装载 ───────────────────── */

test("启动：非敏感项来自 localStorage，密钥来自 keychain", async () => {
  const storage = memoryStorage({
    [AI_CONFIG_KEY]: JSON.stringify(
      CFG({ model: "moonshot-v1-8k", enabled: false }),
    ),
  });
  const backend = fakeBackend({ stored: "sk-from-keychain" });

  const cfg = await loadAiConfig(storage, backend);

  assert.equal(cfg.apiKey, "sk-from-keychain");
  assert.equal(cfg.model, "moonshot-v1-8k");
  assert.equal(cfg.enabled, false);
  assert.equal(cfg.baseURL, "https://api.openai.com/v1", "缺字段走默认值");
});

test("启动撞上旧明文：迁移成功后直接用搬走的密钥，不再读一次 keychain", async () => {
  const storage = memoryStorage({
    [AI_CONFIG_KEY]: JSON.stringify(
      CFG({ apiKey: "sk-legacy", model: "qwen-turbo" }),
    ),
  });
  const backend = fakeBackend();

  const cfg = await loadAiConfig(storage, backend);

  assert.equal(cfg.apiKey, "sk-legacy");
  assert.ok(
    !backend.calls.includes(`load:${AI_APIKEY_ACCOUNT}`),
    "迁移命中时不该再多一次 load",
  );
  assert.ok(!("apiKey" in JSON.parse(storage.read(AI_CONFIG_KEY)!)));
});

/* ───────────────────── 剥离helper ───────────────────── */

test("withoutApiKey 只摘 apiKey，其余字段一个不少", () => {
  const stripped = withoutApiKey(CFG({ apiKey: "sk-x", provider: "deepseek" }));
  assert.ok(!("apiKey" in stripped));
  assert.equal(stripped.model, "gpt-4o-mini");
  assert.equal(stripped.provider, "deepseek");
});
