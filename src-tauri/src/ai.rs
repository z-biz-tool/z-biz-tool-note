//! note 的 AI 接入 —— cap-llm 的薄封装。
//!
//! ## 为什么要有这个文件
//!
//! 家族里十套 LLM 接入已归并进 `cap-llm`（见该 crate 的 lib.rs 文档），note 的
//! `commands::ai_chat` 是其中一套：自己拼 `/chat/completions`、自己按
//! `\n\n` 切 SSE、自己 `from_utf8_lossy` —— 中文跨 chunk 会出方块，
//! 错误体直接把响应原文塞给用户（key 泄露风险）。
//!
//! 现在 commands 只做「收参数、发事件」，协议、鉴权、解码、脱敏全在 cap-llm。
//! 事件名（`ai-stream://token|done|error`）保持不变，前端零改动。
//!
//! ## provider 识别
//!
//! 前端的 `AIConfig` 只有 base_url / api_key / model 三个字段（provider 名称
//! 只用于设置页展示，不进后端）。这里按 base_url 特征识别协议族：
//! anthropic → Anthropic，generativelanguage → Gemini，:11434/ollama → Ollama，
//! 其余一律 OpenAI 兼容。识别不了**不许猜**：cap-llm 的约定是「配置写 A、
//! 实际打 B」是最难查的故障，所以这里宁可走 Custom + 显式 base_url。

use std::time::Duration;

use cap_llm::{Delta, LlmConfig, Message, ProviderKind};
use serde::Serialize;

use crate::commands::{AiConfigPayload, ChatMessage};

/// 聊天超时。回答可能很长（RAG 会贴整段笔记），60s 不够。
const CHAT_TIMEOUT: Duration = Duration::from_secs(180);

/// 从 base_url 特征识别 provider。
fn detect_provider(base_url: &str) -> ProviderKind {
    let url = base_url.to_ascii_lowercase();
    if url.contains("anthropic") {
        ProviderKind::Anthropic
    } else if url.contains("generativelanguage") || url.contains("gemini") {
        ProviderKind::Gemini
    } else if url.contains(":11434") || url.contains("ollama") {
        ProviderKind::Ollama
    } else {
        // DeepSeek / 通义 / Moonshot / 智谱 / 自建代理……都是 OpenAI 兼容族。
        // Custom 必须显式给 base_url，正好逼着「没填地址」在配置层就报错。
        ProviderKind::Custom
    }
}

/// 按 base_url 反查供应商预设 id（可选）。
///
/// 本仓前端只提交 `base_url` / `api_key` / `model` 三个字段，没有 provider
/// 选择器（provider 名只用于设置页展示）。所以这里反过来用地址找厂商身份：
/// 用户填了 `api.minimaxi.com` 就知道他是 MiniMax，而不是泛泛的「自定义」。
///
/// 用途有两个：
/// 1. 协议判定更准 —— 命中预设时用预设声明的协议族，而不是靠字符串猜；
/// 2. 界面能显示厂商名（而不是「自定义（OpenAI 兼容）」）。
///
/// 只在**协议族兼容**时才采纳预设 —— 红线是不能跨协议族
/// （Anthropic / Gemini / Ollama 互不通用）。
/// `Custom` 与 `OpenAi` / `MiniMax` 同族：它们都是 OpenAI 兼容协议
/// （Bearer + `/chat/completions`），差别只在默认地址与身份标签。
fn detect_preset(base_url: &str) -> Option<&'static str> {
    let url = base_url.trim().to_ascii_lowercase();
    if url.is_empty() {
        return None;
    }
    let kind = detect_provider(base_url);
    cap_llm::preset::PRESETS
        .iter()
        .find(|p| {
            // 按 **host** 匹配，不按整串前缀匹配。
            //
            // 为什么不用前缀：`http://localhost:11434/v1` 用前缀匹配会命中
            // ollama 预设，但填了 `/v1` 意味着用户要的是 **OpenAI 兼容端点**
            // （cap-llm 的约定：`/api/chat` 前面不会有 `/v1`）——
            // 认成 ollama 会让人以为走的是本地原生接口。
            host_of(&url) == host_of(&p.base_url.to_ascii_lowercase())
                && same_protocol_family(p.kind, kind)
        })
        .map(|p| p.id)
}

/// 取 URL 的 host 部分（不含协议与路径）。
///
/// 不引 url crate —— 这个 crate 要保持零额外依赖（见 cap-llm 的依赖约定）。
fn host_of(url: &str) -> &str {
    let rest = url
        .split_once("://")
        .map(|(_, r)| r)
        .unwrap_or(url);
    rest.split(['/', '?', '#']).next().unwrap_or("")
}

/// 两个 provider 身份是否走同一套报文。
fn same_protocol_family(a: ProviderKind, b: ProviderKind) -> bool {
    use cap_llm::ProviderKind as K;
    let fam = |k: K| match k {
        K::OpenAi | K::MiniMax | K::Custom => 0,
        K::Anthropic => 1,
        K::Gemini => 2,
        K::Ollama => 3,
    };
    fam(a) == fam(b)
}

/// 前端配置 → cap-llm 配置。key 为空直接报错，让 UI 去引导配置。
///
/// ## 免密钥的协议族要放行
///
/// 本地 Ollama 根本没有 key（`requires_api_key() == false`）。这里若无条件
/// 要求 key，Ollama 用户会被逼着填一个假密钥 —— 后端不校验它，用户却以为
/// 自己配错了，反过来去查网络。协议族自己知道要不要 key，就按它说的来。
pub fn to_cap(cfg: &AiConfigPayload) -> Result<LlmConfig, String> {
    let kind = detect_provider(&cfg.base_url);
    if cfg.api_key.trim().is_empty() && kind.requires_api_key() {
        return Err("AI 未配置：请先在 设置 → AI 服务商 填写 API Key".to_string());
    }
    if cfg.base_url.trim().is_empty() && cfg.model.trim().is_empty() {
        return Err("AI 配置不完整：base_url 与 model 都为空".to_string());
    }
    Ok(LlmConfig {
        kind,
        base_url: cfg.base_url.clone(),
        api_key: cfg.api_key.clone(),
        model: cfg.model.clone(),
        timeout: CHAT_TIMEOUT,
        preset: detect_preset(&cfg.base_url),
        ..Default::default()
    })
}

/// 角色映射：前端的字符串 role → cap-llm 的枚举。
///
/// 未知 role 不能静默当 user 发出去 —— 那会让「assistant 写了一半」的历史
/// 变成用户提问，模型的回答会跟着跑偏。
fn to_message(m: &ChatMessage) -> Result<Message, String> {
    match m.role.as_str() {
        "system" => Ok(Message::system(&m.content)),
        "user" => Ok(Message::user(&m.content)),
        "assistant" => Ok(Message::assistant(&m.content)),
        other => Err(format!("未知的消息角色: {other}")),
    }
}

fn to_messages(messages: &[ChatMessage]) -> Result<Vec<Message>, String> {
    if messages.is_empty() {
        return Err("消息列表为空".to_string());
    }
    messages.iter().map(to_message).collect()
}

/// 统一错误出口：cap-llm 的错误已经 redact + truncate，这里补上「下一步做什么」。
///
/// ## 为什么把 hint 拼进消息，而不是给 chat 也换成结构化错误
///
/// note 的报错显示在**聊天气泡**里，那里没有表单、没有按钮可点，
/// 用户能做的就是回去改设置。所以这里要把「改哪一项」直接写在错误后面——
/// 只给 `HTTP 401 — {...}` 等于让用户自己去查 401 是什么意思。
///
/// 设置页那种**有控件可聚焦**的场景（取模型 / 测试连接）走结构化 `LlmFailure`，
/// 让界面能把光标送到该改的那一栏。两处分工是刻意的：一处给话，一处给动作。
fn llm_err(e: cap_llm::LlmError) -> String {
    let hint = hint_for(e.kind, e.status);
    format!("{}\n\n{}", e, hint)
}

/* ───────────────────────── 供应商预设（界面用） ───────────────────────── */

/// 给前端的预设视图。只挑界面真正消费的字段 —— 内部枚举一改就炸前端，不划算。
#[derive(Debug, Serialize)]
pub struct PresetView {
    /// 稳定机器标识，写回 `AIConfig.provider` 用。
    pub id: &'static str,
    /// 展示名（中文）。
    pub label: &'static str,
    /// 已填好的服务地址。
    pub base_url: &'static str,
    /// 分组键（international / domestic / aggregator / selfHosted）。
    pub category: &'static str,
    /// 分组展示名。
    pub category_label: &'static str,
    /// 是否需要 API Key。Ollama 这类本地服务不需要，界面要据此收起密钥框。
    pub requires_api_key: bool,
    /// 供搜索的其他写法（英文名、旧称）。
    pub aliases: &'static [&'static str],
    /// 地址核对日期 —— 给用户一个「这条预设是不是很老了」的判断依据。
    pub verified_on: &'static str,
}

fn category_key(c: cap_llm::preset::Category) -> &'static str {
    use cap_llm::preset::Category as C;
    match c {
        C::International => "international",
        C::Domestic => "domestic",
        C::Aggregator => "aggregator",
        C::SelfHosted => "selfHosted",
    }
}

/// 列出可选的供应商预设。
///
/// ## 为什么要有这个命令
///
/// 改造前，`SettingsDialog` 里是 6 个手写按钮，每个按钮同时写死地址**和模型名**
/// （`deepseek-chat` / `glm-4-flash` / `moonshot-v1-8k` / `MiniMax-M3.1-Flash`）。
/// 模型名半年一代，这些名字迟早全部过期，而**界面看起来毫无异常**：
/// 用户点一下、地址填对了、模型名是错的，拿到的是 404 —— 他会以为「这家用不了」。
///
/// 现在预设只给地址与协议，模型名由「获取模型列表」现取（见 [`list_models`]）。
/// 加一家厂商只需改 `cap-llm::presets`，本仓零改动。
pub fn list_llm_presets() -> Vec<PresetView> {
    cap_llm::preset::PRESETS
        .iter()
        .map(|p| PresetView {
            id: p.id,
            label: p.label,
            base_url: p.base_url,
            category: category_key(p.category),
            category_label: p.category.label(),
            requires_api_key: p.requires_api_key,
            aliases: p.aliases,
            verified_on: p.verified_on,
        })
        .collect()
}

/// 明显不是对话模型的模型名前缀。
///
/// `/models` 通常把向量、语音、绘图、重排模型全都列出来。让用户在 200 项里
/// 挑出能聊天的那个，等于把筛选工作推回给人 —— 选错后拿到的是
/// 「model does not support chat」，一句话都看不出是选错了类别。
const NON_CHAT_HINTS: &[&str] = &[
    "embedding",
    "embed",
    "whisper",
    "tts",
    "audio",
    "image",
    "dall-e",
    "rerank",
    "moderation",
    "guard",
    "search-",
    "-search",
    "ocr",
];

/// 按「能不能聊天」给模型名排序：能聊的在前，其余在后。
///
/// 刻意**不删除**非对话模型：有些代理把自定义模型名起得很随意，
/// 一刀切过滤会把「唯一可用的那个」也滤掉。排序而非过滤，最坏只是多滚一下。
fn rank_models(mut models: Vec<String>) -> Vec<String> {
    models.sort_by_key(|m| {
        let lower = m.to_ascii_lowercase();
        let non_chat = NON_CHAT_HINTS.iter().any(|h| lower.contains(h));
        (non_chat, lower.clone())
    });
    models.dedup();
    models
}

/// 该配置可用的模型列表。
///
/// 接受的是**表单里的草稿配置**，不是磁盘上的配置 —— 用户常常是
/// 「填完 key 先点获取模型，满意了才保存」。若这里读磁盘，
/// 用户会看到上一次的旧结果，以为新 key 不能用。
pub async fn list_models(cfg: &AiConfigPayload) -> Result<Vec<String>, LlmFailure> {
    let cap = probe_cap(cfg)?;
    let models = cap_llm::list_models(&cap)
        .await
        .map_err(LlmFailure::from_error)?;
    Ok(rank_models(models))
}

/// 连通性探测：发一个 1 token 的对话，能拿到回复就说明 key / 地址 / 模型三项全对。
///
/// 刻意不用 `/models` 探活：很多自建代理不实现它，用它探活会把
/// 「服务好好的、只是没这个接口」误报成「连不上」。
pub async fn test_connection(cfg: &AiConfigPayload) -> Result<String, LlmFailure> {
    let cap = probe_cap(cfg)?;
    let elapsed = cap_llm::ping(&cap).await.map_err(LlmFailure::from_error)?;
    Ok(format!(
        "连接成功（{} · {} · {} ms）",
        preset_label(&cap),
        cap.model,
        elapsed.as_millis()
    ))
}

/// 探测用配置：比 [`to_cap`] 宽松 —— 允许 model 为空
/// （取模型列表时用户还没选模型，`list_models` 自己会补一个占位值）。
fn probe_cap(cfg: &AiConfigPayload) -> Result<LlmConfig, LlmFailure> {
    let mut cap = to_cap(cfg).map_err(LlmFailure::from)?;
    if cap.model.trim().is_empty() {
        cap.model = "probe".to_string();
    }
    Ok(cap)
}

/// 预设展示名（识别不出来时按协议族给个中性称呼）。
fn preset_label(cap: &LlmConfig) -> &'static str {
    cap.preset
        .and_then(|id| cap_llm::preset::find(id))
        .map(|p| p.label)
        .unwrap_or_else(|| cap.kind.label())
}

/* ───────────────────────── 结构化失败 ───────────────────────── */

/// 给界面的结构化失败。
///
/// ## 为什么不是 `Result<_, String>`
///
/// 字符串错误只能被「读」不能被「判断」。界面要给出的恰恰是判断：
/// 401 该聚焦密钥框、404 该提示地址、429 该说「这不是你的配置问题」。
/// 靠正则去猜 `HTTP 401 — ...` 里的数字，等于把协议塞进文案里，
/// 哪天文案改一个字（比如加个中文破折号），分流就静默失效 ——
/// 而失效的表现是「所有错误都显示同一句话」，没人会当成 bug 报上来。
#[derive(Debug, Serialize)]
pub struct LlmFailure {
    /// 机器可判的类别：notConfigured / network / timeout / http / parse / unsupported / io
    pub kind: &'static str,
    /// HTTP 状态码（仅 kind == "http" 时非空）。
    pub status: Option<u16>,
    /// 原始错误，已脱敏、已按字符截断。给「想知道细节」的用户。
    pub message: String,
    /// 一句话动机 + 一个动作。给「只想让它能用」的用户。
    pub hint: String,
    /// 该动作应该聚焦哪一栏（apiKey / baseUrl / model / none），界面据此送光标。
    pub focus: &'static str,
}

fn kind_key(k: cap_llm::ErrorKind) -> &'static str {
    use cap_llm::ErrorKind as E;
    match k {
        E::NotConfigured => "notConfigured",
        E::Network => "network",
        E::Timeout => "timeout",
        E::Http => "http",
        E::Parse => "parse",
        E::Unsupported => "unsupported",
        E::Io => "io",
    }
}

/// 把类别 + 状态码翻译成「用户下一步该做什么」。
///
/// 每一条都必须指向**一个具体动作**，而不是复述错误。
/// 「请求失败，请重试」这种文案的价值是零 —— 用户已经知道失败了。
fn hint_for(kind: cap_llm::ErrorKind, status: Option<u16>) -> String {
    use cap_llm::ErrorKind as E;
    match (kind, status) {
        (E::NotConfigured, _) => "配置还差一项。请补齐设置 → AI 服务商里空着的字段后重试。".into(),
        (E::Network, _) => {
            "连不上这个地址。国内厂商（DeepSeek / 通义 / Kimi / 智谱 / 豆包）一般直连即可，\
             如果你开了代理，先关掉再试；海外厂商（OpenAI / Gemini / Anthropic）相反，需要代理。"
                .into()
        }
        (E::Timeout, _) => {
            "等太久没等到回应。可能是网络到该地区的链路慢，也可能是模型正在排队。\
             可以先换一个更小的模型试。"
                .into()
        }
        (E::Http, Some(401)) | (E::Http, Some(403)) => {
            "API Key 无效、已过期，或这个 key 没有该模型的权限。请重新粘贴密钥；\
             若刚续费过，确认用的是新 key。"
                .into()
        }
        (E::Http, Some(404)) => {
            "地址或模型名不存在。最常见的原因是 Base URL 多写／少写了一段路径 —— \
             各家都不完全一样（DeepSeek 带 /v1，智谱是 /api/paas/v4，火山是 /api/v3）。\
             在上方重选一次服务商，地址会自动填对。"
                .into()
        }
        (E::Http, Some(429)) => {
            "额度用尽或被限流。这不是配置写错了 —— 换个时段再试，或在服务商后台充值／提额。"
                .into()
        }
        (E::Http, Some(s)) if s >= 500 => "服务商那边出故障了，不是你配置的问题。稍后重试即可。".into(),
        (E::Http, _) => "服务端拒绝了这次请求。原始错误见下方详情。".into(),
        (E::Parse, _) => {
            "对方回了内容，但不是预期的格式。多半是这个地址其实不是该协议的服务 —— \
             例如把 Anthropic 的地址填在了 OpenAI 兼容这一档。"
                .into()
        }
        (E::Unsupported, _) => "这家服务不支持当前操作。换一个厂商，或改用手动填写模型名。".into(),
        (E::Io, _) => "本机读写配置出错。检查配置文件所在目录是否可写。".into(),
    }
}

/// 这个失败该把光标送到哪一栏。
///
/// 分类与 [`hint_for`] 的文案必须一致 —— 文案说「重新粘贴密钥」而光标停在地址栏，
/// 是比不给光标更糟的体验。
fn focus_for(kind: cap_llm::ErrorKind, status: Option<u16>) -> &'static str {
    use cap_llm::ErrorKind as E;
    match (kind, status) {
        (E::NotConfigured, _) => "apiKey",
        (E::Http, Some(401)) | (E::Http, Some(403)) => "apiKey",
        (E::Http, Some(404)) | (E::Parse, _) => "baseUrl",
        (E::Unsupported, _) => "model",
        _ => "none",
    }
}

impl LlmFailure {
    fn from_error(e: cap_llm::LlmError) -> Self {
        Self {
            kind: kind_key(e.kind),
            status: e.status,
            hint: hint_for(e.kind, e.status),
            focus: focus_for(e.kind, e.status),
            message: e.to_string(),
        }
    }
}

impl From<String> for LlmFailure {
    /// `to_cap()` 之类的本地校验失败：没有类别可判，但同样要能显示。
    fn from(message: String) -> Self {
        Self {
            kind: "notConfigured",
            status: None,
            hint: hint_for(cap_llm::ErrorKind::NotConfigured, None),
            focus: "apiKey",
            message,
        }
    }
}

/// 非流式聊天
pub async fn chat(cfg: &AiConfigPayload, messages: &[ChatMessage]) -> Result<String, String> {
    let cap = to_cap(cfg)?;
    let msgs = to_messages(messages)?;
    let reply = cap_llm::chat(&cap, &msgs).await.map_err(llm_err)?;
    Ok(reply.content)
}

/// 流式聊天。`on_token` 在每个文本增量时被调用（调用方负责发事件）。
pub async fn chat_stream<F>(
    cfg: &AiConfigPayload,
    messages: &[ChatMessage],
    mut on_token: F,
) -> Result<String, String>
where
    F: FnMut(&str),
{
    let cap = to_cap(cfg)?;
    let msgs = to_messages(messages)?;
    let reply = cap_llm::chat_stream(&cap, &msgs, |delta| {
        if let Delta::Text(t) = delta {
            on_token(&t);
        }
    })
    .await
    .map_err(llm_err)?;
    Ok(reply.content)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg(base: &str) -> AiConfigPayload {
        AiConfigPayload {
            base_url: base.to_string(),
            api_key: "sk-test".to_string(),
            model: "test-model".to_string(),
        }
    }

    #[test]
    fn provider_detection_by_base_url() {
        assert!(matches!(
            detect_provider("https://api.anthropic.com"),
            ProviderKind::Anthropic
        ));
        assert!(matches!(
            detect_provider("https://generativelanguage.googleapis.com"),
            ProviderKind::Gemini
        ));
        assert!(matches!(
            detect_provider("http://localhost:11434"),
            ProviderKind::Ollama
        ));
        assert!(matches!(
            detect_provider("https://api.deepseek.com/v1"),
            ProviderKind::Custom
        ));
    }

    #[test]
    fn preset_is_detected_from_base_url() {
        // 本仓前端没有 provider 选择器，靠地址反查厂商身份
        assert_eq!(
            detect_preset("https://api.deepseek.com/v1"),
            Some("deepseek")
        );
        assert_eq!(detect_preset("https://api.minimaxi.com/v1"), Some("minimax"));
        assert_eq!(
            detect_preset("https://open.bigmodel.cn/api/paas/v4"),
            Some("zhipu")
        );
        assert_eq!(
            detect_preset("https://dashscope.aliyuncs.com/compatible-mode/v1"),
            Some("qwen")
        );
    }

    #[test]
    fn unknown_or_custom_base_url_has_no_preset() {
        // 自建代理不该被误认成某家厂商
        assert_eq!(detect_preset("https://my-proxy.corp/v1"), None);
        assert_eq!(detect_preset(""), None);
        // 自建 Ollama 代理（端口不同）也不该认成 ollama 预设
        assert_eq!(detect_preset("http://192.168.1.10:11434"), None);
    }

    #[test]
    fn preset_protocol_must_match_the_detected_protocol() {
        // 红线：地址命中预设但协议族不一致时，不采纳预设。
        // 否则会出现「地址是 Anthropic 的、却按 Gemini 协议发」这类静默错路由。
        // anthropic 预设地址 → Anthropic 协议 → 采纳
        assert_eq!(detect_preset("https://api.anthropic.com"), Some("anthropic"));
        // gemini 预设地址 → Gemini 协议 → 采纳
        assert_eq!(
            detect_preset("https://generativelanguage.googleapis.com/v1beta"),
            Some("gemini")
        );
    }

    #[test]
    fn empty_key_is_rejected_before_any_network() {
        let mut c = cfg("https://api.example.com");
        c.api_key = "  ".to_string();
        let err = to_cap(&c).unwrap_err();
        assert!(err.contains("API Key"));
    }

    #[test]
    fn base_url_semantics_are_preserved() {
        // cap-llm 的约定：带不带 /v1 都接受，拼接时补齐。
        // 这里只验证配置透传不丢字段（拼接逻辑由 cap-llm 自己的测试守着）。
        let cap = to_cap(&cfg("https://api.deepseek.com/v1")).unwrap();
        assert_eq!(cap.base_url, "https://api.deepseek.com/v1");
        assert_eq!(cap.model, "test-model");
    }

    #[test]
    fn unknown_role_is_an_error_not_silently_user() {
        let bad = ChatMessage {
            role: "asistant".to_string(),
            content: "hi".to_string(),
        };
        assert!(to_message(&bad).is_err());
        assert!(to_messages(&[bad]).is_err());
    }

    #[test]
    fn empty_messages_rejected() {
        assert!(to_messages(&[]).is_err());
    }

    #[test]
    fn keyless_protocol_does_not_demand_a_key() {
        // 本地 Ollama 没有 key。以前 to_cap 无条件要 key ⇒ 用户被逼填假密钥，
        // 而假密钥后端并不校验，于是「明明能用却提示未配置」。
        let mut c = cfg("http://localhost:11434");
        c.api_key = String::new();
        assert!(to_cap(&c).is_ok(), "Ollama 不该要求 API Key");
        // 需要 key 的协议族仍然要报错（红线：不能为了放行 Ollama 而全线放行）
        let mut c2 = cfg("https://api.deepseek.com/v1");
        c2.api_key = String::new();
        assert!(to_cap(&c2).is_err());
    }

    #[test]
    fn presets_expose_every_field_the_ui_needs() {
        let all = list_llm_presets();
        assert!(all.len() >= 16, "预设不应少于 16 条，实际 {}", all.len());
        for p in &all {
            // 每条都必须有可用地址 —— 这正是预设存在的理由，
            // 空地址等于把「手抄 URL」的活推回给用户。
            assert!(!p.base_url.is_empty(), "{} 缺地址", p.id);
            assert!(!p.label.is_empty(), "{} 缺展示名", p.id);
            assert!(!p.category_label.is_empty(), "{} 缺分组名", p.id);
            assert!(!p.verified_on.is_empty(), "{} 缺核对日期", p.id);
        }
        // 国内厂商必须覆盖到：这是本仓用户最可能买的几家
        for id in ["deepseek", "qwen", "moonshot", "zhipu", "volcengine", "minimax"] {
            assert!(all.iter().any(|p| p.id == id), "缺国内预设 {}", id);
        }
        // Ollama 不需要 key，界面要靠这个字段收起密钥框
        let ollama = all.iter().find(|p| p.id == "ollama").unwrap();
        assert!(!ollama.requires_api_key);
    }

    #[test]
    fn preset_base_urls_are_recognized_back_by_their_own_detector() {
        // 界面把 p.base_url 填进配置后，to_cap 必须还能认出这个厂商身份。
        // 认不出来 = 用户选了 DeepSeek、下次打开显示「自定义」，
        // 更糟的是协议族判定退化成猜。
        for p in list_llm_presets() {
            assert_eq!(
                detect_preset(p.base_url),
                Some(p.id),
                "预设 {} 的地址填回去后认不出自己",
                p.id
            );
        }
    }

    #[test]
    fn rank_models_keeps_everything_but_puts_chat_models_first() {
        let ranked = rank_models(vec![
            "text-embedding-3-large".into(),
            "gpt-4o-mini".into(),
            "whisper-1".into(),
            "deepseek-chat".into(),
            "gpt-4o-mini".into(), // 重复项
        ]);
        // 刻意保留非对话模型：有些代理的自定义模型名很随意，
        // 一刀切过滤会把唯一可用的那个也滤掉。
        assert_eq!(ranked.len(), 4, "重复项应去重，其余一律保留");
        assert!(ranked[0].contains("chat") || ranked[0].contains("4o-mini"));
        assert!(ranked[2..]
            .iter()
            .all(|m| m.contains("embedding") || m.contains("whisper")));
    }

    #[test]
    fn every_failure_hint_tells_the_user_what_to_do() {
        // 文案的最低标准：不是复述错误，而是给出一个动作。
        for kind in [
            cap_llm::ErrorKind::NotConfigured,
            cap_llm::ErrorKind::Network,
            cap_llm::ErrorKind::Timeout,
            cap_llm::ErrorKind::Parse,
            cap_llm::ErrorKind::Unsupported,
            cap_llm::ErrorKind::Io,
        ] {
            let h = hint_for(kind, None);
            assert!(h.chars().count() >= 10, "{:?} 的提示太敷衍：{}", kind, h);
        }
        for status in [401, 403, 404, 429, 500] {
            let h = hint_for(cap_llm::ErrorKind::Http, Some(status));
            assert!(h.chars().count() >= 10, "HTTP {} 的提示太敷衍：{}", status, h);
        }
    }

    #[test]
    fn focus_target_never_contradicts_the_hint() {
        // 文案说「重新粘贴密钥」而光标停在地址栏，比不给光标更糟。
        use cap_llm::ErrorKind as E;
        assert_eq!(focus_for(E::Http, Some(401)), "apiKey");
        assert_eq!(focus_for(E::Http, Some(403)), "apiKey");
        assert_eq!(focus_for(E::NotConfigured, None), "apiKey");
        assert_eq!(focus_for(E::Http, Some(404)), "baseUrl");
        assert_eq!(focus_for(E::Parse, None), "baseUrl");
        assert_eq!(focus_for(E::Unsupported, None), "model");
        // 网络/超时/限流都不是配置写错，不该把用户往表单里推
        assert_eq!(focus_for(E::Network, None), "none");
        assert_eq!(focus_for(E::Timeout, None), "none");
        assert_eq!(focus_for(E::Http, Some(429)), "none");
    }

    #[test]
    fn chat_error_carries_an_action_not_just_a_code() {
        // 聊天气泡里没有表单可点，用户唯一能做的是回设置页改一项 ——
        // 所以 hint 必须直接写在错误文本里。
        let err = cap_llm::LlmError::http(401, "invalid api key");
        let msg = llm_err(err);
        assert!(msg.contains("401"), "原始错误要保留：{}", msg);
        assert!(msg.contains("API Key 无效"), "缺动作提示：{}", msg);
    }
}
