/**
 * 「这份 LLM 配置要不要 API Key」—— note 前端侧判据。
 *
 * ## 为什么要有这个文件
 *
 * 后端 `to_cap()`（`src-tauri/src/ai.rs`）的免密钥判定走
 * `LlmConfig::needs_api_key()`：① 选了登记「免 Key」的预设；② 地址落在
 * 本机 / 局域网。
 *
 * 前端也得判同一件事 —— 否则出现**判据分裂**：后端放行、前端却把用户
 * 弹回设置页要一个无处可用的密钥，而**没有任何编译错误**能暴露它。
 * 表现就是「本地网关配了却用不了」。
 *
 * ## 本仓的特别之处：后端没有 provider 字段
 *
 * `AiConfigPayload` 只带 base_url / api_key / model —— 厂商身份是后端
 * `detect_preset()` 按**地址**反查出来的。前端若只按 `ai.provider` 找预设，
 * 就会和后端得出不同结论：同一个地址，前端说「自定义，要 Key」，
 * 后端说「zbiz-local，免 Key」。
 *
 * 所以前端必须镜像后端的**匹配机制**：按 host 匹配，而不是整串相等。
 * 后端用 `host_of()` 取 host 再比 —— 因为 `http://localhost:11434/v1` 与
 * `http://localhost:11434` 是同一个服务，尾斜杠、`/v1` 后缀不该影响身份。
 *
 * ## 金标
 *
 * Rust 侧 `z-biz-tool-capability/crates/cap-llm/src/config.rs` 的
 * `is_private_endpoint()` 与 `LlmConfig::needs_api_key()`。
 * 共享层 `z-biz-tool-shared/ai` 的 `needsApiKey()` / `hostOf()` 是它们的逐条镜像。
 */
// 从 `./ai/endpoint` 而不是 `./ai` 导入：
// `ai` 的 barrel 会拉进 AIManager → zustand，而本仓不依赖 zustand
// （引入它只是为了一个纯函数判据，是不该有的耦合）。
import { hostOf, needsApiKey } from "z-biz-tool-shared/ai/endpoint";

/** 预设的界面视图（与 Rust 侧 `PresetView` 同形，多余字段保持可选）。 */
export interface PresetLike {
  id: string;
  base_url: string;
  requires_api_key: boolean;
  aliases: string[];
  label?: string;
  verified_on?: string;
}

/**
 * 按 id 或别名认出当前配置对应的预设。
 *
 * 后端 `detect_preset()` 只按地址反查（它拿不到 provider 字段），
 * 但前端拿得到 —— 界面选了哪家，用户自己知道，先按 provider 认更准。
 * 认不到再退回按地址反查（老配置里没有 provider 字段）。
 */
export function findPreset<T extends PresetLike>(
  presets: T[],
  provider: string | undefined,
  baseUrl: string,
): T | undefined {
  if (provider) {
    const byProvider = presets.find(
      (p) => p.id === provider || p.aliases.includes(provider),
    );
    if (byProvider) return byProvider;
  }
  // 按地址反查：**按 host**，与后端 `detect_preset()` 同机制。
  const host = hostOf(baseUrl);
  if (!host) return undefined;
  return presets.find((p) => hostOf(p.base_url) === host);
}

/**
 * 这份配置要不要 API Key。
 *
 * 与后端 `LlmConfig::needs_api_key()` 严格同序：
 *
 * 1. 匹配到预设 → 按预设的 `requires_api_key`（用户显式选的厂商优先于地址猜测；
 *    哪怕地址被改成本机代理，只要预设登记了「要 Key」就仍然要）；
 * 2. 没匹配到预设（自定义服务）→ 看地址：私网免、公网要。
 */
export function llmNeedsApiKey(
  presets: PresetLike[],
  provider: string | undefined,
  baseUrl: string,
): boolean {
  const preset = findPreset(presets, provider, baseUrl);
  return needsApiKey(
    preset ? preset.requires_api_key : undefined,
    baseUrl,
  );
}
