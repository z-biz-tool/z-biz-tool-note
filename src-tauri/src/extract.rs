//! 笔记元数据提取（标题、标签、链接），用于索引与图谱。
//!
//! 与 commands.rs 中的同名函数保持实现一致；这里独立放置便于未来
//! 在 index.rs / graph.rs 中复用，避免对 commands.rs 产生循环依赖。

/// 提取标题：第一行非空文本，去掉前导 `# `
pub fn extract_title(content: &str) -> String {
    content
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

/// 提取 `#tag` 格式的标签
pub fn extract_tags(content: &str) -> Vec<String> {
    let mut tags = std::collections::HashSet::new();
    for line in content.lines() {
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
    tags.into_iter().collect()
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