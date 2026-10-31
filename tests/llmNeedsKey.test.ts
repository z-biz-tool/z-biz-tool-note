// note 前端「要不要 API Key」判据的契约回归。
//
// ## 为什么要有这条
//
// 后端 `to_cap()` 的免密钥判定走 `LlmConfig::needs_api_key()`：
// ① 选了登记「免 Key」的预设；② 地址落在本机 / 局域网。
// 前端也得判同一件事（密钥框要不要露），否则出现**判据分裂**：
// 后端放行、前端拦下 ⇒ 用户看到「本地网关配了却用不了」，
// 而**没有任何编译错误**能暴露它。
//
// 金标：Rust `cap_llm::is_private_endpoint()` 与 `LlmConfig::needs_api_key()`。
// 共享层 `z-biz-tool-shared/ai` 的 `needsApiKey()` 是它的逐条镜像。
//
// ## 本仓的特别之处：后端没有 provider 字段
//
// `AiConfigPayload` 只带 base_url / api_key / model —— 厂商身份是后端
// `detect_preset()` 按**地址 host** 反查出来的。所以前端也必须按 host 认，
// 否则同一个地址前后端结论相反。
//
// ## 契约
//
// 1. 选了「免 Key」的预设（zbiz-local / ollama）→ 免；
// 2. 选了「要 Key」的预设 → 要，**哪怕地址被改成本机代理**；
// 3. 没匹配到预设（自定义服务）→ 看地址：私网免、公网要。
import { test } from "node:test";
import assert from "node:assert/strict";
import { installHooks } from "./helpers/hooks.ts";

installHooks();

const { findPreset, llmNeedsApiKey } = await import("../src/lib/llmNeedsKey.ts");

type PresetLike = {
  id: string;
  base_url: string;
  requires_api_key: boolean;
  aliases: string[];
};

const preset = (
  id: string,
  requiresApiKey: boolean,
  aliases: string[] = [],
  baseUrl = "http://127.0.0.1:8200/v1",
): PresetLike => ({
  id,
  base_url: baseUrl,
  requires_api_key: requiresApiKey,
  aliases,
});

const PRESETS: PresetLike[] = [
  preset("zbiz-local", false, ["zbiz", "本地网关", "智工栈"]),
  preset("ollama", false, [], "http://localhost:11434"),
  preset("deepseek", true, [], "https://api.deepseek.com/v1"),
];

test("按 provider 认预设：id 与别名都认", () => {
  assert.equal(findPreset(PRESETS, "zbiz-local", "")?.id, "zbiz-local");
  assert.equal(findPreset(PRESETS, "本地网关", "")?.id, "zbiz-local");
});

test("按地址反查预设：按 host 而非整串（与后端 detect_preset 同机制）", () => {
  // 尾斜杠 / `/v1` 后缀不该影响服务身份 —— 整串比较会认不出，
  // 于是前端说「自定义，要 Key」、后端说「zbiz-local，免 Key」。
  assert.equal(
    findPreset(PRESETS, undefined, "http://127.0.0.1:8200/v1")?.id,
    "zbiz-local",
  );
  assert.equal(
    findPreset(PRESETS, undefined, "http://127.0.0.1:8200")?.id,
    "zbiz-local",
  );
  assert.equal(
    findPreset(PRESETS, undefined, "http://localhost:11434/v1")?.id,
    "ollama",
  );
});

test("免 Key 预设：免", () => {
  assert.equal(
    llmNeedsApiKey(PRESETS, "zbiz-local", "http://127.0.0.1:8200/v1"),
    false,
  );
});

test("自定义私网地址：免（用户直接粘 mini 的地址，没选预设）", () => {
  // 这是本次修的核心缺口：此前一律要 Key ⇒ 用户被逼填一个无处可用的密钥。
  assert.equal(
    llmNeedsApiKey(PRESETS, undefined, "http://192.168.31.249:8200/v1"),
    false,
  );
});

test("自定义公网地址：要", () => {
  assert.equal(
    llmNeedsApiKey(PRESETS, undefined, "https://api.openai.com/v1"),
    true,
  );
});

test("选了要 Key 的云厂商：即便地址是本机代理也要", () => {
  // 契约第 2 条的反向约束 —— 放行的话请求会没带鉴权头发出去、拿到 401。
  assert.equal(
    llmNeedsApiKey(PRESETS, "deepseek", "http://127.0.0.1:8200/v1"),
    true,
  );
});

test("阴性对照：同一判据对私网与公网必须给出相反结论", () => {
  // 判据被改成永真时这条立刻红。而恒真的判据会让本地网关用户被静默放行、
  // 公网用户被静默拦下 —— 两种故障都不会有人来报。
  const priv = llmNeedsApiKey(PRESETS, undefined, "http://192.168.31.249:8200/v1");
  const pub = llmNeedsApiKey(PRESETS, undefined, "https://api.openai.com/v1");
  assert.notEqual(priv, pub, "私网与公网必须给出相反结论");
  assert.equal(priv, false);
  assert.equal(pub, true);
});
