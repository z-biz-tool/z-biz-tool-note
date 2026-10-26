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

/// 前端配置 → cap-llm 配置。key 为空直接报错，让 UI 去引导配置。
pub fn to_cap(cfg: &AiConfigPayload) -> Result<LlmConfig, String> {
    if cfg.api_key.trim().is_empty() {
        return Err("AI 未配置：请先在 设置 → AI 服务商 填写 API Key".to_string());
    }
    if cfg.base_url.trim().is_empty() && cfg.model.trim().is_empty() {
        return Err("AI 配置不完整：base_url 与 model 都为空".to_string());
    }
    Ok(LlmConfig {
        kind: detect_provider(&cfg.base_url),
        base_url: cfg.base_url.clone(),
        api_key: cfg.api_key.clone(),
        model: cfg.model.clone(),
        timeout: CHAT_TIMEOUT,
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

/// 统一错误出口：cap-llm 的错误已经 redact + truncate，这里只转字符串。
fn llm_err(e: cap_llm::LlmError) -> String {
    e.to_string()
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
}
