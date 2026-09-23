//! 笔记元数据提取（标题、标签、链接），用于索引与图谱。
//!
//! 这里是全仓唯一一份实现：commands.rs 侧栏摘要、FTS 索引、增量更新都调用本模块，
//! 曾经 commands.rs 自己复制过三个同名私有函数，改一处漏一处。

/// 找到 YAML frontmatter：返回（块内文本, 正文）。
///
/// 只有"首行独占 `---`、后面还有独占的 `---` 闭合行"才算，正文里画的分割线不受影响。
fn split_frontmatter(content: &str) -> Option<(&str, &str)> {
    let body = content.strip_prefix('\u{feff}').unwrap_or(content);
    let first_line_end = body.find('\n').map(|i| i + 1).unwrap_or(body.len());
    if body[..first_line_end].trim_end() != "---" {
        return None;
    }
    let rest = &body[first_line_end..];
    let mut off = 0usize;
    for line in rest.split_inclusive('\n') {
        if line.trim_end() == "---" {
            return Some((&rest[..off], &rest[off + line.len()..]));
        }
        off += line.len();
    }
    None
}

/// 去掉 frontmatter，只留正文（没有 frontmatter 时原样返回）
pub fn strip_frontmatter(content: &str) -> &str {
    split_frontmatter(content).map(|(_, body)| body).unwrap_or(content)
}

/// 提取标题：第一行非空文本，去掉前导 `# `
///
/// frontmatter 要先剥掉：否则一篇以 `---` 开头的笔记，标题就被提成了 `---`，
/// 搜索结果、图谱节点、反链面板上显示的全是 `---`。
pub fn extract_title(content: &str) -> String {
    strip_frontmatter(content)
        .lines()
        .find(|line| !line.trim().is_empty())
        .map(|line| {
            let trimmed = line.trim();
            if trimmed.starts_with("# ") {
                trimmed.trim_start_matches("# ").to_string()
            } else if trimmed.chars().count() > 50 {
                let truncated: String = trimmed.chars().take(50).collect();
                format!("{}...", truncated)
            } else {
                trimmed.to_string()
            }
        })
        .unwrap_or_else(|| "无标题笔记".to_string())
}

/// 提取标签：先看 frontmatter 的 `tags:`，没有再退回正文的 `#tag`。
///
/// 口径跟前端 `lib/frontmatter.ts` 的 extractTagsSmart 一致（编辑器里的 FrontmatterMeta
/// 面板显示的就是那套）。原先这里只认 `#tag`，于是写了 `tags: [reading, work]` 的笔记
/// 在编辑器面板里有标签、侧栏「标签」列表和图谱里却一个都没有。
/// 结果排序：HashSet 的迭代顺序每次运行都不一样，侧栏标签会来回跳，所以固定排一次序。
pub fn extract_tags(content: &str) -> Vec<String> {
    let (block, body) = split_frontmatter(content).unwrap_or(("", content));
    let from_front = frontmatter_tags(block);
    if !from_front.is_empty() {
        return from_front;
    }
    let mut tags = std::collections::HashSet::new();
    for line in body.lines() {
        for word in line.split_whitespace() {
            if word.starts_with('#') && word.len() > 1 {
                let tag = word
                    .trim_start_matches('#')
                    .trim_matches(|c: char| !c.is_alphanumeric() && !('\u{4e00}'..='\u{9fff}').contains(&c))
                    .to_string();
                if !tag.is_empty() && tag.len() < 20 {
                    tags.insert(tag);
                }
            }
        }
    }
    let mut out: Vec<String> = tags.into_iter().collect();
    out.sort();
    out
}

/// frontmatter 里 `tags:` 的三种写法：`tags: [a, b]`、`tags: a`、`tags:` + 后续 `- a` 列表
fn frontmatter_tags(block: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut in_list = false;
    for line in block.lines() {
        let trimmed = line.trim();
        if in_list {
            match trimmed.strip_prefix("- ") {
                Some(item) => {
                    push_tag(&mut out, item);
                    continue;
                }
                None => in_list = false,
            }
        }
        let Some(raw) = trimmed.strip_prefix("tags:") else {
            continue;
        };
        let raw = raw.trim();
        if raw.is_empty() {
            in_list = true;
            continue;
        }
        let inner = raw.trim_start_matches('[').trim_end_matches(']');
        for item in inner.split(',') {
            push_tag(&mut out, item);
        }
    }
    out
}

fn push_tag(out: &mut Vec<String>, raw: &str) {
    let v = raw
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .trim()
        .to_string();
    if !v.is_empty() && !out.contains(&v) {
        out.push(v);
    }
}


/// 提取 `[[link]]` 格式的双向链接
pub fn extract_links(content: &str) -> Vec<String> {
    let mut links = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut i = 0;
    let bytes = content.as_bytes();
    while i < content.len() {
        if bytes[i] == b'[' && i + 1 < content.len() && bytes[i + 1] == b'[' {
            let start = i + 2;
            if let Some(end) = content[start..].find("]]") {
                let raw_link = &content[start..start + end];
                let link = raw_link
                    .split('#')
                    .next()
                    .unwrap_or(raw_link)
                    .trim()
                    .to_string();
                if !link.is_empty() && seen.insert(link.clone()) {
                    links.push(link);
                }
                i = start + end + 2;
                continue;
            }
        }
        i += 1;
    }
    links
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_from_h1() {
        assert_eq!(extract_title("# Hello"), "Hello");
    }

    #[test]
    fn title_from_first_text() {
        assert_eq!(extract_title("Just a note"), "Just a note");
    }

    #[test]
    fn title_empty() {
        assert_eq!(extract_title(""), "无标题笔记");
    }

    #[test]
    fn title_truncates_long() {
        let long = "a".repeat(80);
        let t = extract_title(&long);
        assert!(t.len() <= 53); // 50 chars + "..."
    }

    #[test]
    fn tags_basic() {
        let v = extract_tags("hello #work and #life");
        assert!(v.contains(&"work".to_string()));
        assert!(v.contains(&"life".to_string()));
    }

    #[test]
    fn tags_dedup() {
        let v = extract_tags("#work #work");
        assert_eq!(v.len(), 1);
    }

    #[test]
    fn tags_inline_order_is_stable() {
        // HashSet 迭代顺序不保证稳定，侧栏标签会来回跳；固定排序后两次调用必须一致
        assert_eq!(extract_tags("#b #a #c"), extract_tags("#c #b #a"));
        assert_eq!(extract_tags("#b #a #c"), vec!["a", "b", "c"]);
    }

    #[test]
    fn tags_from_frontmatter_inline_list() {
        assert_eq!(
            extract_tags("---\ntags: [alpha, beta]\n---\n# 标题\n"),
            vec!["alpha", "beta"]
        );
        // 带引号的 YAML 流式写法
        assert_eq!(
            extract_tags("---\ntags: [\"a b\", 'c']\n---\n"),
            vec!["a b", "c"]
        );
    }

    #[test]
    fn tags_from_frontmatter_block_list() {
        let src = "---\ntitle: 年度\naliases: [x, y]\ntags:\n  - reading\n  - work\n---\n正文\n";
        assert_eq!(extract_tags(src), vec!["reading", "work"]);
    }

    #[test]
    fn tags_from_frontmatter_scalar() {
        assert_eq!(extract_tags("---\ntags: reading\n---\n"), vec!["reading"]);
    }

    #[test]
    fn frontmatter_tags_win_over_inline() {
        let v = extract_tags("---\ntags: [only]\n---\n# 正文里的 #tag 不算\n");
        assert_eq!(v, vec!["only"]);
    }

    #[test]
    fn inline_fallback_ignores_frontmatter_comments() {
        // frontmatter 里的 `# …` 是 YAML 注释，不能当标签
        let src = "---\ntitle: x   # 这不是标签\n---\n正文 #work\n";
        assert_eq!(extract_tags(src), vec!["work"]);
    }

    #[test]
    fn title_skips_frontmatter() {
        // 修复前：第一行 `---` 被提成标题，搜索结果和图谱节点上显示的都是 `---`
        assert_eq!(
            extract_title("---\ntags: [a]\n---\n# 真标题\n"),
            "真标题"
        );
        assert_eq!(extract_title("---\ntitle: x\n---\n\n正文开头\n"), "正文开头");
    }

    #[test]
    fn title_keeps_plain_and_hr_content() {
        // 正文中间的 `---`（分割线）不该被当成 frontmatter 开头
        assert_eq!(extract_title("# T\n\n---\n\n分隔线之后\n"), "T");
        // 没有闭合的 --- 就还是普通正文
        assert_eq!(extract_title("---\n没有闭合\n"), "---");
    }

    #[test]
    fn strip_frontmatter_passthrough() {
        assert_eq!(strip_frontmatter("# 无 frontmatter\n"), "# 无 frontmatter\n");
        assert_eq!(strip_frontmatter("---\na: 1\n---\n正文\n"), "正文\n");
    }

    #[test]
    fn links_basic() {
        let v = extract_links("see [[Note A]] and [[Note B#section]]");
        assert_eq!(v, vec!["Note A".to_string(), "Note B".to_string()]);
    }

    #[test]
    fn links_unclosed_ignored() {
        let v = extract_links("oops [[broken");
        assert!(v.is_empty());
    }
}