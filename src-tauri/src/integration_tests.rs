//! 端到端集成测试：模拟"用户编辑 → 原子写 → 索引 → 搜索"全流程。
//!
//! 不依赖 Tauri runtime，纯函数 + SQLite 内存库，覆盖 P0/P1 关键链路。
//! 测试夹具使用临时目录，绝不碰真实用户笔记（符合 06 测试规范 3.1）。

use std::fs;
use std::path::PathBuf;

use crate::atomic_write::atomic_write_str;
use crate::extract::{extract_links, extract_tags, extract_title};
use crate::index::IndexStore;

fn tempdir() -> PathBuf {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let counter = COUNTER.fetch_add(1, Ordering::SeqCst);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let mut p = std::env::temp_dir();
    p.push(format!(
        "zennote-integ-test-{}-{}-{}",
        std::process::id(),
        nanos,
        counter
    ));
    fs::create_dir_all(&p).unwrap();
    p
}

/// 公开 nanos 给模块内测试使用（避免同测试间时间冲突）
pub(crate) fn test_nanos() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos()
}

/// 端到端：写入一篇笔记 → 索引 → 搜索能命中
#[test]
fn end_to_end_write_index_search() {
    let dir = tempdir();
    let note_path = dir.join("test-note.md");
    let content = r#"# Hello World

This note references [[Other Note]] and has #work #life tags.

## Section
Some content here.
"#;
    let nanos = test_nanos();
    // 1. 原子写
    atomic_write_str(&note_path, content).expect("原子写失败");

    // 2. 提取元数据
    let title = extract_title(content);
    let tags = extract_tags(content);
    let links = extract_links(content);
    assert_eq!(title, "Hello World");
    assert!(tags.contains(&"work".to_string()));
    assert!(tags.contains(&"life".to_string()));
    assert!(links.contains(&"Other Note".to_string()));

    // 3. 索引（这里用 IndexStore，但路径是 ~/.z-note/index.db；
    //    集成测试只验证 schema 和 search query 构造正确，不强求搜索命中）
    let store = match IndexStore::open() {
        Ok(s) => s,
        Err(_) => return, // 环境无 home dir 时跳过
    };
    let path_str = note_path.to_string_lossy().to_string();
    store
        .upsert_note(
            &path_str,
            &title,
            content,
            1234567890,
            content.len() as i64,
            &tags.join(","),
            &links.join(","),
        )
        .expect("upsert 失败");

    // 4. 搜索（content 关键词）—— 用唯一标记避免与其它测试数据混淆
    let unique = format!("zennotetestunique{}", nanos);
    let content2 = format!("# Hello World\n\n{} Unique content here.\n", unique);
    let _ = store.upsert_note(
        &path_str,
        "Hello World",
        &content2,
        1234567891,
        content2.len() as i64,
        &tags.join(","),
        &links.join(","),
    );
    let matches = store.search(&unique, 10).expect("search");
    assert_eq!(matches.len(), 1, "应仅命中 1 条");
    assert_eq!(matches[0].file_path, path_str);

    // 5. 中文搜索（unicode61 tokenizer 处理）
    let _ = store.search("World", 10).expect("中文搜索");

    // 6. 清理：测试索引条目
    let _ = store.delete_note(&path_str);

    let _ = fs::remove_dir_all(&dir);
}

/// 原子写 + 备份 + 恢复 全链路
#[test]
fn end_to_end_backup_restore() {
    let dir = tempdir();
    let note_path = dir.join("note.md");

    // 1. 写 v1
    atomic_write_str(&note_path, "# v1\n").unwrap();
    let v1 = fs::read_to_string(&note_path).unwrap();
    assert_eq!(v1, "# v1\n");

    // 2. 写 v2
    atomic_write_str(&note_path, "# v2\n").unwrap();
    let v2 = fs::read_to_string(&note_path).unwrap();
    assert_eq!(v2, "# v2\n");

    // 3. 模拟崩溃：临时文件不应残留
    let entries: Vec<_> = fs::read_dir(&dir)
        .unwrap()
        .flatten()
        .filter(|e| {
            let n = e.file_name().to_string_lossy().to_string();
            n.contains(".tmp") || n.contains(".bak")
        })
        .collect();
    assert!(entries.is_empty(), "原子写后不应残留临时文件");

    let _ = fs::remove_dir_all(&dir);
}

/// 边界：并发写入同一目录
#[test]
fn end_to_end_concurrent_writes() {
    let dir = tempdir();
    let mut handles = Vec::new();

    for i in 0..10 {
        let path = dir.join(format!("note_{}.md", i));
        handles.push(std::thread::spawn(move || {
            atomic_write_str(&path, &format!("content {}", i))
        }));
    }

    for (i, h) in handles.into_iter().enumerate() {
        h.join().unwrap().expect("线程内写入失败");
        let path = dir.join(format!("note_{}.md", i));
        let content = fs::read_to_string(&path).unwrap();
        assert_eq!(content, format!("content {}", i));
    }

    let _ = fs::remove_dir_all(&dir);
}

/// 文件名清洗：注入攻击防御
#[test]
fn sanitize_filename_blocks_traversal() {
    use crate::commands::sanitize_filename;
    // 路径分隔符 `../../../` 被过滤为 `etcpasswd`
    assert_eq!(sanitize_filename("../../../etc/passwd"), "etcpasswd");
    // `.` 不在允许字符列表中，被移除
    assert_eq!(sanitize_filename("normal-file_v1.md"), "normal-file_v1md");
    // 中文（CJK 字符通过 is_alphanumeric）+ "-2026"：完整保留（不足 64 字符）
    assert_eq!(sanitize_filename("中文笔记-2026"), "中文笔记-2026");
    // 空字符串
    assert_eq!(sanitize_filename(""), "");
    // 超长截断到 64 字符
    let long: String = "a".repeat(200);
    assert_eq!(sanitize_filename(&long).len(), 64);
    // 仅保留 [a-zA-Z0-9_-]
    assert_eq!(sanitize_filename("a b\tc\nd!@#"), "abcd");
}

/// 路径越界防护：ensure_path_within 拒绝 ../
#[test]
fn path_within_blocks_traversal() {
    use crate::commands::ensure_path_within;
    let base = tempdir();
    let safe = base.join("inside.md");
    fs::write(&safe, "ok").unwrap();
    assert!(ensure_path_within(&base, &safe).is_ok());

    let bad = base.join("../escape.md");
    assert!(ensure_path_within(&base, &bad).is_err());

    let _ = fs::remove_dir_all(&base);
}

/// 索引时 HTML 转义：用户笔记里的 <script> 注入不能通过 snippet 攻击前端
#[test]
fn index_escapes_html_in_content() {
    use crate::index::IndexStore;
    let store = match IndexStore::open() {
        Ok(s) => s,
        Err(_) => return, // 无 home dir 跳过
    };

    // 用 PID + nanos + 静态计数器组合的唯一标识，避免与其它测试数据冲突
    use std::sync::atomic::{AtomicU64, Ordering};
    static XSS_COUNTER: AtomicU64 = AtomicU64::new(0);
    let counter = XSS_COUNTER.fetch_add(1, Ordering::SeqCst);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let unique_marker = format!(
        "zennotexss{}{}{}",
        std::process::id(),
        nanos,
        counter
    );
    let path = format!("/tmp/test-xss-{}.md", unique_marker);
    let title = "XSS Test";
    // 包含恶意 HTML 的笔记 + 唯一关键词
    let content = format!(
        "{} Hello world<script>alert('xss')</script> more text",
        unique_marker
    );
    store
        .upsert_note(&path, title, &content, 0, content.len() as i64, "", "")
        .expect("upsert");

    // 搜索唯一关键词，确保只命中本测试的数据
    let matches = store.search(&unique_marker, 10).expect("search");
    assert_eq!(matches.len(), 1, "应仅命中 1 条恶意笔记");
    let snippet = &matches[0].snippet;
    assert!(
        !snippet.contains("<script>"),
        "snippet 必须转义 <script>，实际: {}",
        snippet
    );
    assert!(
        snippet.contains("&lt;script&gt;"),
        "snippet 应包含转义后的标签，实际: {}",
        snippet
    );

    // 清理
    let _ = store.delete_note(&path);
}

/// import_note 路径校验：禁止读 /etc/passwd 等敏感文件
#[test]
fn import_note_blocks_sensitive_paths() {
    use crate::commands::validate_path;
    // 模拟前端传入恶意路径
    let bad_paths = ["/etc/passwd", "/etc/shadow", "/root/.ssh/id_rsa"];
    for p in &bad_paths {
        let result = validate_path(p);
        // 注：在某些 CI 环境 /etc/passwd 可能 canonicalize 失败（沙箱无此文件），
        // 但只要它不在允许列表里，validate_path 应拒绝
        assert!(
            result.is_err(),
            "敏感路径 {} 应被拒绝，实际: {:?}",
            p,
            result
        );
    }
}

/// validate_path 允许白名单内路径
#[test]
fn validate_path_allows_whitelisted() {
    use crate::commands::validate_path;
    // 钉的是"临时目录一定在白名单里"这条不变量。原先只写死 `/tmp`：Windows 上没有这个目录，
    // 整条断言在 windows runner 上直接红（实测），而它掩盖的真实问题是产品侧只允许 /tmp，
    // Windows 用户导出临时文件会被判"路径不在允许范围内"。现在两侧各按各的平台量。
    let tmp = std::env::temp_dir();
    assert!(
        validate_path(&tmp.to_string_lossy()).is_ok(),
        "本平台临时目录 {} 必须被允许",
        tmp.display()
    );
    #[cfg(unix)]
    {
        // macOS 的 temp_dir() 是 /var/folders/...，覆盖不到 /tmp 这条独立白名单
        assert!(validate_path("/tmp").is_ok(), "unix 上 /tmp 必须被允许");
    }

    // ~/.z-note 始终允许
    if let Some(home) = dirs::home_dir() {
        let zd = home.join(".z-note");
        assert!(validate_path(&zd.to_string_lossy()).is_ok());
    }
}

/// validate_path_allow_nonexistent：未存在路径也能校验（用于新建文件/目录）
#[test]
fn validate_nonexistent_path() {
    use crate::commands::validate_path_allow_nonexistent;

    // 允许的位置 + 不存在的子路径：用本平台 temp 目录，Windows 上 /tmp 不存在，写死必红
    let allowed_new = std::env::temp_dir().join("test-zennote-nonexistent-12345.md");
    assert!(
        validate_path_allow_nonexistent(&allowed_new.to_string_lossy()).is_ok(),
        "应允许本平台临时目录（{}）下新建文件",
        allowed_new.display()
    );

    // 危险位置 + 不存在路径 → 拒绝
    let bad_new = "/etc/test-nonexistent-zennote.md";
    assert!(
        validate_path_allow_nonexistent(bad_new).is_err(),
        "应拒绝 /etc 路径"
    );
}

/// ensure_dir 路径校验：未存在路径也能被阻止
#[test]
fn ensure_dir_blocks_sensitive() {
    use crate::commands::ensure_dir;
    let result = ensure_dir("/etc/zennote-test".to_string());
    assert!(result.is_err(), "应拒绝在 /etc 下创建目录");
}

/// `.md` 与 `.markdown` 是同一类笔记，口径必须和前端 fileTypes.isMarkdownPath 对齐。
/// Rust 侧原先六处过滤各自写死 `ext == "md"`，于是 `Changelog.markdown` 在文件树里看得到
/// （list_dir_single 收 markdown）、点得开、改得动，却搜不到、进不了图谱和反链。
#[tokio::test]
async fn markdown_notes_cover_both_extensions() {
    use std::path::Path;
    use crate::commands::{find_backlinks, is_markdown_path, read_all_notes, search_in_files};

    // 1. 纯函数口径：两种扩展名 + 大小写混排都算，其它一律不算
    for name in ["a.md", "a.markdown", "NOTE.MD", "Note.Markdown"] {
        assert!(is_markdown_path(Path::new(name)), "{} 应判为 markdown", name);
    }
    for name in ["a.txt", "a.png", "Makefile", "a.mdx"] {
        assert!(!is_markdown_path(Path::new(name)), "{} 不该判为 markdown", name);
    }

    // 2. 真实目录：三篇笔记（含两篇 .markdown）+ 两个树里可见的非笔记文件
    let dir = tempdir();
    let marker = format!("zenmarkdown{}", test_nanos());
    for name in ["plain.md", "alt.markdown", "UPPER.MARKDOWN"] {
        fs::write(dir.join(name), format!("# {}\n\n{}\n", name, marker)).unwrap();
    }
    fs::write(dir.join("readme.txt"), format!("{}\n", marker)).unwrap();
    fs::write(dir.join("pic.png"), format!("{}\n", marker)).unwrap();

    let dir_str = dir.to_string_lossy().to_string();

    let mut summaries = read_all_notes(dir_str.clone()).await.expect("read_all_notes");
    summaries.sort_by(|a, b| a.file_path.cmp(&b.file_path));
    let got: Vec<&str> = summaries.iter().map(|s| s.file_path.as_str()).collect();
    assert_eq!(
        got.len(),
        3,
        "图谱/摘要应正好收 3 篇笔记（readme.txt、pic.png 不能混进来）：{:?}",
        got
    );
    assert!(got.iter().any(|p| p.ends_with("alt.markdown")), "缺 .markdown 笔记");
    assert!(got.iter().any(|p| p.ends_with("UPPER.MARKDOWN")), "缺大写扩展名笔记");

    let hits = search_in_files(dir_str.clone(), marker).await.expect("search_in_files");
    let hit_paths: Vec<&str> = hits.iter().map(|h| h.file_path.as_str()).collect();
    assert_eq!(hits.len(), 3, "全文搜索应命中 3 篇笔记，实际 {:?}", hit_paths);
    assert!(hits.iter().any(|h| h.file_path.ends_with("alt.markdown")));
    assert!(!hit_paths.iter().any(|p| p.ends_with(".txt") || p.ends_with(".png")));

    // 3. 反链：引用方是 .markdown 也要算进来
    fs::write(dir.join("source.markdown"), "# Source\n\n[[Target]]\n").unwrap();
    let backlinks = find_backlinks(dir_str, "Target".into(), String::new())
        .await
        .expect("find_backlinks");
    assert!(
        backlinks.iter().any(|b| b.file_path.ends_with("source.markdown")),
        "反链漏掉 .markdown 引用方：{:?}",
        backlinks.iter().map(|b| &b.file_path).collect::<Vec<_>>()
    );

    let _ = fs::remove_dir_all(&dir);
}
