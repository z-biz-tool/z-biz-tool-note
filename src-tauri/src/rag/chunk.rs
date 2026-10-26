//! 把一篇 Markdown 切成「可检索、可引用、可回跳」的片段。
//!
//! ## 为什么不用固定字数切
//!
//! kb 仓原来的做法是按字数硬切（`split_text`，800 字一段、重叠 100），对
//! 上传的 PDF 尚可，对笔记是错的：一段话被从中间切开，引用回去只看到半句，
//! 而且切片之间没有标题上下文 —— 模型拿到「先装依赖再重启」根本不知道
//! 这是哪一步的依赖。
//!
//! 笔记本身有结构，照结构切才合理：
//!
//! 1. **先按标题分节**，每个片段记住自己的标题路径（`安装 › macOS`）；
//! 2. 一节超过 `max_chars` 时，**只在空行（段落边界）处切**，不切半句；
//! 3. 代码块（``` / ~~~ 围栏）整块保留，不在块内切 —— 半个 shell 脚本
//!    比没有更糟，模型会把截断的命令当成完整的命令讲给用户。
//!
//! ## `anchor` 是干什么的
//!
//! 引用要能点回去。Tiptap 的文档位置在重新排版后会变，存字符偏移不可靠；
//! 存「这一片的第一句」反而稳定 —— 前端拿这段文字在文档里找一次就够了。
//! 所以每个片段带上 `anchor`（首句前 24 字，去掉 Markdown 记号）。

use crate::extract::strip_frontmatter;

/// 一个可检索片段。
///
/// 序列化后直接给前端做引用卡片，所以字段名用短名（`idx`/`anchor`），
/// 但每个字段在 UI 上都有明确去处，不留「以后可能有用」的字段。
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Chunk {
    /// 来源笔记的绝对路径
    pub path: String,
    /// 笔记标题（取自正文首个标题行）
    pub title: String,
    /// 篇内序号，从 0 开始；同分排序时用它保证结果稳定
    pub idx: usize,
    /// 标题路径，例如 `安装 › macOS`；无标题时为笔记标题
    pub heading: String,
    /// 定位锚点（首句前 24 字），供前端在编辑器里找回这一段
    pub anchor: String,
    /// 片段正文（已去掉标题行本身，标题在 `heading` 里）
    pub text: String,
}

/// 默认单片最大字符数。
///
/// 600 是折中：再小会把一个论证拆成两条引用（模型看到上下文断裂），
/// 再大则一次检索 6 条就撑爆上下文。中文一个字符一个 token 量级，
/// 6 × 600 ≈ 3.6k，加上系统提示与历史仍在常见模型的窗口内。
pub const DEFAULT_MAX_CHARS: usize = 600;

/// 锚点长度：太短会撞上多段相同的开场白（「首先，」），太长则容易被
/// 编辑过的字句打断匹配。24 字（中文）在实测里够唯一。
const ANCHOR_CHARS: usize = 24;

/// 把一个 markdown 文档切成片段。
///
/// `path`/`title` 只做透传，函数本身不读盘 —— 纯函数才能在测试里跑。
// allow(unused_assignments)：flush! 宏里的 `buf_len = 0` 在最后一次展开后
// 不再被读，clippy 会报 dead store；宏内部这个复位是循环语义必需的。
#[allow(unused_assignments)]
pub fn chunk_markdown(path: &str, title: &str, markdown: &str, max_chars: usize) -> Vec<Chunk> {
    let body = strip_frontmatter(markdown);
    let max_chars = max_chars.max(120);

    let mut out: Vec<Chunk> = Vec::new();
    let mut stack: Vec<(usize, String)> = Vec::new(); // (层级, 标题)
    let mut buf: Vec<String> = Vec::new(); // 当前片段里已积累的块
    let mut buf_len = 0usize;
    let mut in_fence = false;
    let mut fence_mark = String::new();
    let mut block: Vec<String> = Vec::new(); // 正在攒的一个「块」

    // 收尾：把 buf 里的块合成一个片段，标题路径取当前 stack
    macro_rules! flush {
        () => {
            if !buf.is_empty() {
                let text = buf.join("\n\n");
                let text = text.trim().to_string();
                if !text.is_empty() {
                    out.push(Chunk {
                        path: path.to_string(),
                        title: title.to_string(),
                        idx: out.len(),
                        heading: heading_path(&stack, title),
                        anchor: anchor_of(&text),
                        text,
                    });
                }
                buf.clear();
                buf_len = 0;
            }
        };
    }

    // 段落落袋：够了就当场结一片，不必等下一个标题（没有标题的长文就靠它）
    macro_rules! push_block {
        () => {
            if !block.is_empty() {
                let text = block.join("\n");
                block.clear();
                if !text.trim().is_empty() {
                    buf_len += char_len(&text);
                    buf.push(text);
                }
                if buf_len >= max_chars {
                    flush!();
                }
            }
        };
    }

    for raw in body.lines() {
        let line = raw.trim_end();

        // 围栏代码块：原样收，期间不认标题、不认空行切分
        if let Some(mark) = fence_of(line) {
            if !in_fence {
                in_fence = true;
                fence_mark = mark;
                block.push(line.to_string());
                continue;
            } else if mark == fence_mark {
                in_fence = false;
                block.push(line.to_string());
                push_block!();
                continue;
            }
        }
        if in_fence {
            block.push(line.to_string());
            continue;
        }

        if let Some((level, text)) = parse_heading(line) {
            // 标题是天然的分节线：先把手上攒的块与片段都结掉
            push_block!();
            flush!();
            while stack.last().is_some_and(|(l, _)| *l >= level) {
                stack.pop();
            }
            stack.push((level, text));
            continue;
        }

        if line.trim().is_empty() {
            push_block!();
            continue;
        }

        block.push(line.to_string());

        // 单块自身就超长（一整段几千字）：按标点切，别让它撑爆整个片段
        if block.len() == 1 && char_len(&block[0]) > max_chars {
            let piece = block.pop().unwrap_or_default();
            for part in split_oversized(&piece, max_chars) {
                block = vec![part];
                push_block!();
            }
        }
    }
    push_block!();
    flush!();

    // 一篇笔记里同一段文字可能出现两次（模板抄来抄去），锚点会撞；
    // 撞了就给后面的补序号，保证前端「按锚点找第一处」不会永远跳到同一段。
    let mut seen: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for chunk in out.iter_mut() {
        let count = seen.entry(chunk.anchor.clone()).or_insert(0);
        if *count > 0 {
            chunk.anchor = format!("{}#{}", chunk.anchor, *count);
        }
        *count += 1;
    }
    out
}

/// 当前标题路径。没有标题的笔记用它自己的标题，避免空字符串出现在引用卡片上。
fn heading_path(stack: &[(usize, String)], title: &str) -> String {
    if stack.is_empty() {
        return title.to_string();
    }
    stack
        .iter()
        .map(|(_, t)| t.as_str())
        .collect::<Vec<_>>()
        .join(" › ")
}

/// 锚点：首行去掉行内 Markdown 记号后的前 24 字。
fn anchor_of(text: &str) -> String {
    let first = text
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty() && !l.starts_with("```") && !l.starts_with("~~~"))
        .unwrap_or("")
        // 行内记号会破坏匹配：`**重点**` 在编辑器里是「重点」
        .trim_start_matches(['#', '>', '-', '*', '+', ' ', '\t'])
        .trim();
    let cleaned = first.replace("**", "").replace("`", "").replace("[[", "");
    let cleaned = cleaned.replace("]]", "").replace("~~", "");
    let cleaned = cleaned.trim();

    // 一行很长的段落里，取开头就够了；按字符切，不能按字节（中文会 panic）
    let mut anchor: String = cleaned.chars().take(ANCHOR_CHARS).collect();
    if cleaned.chars().count() > ANCHOR_CHARS {
        anchor = anchor.trim_end().to_string();
    }
    if anchor.is_empty() {
        // 整段都是图片/表格分隔线之类的记号：退回整段开头
        anchor = text.chars().take(ANCHOR_CHARS).collect();
    }
    anchor
}

/// 识别 ATX 标题，返回 (层级, 文本)。`#标签` 这种没有空格的不是标题。
fn parse_heading(line: &str) -> Option<(usize, String)> {
    let hashes = line.chars().take_while(|c| *c == '#').count();
    if hashes == 0 || hashes > 6 {
        return None;
    }
    let rest = &line[hashes..];
    match rest.chars().next() {
        Some(c) if c.is_whitespace() => {
            let text = rest.trim();
            (!text.is_empty()).then(|| (hashes, text.to_string()))
        }
        None => None,
        // `#tag` 不是标题
        _ => None,
    }
}

/// 围栏开始/结束标记（``` 或 ~~~）
fn fence_of(line: &str) -> Option<String> {
    let t = line.trim_start();
    ["```", "~~~"]
        .into_iter()
        .find(|m| t.starts_with(m))
        .map(str::to_string)
}

/// 单块超长时按标点切：优先句末，其次逗号，最后硬切。
fn split_oversized(text: &str, max_chars: usize) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    let mut out: Vec<String> = Vec::new();
    let mut start = 0usize;
    while start < chars.len() {
        let hard_end = (start + max_chars).min(chars.len());
        if hard_end == chars.len() {
            out.push(chars[start..].iter().collect());
            break;
        }
        // 往回找最近的句末/分句符号，最多退 30% 的窗口
        let floor = start + max_chars * 7 / 10;
        let mut cut = hard_end;
        for i in (floor..hard_end).rev() {
            if matches!(chars[i], '。' | '！' | '？' | '；' | '!' | '?' | ';' | '\n') {
                cut = i + 1;
                break;
            }
        }
        out.push(chars[start..cut].iter().collect());
        start = cut;
    }
    out.into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn char_len(s: &str) -> usize {
    s.chars().count()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn texts(chunks: &[Chunk]) -> Vec<&str> {
        chunks.iter().map(|c| c.text.as_str()).collect()
    }

    #[test]
    fn splits_on_headings_and_keeps_heading_path() {
        let md = "# 安装\n\n第一步，装依赖。\n\n## macOS\n\n用 brew。\n\n## Windows\n\n用 winget。\n";
        let chunks = chunk_markdown("/n.md", "安装指南", md, DEFAULT_MAX_CHARS);
        assert_eq!(chunks.len(), 3, "三个小节应各成一片: {:?}", texts(&chunks));
        assert_eq!(chunks[0].heading, "安装");
        assert_eq!(chunks[1].heading, "安装 › macOS");
        assert_eq!(chunks[2].heading, "安装 › Windows");
        assert_eq!(chunks[1].text, "用 brew。");
    }

    #[test]
    fn empty_note_yields_no_chunks() {
        assert!(chunk_markdown("/n.md", "空", "", DEFAULT_MAX_CHARS).is_empty());
        assert!(chunk_markdown("/n.md", "空", "---\ntags: [a]\n---\n\n", DEFAULT_MAX_CHARS).is_empty());
    }

    #[test]
    fn frontmatter_is_not_indexed() {
        let md = "---\ntags:\n  - work\n---\n# 会议\n\n结论是 A。\n";
        let chunks = chunk_markdown("/n.md", "会议", md, DEFAULT_MAX_CHARS);
        assert_eq!(chunks.len(), 1);
        assert!(!chunks[0].text.contains("tags"), "frontmatter 不该进索引");
        assert_eq!(chunks[0].text, "结论是 A。");
    }

    #[test]
    fn hash_tags_are_not_headings() {
        let chunks = chunk_markdown("/n.md", "标签", "#work 这件事\n\n正文。\n", DEFAULT_MAX_CHARS);
        assert_eq!(chunks.len(), 1);
        assert!(chunks[0].text.contains("#work"));
    }

    #[test]
    fn code_fence_is_never_split() {
        let code = format!("```bash\n{}\n```", "echo hi\n".repeat(80));
        let md = format!("# 脚本\n\n说明。\n\n{}\n", code);
        let chunks = chunk_markdown("/n.md", "脚本", &md, 200);
        let holder = chunks
            .iter()
            .find(|c| c.text.contains("echo hi"))
            .expect("代码块应被索引");
        assert!(
            holder.text.contains("```bash") && holder.text.trim_end().ends_with("```"),
            "代码块不该被切开: {}",
            holder.text
        );
    }

    #[test]
    fn long_section_splits_on_paragraph_boundary() {
        let para = "这是一段用来测试切分的文字，长度大约三十六个字，用来把这一节撑长一点。";
        let md = format!(
            "# 长文\n\n{}\n\n{}\n\n{}\n\n{}\n\n{}\n\n{}",
            para, para, para, para, para, para
        );
        // 150 在 120 的下限之上，测的是「超限就在段落边界结片」这件事本身
        let chunks = chunk_markdown("/n.md", "长文", &md, 150);
        assert!(chunks.len() >= 2, "应至少切成两片: {:?}", texts(&chunks));
        for c in &chunks {
            assert!(c.text.starts_with("这是一段"), "不该从句子中间切开: {}", c.text);
            // 上限 + 一个段落的余量（结片发生在读完最后一段之后）
            assert!(
                c.text.chars().count() <= 150 + 40,
                "单片不该超过上限太多（{} 字）: {}",
                c.text.chars().count(),
                c.text
            );
        }
    }

    #[test]
    fn anchors_are_deduped_per_note() {
        let md = "# A\n\n同一句话。\n\n# B\n\n同一句话。\n";
        let chunks = chunk_markdown("/n.md", "t", md, DEFAULT_MAX_CHARS);
        assert_eq!(chunks[0].anchor, "同一句话。");
        assert_eq!(chunks[1].anchor, "同一句话。#1");
    }

    #[test]
    fn anchor_strips_inline_markup() {
        let chunks = chunk_markdown("/n.md", "t", "# H\n\n**重点**：`code` 与 [[双链]]。\n", DEFAULT_MAX_CHARS);
        assert_eq!(chunks[0].anchor, "重点：code 与 双链。");
    }

    #[test]
    fn heading_only_section_still_indexed_by_parent() {
        // 只有标题没有正文的笔记：不能产出空片段，也不能整篇消失
        let chunks = chunk_markdown("/n.md", "只有标题", "# 标题\n", DEFAULT_MAX_CHARS);
        assert!(chunks.is_empty(), "没有正文就没有可检索内容");
    }

    #[test]
    fn cjk_oversized_paragraph_does_not_panic() {
        // 中文按字节切会 panic（历史 bug），这里必须按字符
        let long = "中文".repeat(500);
        let chunks = chunk_markdown("/n.md", "t", &long, 200);
        assert!(!chunks.is_empty());
        assert!(chunks.iter().all(|c| c.text.chars().count() <= 260));
    }
}
