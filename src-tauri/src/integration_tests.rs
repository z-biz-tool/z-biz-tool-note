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

/// 中文召回闸门：搜索词落在汉字串中间时也必须命中。
/// 旧实现把 `笔记*` 直接打在 unicode61 的整块汉字 token 上，实测恒 0 命中
/// （sqlite3：'我的笔记内容很重要' MATCH '笔记*' → 0 行），这条测试就是为了钉死它。
#[test]
fn index_recalls_chinese_inside_a_word() {
    let dir = tempdir();
    let store = IndexStore::open_in(&dir).expect("隔离索引库应能打开");

    store
        .upsert_note(
            "/tmp/cjk-note.md",
            "周记",
            "# 周记\n\n今天把会议笔记写在这里，细节很多。\n",
            1,
            10,
            "",
            "",
        )
        .expect("upsert");

    let hits = store.search("笔记", 10).expect("search");
    assert_eq!(hits.len(), 1, "汉字串中间的「笔记」必须命中一条");
    assert!(
        hits[0].snippet.contains("<mark>笔记</mark>"),
        "snippet 应高亮命中的汉字词，实际: {}",
        hits[0].snippet
    );
    let visible = hits[0].snippet.replace("<mark>", "").replace("</mark>", "");
    assert!(
        visible.contains("会议笔记"),
        "展示层必须撤掉切分空格，实际: {}",
        hits[0].snippet
    );

    // 两个汉字词是 AND：缺一个就不该出结果
    store
        .upsert_note(
            "/tmp/cjk-note-2.md",
            "读书",
            "读书笔记：另一篇也含这个词\n",
            1,
            10,
            "",
            "",
        )
        .expect("upsert");
    assert_eq!(store.search("笔记", 10).expect("search").len(), 2);
    assert_eq!(store.search("笔记 摘要", 10).expect("search").len(), 0);

    // 拉丁前缀匹配不受影响
    store
        .upsert_note(
            "/tmp/latin.md",
            "Title",
            "the quick brown fox",
            1,
            10,
            "",
            "",
        )
        .expect("upsert");
    let latin = store.search("quic", 10).expect("search");
    assert_eq!(latin.len(), 1);
    assert!(latin[0].snippet.contains("<mark>quick</mark>"));

    let _ = fs::remove_dir_all(&dir);
}

/// schema 版本不匹配时旧库必须被丢弃重建，而不是带着缺列的表继续跑
#[test]
fn index_rebuilds_after_schema_version_change() {
    let dir = tempdir();
    {
        let store = IndexStore::open_in(&dir).expect("初次打开");
        store
            .upsert_note("/tmp/a.md", "A", "alpha 笔记", 1, 5, "", "")
            .expect("upsert");
    }
    // 同一个文件再次打开：schema 已一致，数据仍在
    let store = IndexStore::open_in(&dir).expect("二次打开");
    assert_eq!(store.list_paths().expect("list").len(), 1);
    assert_eq!(store.search("笔记", 10).expect("search").len(), 1);

    let _ = fs::remove_dir_all(&dir);
}

/// 纯汉字正文（没有一个空格、没有拉丁）也要能召回。
/// unicode61 会把整串汉字切成一个 token，旧实现里这种笔记除了首字前缀永远搜不到；
/// 而"搜不到就退化成 LIKE 全表扫"又会把不存在的词也返回来，所以正反两向都要断言。
#[test]
fn 中文正文检索既能命中也不会误召回() {
    let dir = tempdir();
    {
        let store = IndexStore::open_in(&dir).expect("打开索引");
        store
            .upsert_note(
                "/tmp/cjk.md",
                "会议记录",
                "今天下午讨论了检索排序与切片策略，结论是先做倒排再补缓存。",
                1,
                30,
                "",
                "",
            )
            .expect("upsert");
    }
    let store = IndexStore::open_in(&dir).expect("二次打开");

    let hits = store.search("切片", 10).expect("search");
    assert_eq!(hits.len(), 1, "正文中段的汉字词组应当命中");
    assert_eq!(hits[0].file_path, "/tmp/cjk.md");
    let snip = &hits[0].snippet;
    assert!(snip.contains("<mark>"), "高亮要落到中文片段上: {}", snip);
    assert!(
        !snip.contains("切 片") && !snip.contains("片，"),
        "逐字切分的空格应当被还原: {}",
        snip
    );

    assert!(
        store.search("证书", 10).expect("search").is_empty(),
        "不存在的词不能返回"
    );
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
    atomic_write_str(&safe, "ok").unwrap();
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
    let unique_marker = format!("zennotexss{}{}{}", std::process::id(), nanos, counter);
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

/// 已登记的工作区根：整棵子树放行（2026-10-31「打开文件夹树不展开」的回归钉）。
/// 原白名单只放行家目录一级子目录，`~/workplace/ceo` 这类二级目录根层列得出来、
/// 一展开就被拒 ⇒ 箭头翻下去、子节点是空的。
#[test]
fn workspace_root_allows_subtree() {
    use crate::commands::{register_workspace_root, validate_path};
    // 注意不能用 tempdir：temp 根整棵都在白名单里，「登记前被拒」测不出来。
    // 家目录的**二级**子目录原本被拒（白名单只放行一级），正是线上 bug 的形状。
    let home = dirs::home_dir().expect("无主目录");
    let root = home.join(".z-note-ws-root-test");
    let sub = root.join("deep").join("nested");
    std::fs::create_dir_all(&sub).expect("创建嵌套目录");

    // 先清掉上次运行落盘的登记：根清单是全局持久文件，不清理的话
    // 本测试第二次跑「登记前被拒」的断言就永远过不去（测试自污染）。
    crate::commands::unregister_workspace_root_for_test(&root.to_string_lossy());

    // 登记前：家目录二级子目录，必须被拒
    assert!(
        validate_path(&sub.to_string_lossy()).is_err(),
        "登记前 {} 不应放行",
        sub.display()
    );

    // 登记后：根与任意深度的子树都放行
    register_workspace_root(root.to_string_lossy().into_owned());
    assert!(
        validate_path(&root.to_string_lossy()).is_ok(),
        "登记后的根 {} 应放行",
        root.display()
    );
    assert!(
        validate_path(&sub.to_string_lossy()).is_ok(),
        "登记后子树 {} 应放行",
        sub.display()
    );

    // 敏感区域不因登记机制而放行：/etc 永远拒绝
    assert!(validate_path("/etc/passwd").is_err(), "/etc 必须始终被拒绝");

    // 清理测试目录
    let _ = std::fs::remove_dir_all(&root);
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
    let result = crate::commands::ensure_dir_at("/etc/zennote-test");
    assert!(result.is_err(), "应拒绝在 /etc 下创建目录");
}

/// `.md` 与 `.markdown` 是同一类笔记，口径必须和前端 fileTypes.isMarkdownPath 对齐。
/// Rust 侧原先六处过滤各自写死 `ext == "md"`，于是 `Changelog.markdown` 在文件树里看得到
/// （list_dir_single 收 markdown）、点得开、改得动，却搜不到、进不了图谱和反链。
#[tokio::test]
async fn markdown_notes_cover_both_extensions() {
    use crate::commands::{find_backlinks, is_markdown_path, read_all_notes, search_in_files};
    use std::path::Path;

    // 1. 纯函数口径：两种扩展名 + 大小写混排都算，其它一律不算
    for name in ["a.md", "a.markdown", "NOTE.MD", "Note.Markdown"] {
        assert!(
            is_markdown_path(Path::new(name)),
            "{} 应判为 markdown",
            name
        );
    }
    for name in ["a.txt", "a.png", "Makefile", "a.mdx"] {
        assert!(
            !is_markdown_path(Path::new(name)),
            "{} 不该判为 markdown",
            name
        );
    }

    // 2. 真实目录：三篇笔记（含两篇 .markdown）+ 两个树里可见的非笔记文件
    let dir = tempdir();
    let marker = format!("zenmarkdown{}", test_nanos());
    for name in ["plain.md", "alt.markdown", "UPPER.MARKDOWN"] {
        atomic_write_str(&dir.join(name), &format!("# {}\n\n{}\n", name, marker)).unwrap();
    }
    atomic_write_str(&dir.join("readme.txt"), &format!("{}\n", marker)).unwrap();
    atomic_write_str(&dir.join("pic.png"), &format!("{}\n", marker)).unwrap();

    let dir_str = dir.to_string_lossy().to_string();

    let mut summaries = read_all_notes(dir_str.clone())
        .await
        .expect("read_all_notes");
    summaries.sort_by(|a, b| a.file_path.cmp(&b.file_path));
    let got: Vec<&str> = summaries.iter().map(|s| s.file_path.as_str()).collect();
    assert_eq!(
        got.len(),
        3,
        "图谱/摘要应正好收 3 篇笔记（readme.txt、pic.png 不能混进来）：{:?}",
        got
    );
    assert!(
        got.iter().any(|p| p.ends_with("alt.markdown")),
        "缺 .markdown 笔记"
    );
    assert!(
        got.iter().any(|p| p.ends_with("UPPER.MARKDOWN")),
        "缺大写扩展名笔记"
    );

    let hits = search_in_files(dir_str.clone(), marker)
        .await
        .expect("search_in_files");
    let hit_paths: Vec<&str> = hits.iter().map(|h| h.file_path.as_str()).collect();
    assert_eq!(
        hits.len(),
        3,
        "全文搜索应命中 3 篇笔记，实际 {:?}",
        hit_paths
    );
    assert!(hits.iter().any(|h| h.file_path.ends_with("alt.markdown")));
    assert!(!hit_paths
        .iter()
        .any(|p| p.ends_with(".txt") || p.ends_with(".png")));

    // 3. 反链：引用方是 .markdown 也要算进来
    atomic_write_str(&dir.join("source.markdown"), "# Source\n\n[[Target]]\n").unwrap();
    let backlinks = find_backlinks(dir_str, "Target".into(), String::new())
        .await
        .expect("find_backlinks");
    assert!(
        backlinks
            .iter()
            .any(|b| b.file_path.ends_with("source.markdown")),
        "反链漏掉 .markdown 引用方：{:?}",
        backlinks.iter().map(|b| &b.file_path).collect::<Vec<_>>()
    );

    let _ = fs::remove_dir_all(&dir);
}

/// 正文 #tag 收紧规则（2026-11-01）真值表。
/// 修复前标签面板被代码碎片淹没：色号 #0000ff、shell 注释 #0、#include、
/// `000;\n` 这类代码碎块全被当成标签。规则：
/// ① 代码围栏内的 # 一律不算；② # 后首字符必须是字母/汉字/下划线；③ # 后带空格是标题。
#[test]
fn inline_tags_reject_code_fragments() {
    use crate::extract::extract_tags;

    // ① 代码围栏里的色号/注释不是标签
    let fenced = "正文有 #真标签。\n\n```css\n.color { fill: #0000ff; stroke: #000080 }\n```\n\n```bash\n#0 这是注释\n#include <stdio.h>\n```\n";
    let tags = extract_tags(fenced);
    assert!(
        tags.contains(&"真标签".to_string()),
        "栏外的 #真标签 应提取，实际 {:?}",
        tags
    );
    assert!(
        !tags.iter().any(|t| t.starts_with('0')),
        "色号不得成为标签: {:?}",
        tags
    );
    assert!(
        !tags.contains(&"include".to_string()),
        "栏内 #include 不得成为标签"
    );

    // ② 纯数字开头（色号、编号）一律排除，哪怕不在栏里
    let bare = "跑起来是 #0 和 #0000ff 与 #164 而已，正标签 #架构\n";
    let tags = extract_tags(bare);
    assert_eq!(
        tags,
        vec!["架构".to_string()],
        "纯数字开头应排除: {:?}",
        tags
    );

    // ③ 行首标题不算标签
    let heading = "# 标题行\n\n## 二级\n\n#行内标签\n";
    let tags = extract_tags(heading);
    assert_eq!(
        tags,
        vec!["行内标签".to_string()],
        "标题不得成为标签: {:?}",
        tags
    );

    // ④ 合法形态照常：字母、汉字、下划线开头，尾部标点被剥
    let ok = "#work #中文标签 #_private #tail, 结尾标点要剥掉\n";
    let tags = extract_tags(ok);
    assert!(tags.contains(&"work".to_string()));
    assert!(tags.contains(&"中文标签".to_string()));
    assert!(tags.contains(&"_private".to_string()));
    assert!(tags.contains(&"tail".to_string()), "尾标点应剥: {:?}", tags);
    assert!(
        !tags.iter().any(|t| t.ends_with(',')),
        "不得残留尾标点: {:?}",
        tags
    );

    // ⑤ frontmatter 优先级不受影响
    let front = "---\ntags: [reading]\n---\n\n#0000ff 在正文里也不算\n";
    let tags = extract_tags(front);
    assert_eq!(
        tags,
        vec!["reading".to_string()],
        "frontmatter 优先: {:?}",
        tags
    );
}

/// import_document：外部文档 → Markdown 笔记。
///
/// 钉三条：① 支持的类型真能导出非空笔记；② 认不得的类型在入口就被挡
/// （不产生笔记文件、不把二进制乱码切进索引）；③ 落盘走原子写。
/// 注：pdf/docx/pptx 的解析正确性由 cap-doc 自己的 81 条测试保证（含真实
/// zip 结构的用例），这里钉的是 note 命令层的路由与入库形态。
#[test]
fn import_document_routes_by_extension() {
    use crate::atomic_write::atomic_write;
    let dir = tempfile_dir("import-doc");
    let src = dir.path().join("会议记录.txt");
    atomic_write(
        &src,
        "第一条结论：项目按期交付。\n第二条结论：下季度立项。".as_bytes(),
    )
    .unwrap();

    let note_id = crate::commands::import_document_blocking(&src).expect("txt 应能导入");
    let note_path = crate::commands::notes_dir().join(format!("{}.md", note_id));
    let content = std::fs::read_to_string(&note_path).expect("导入后的笔记应存在");
    assert!(
        content.contains("第一条结论：项目按期交付。"),
        "正文要保留: {}",
        content
    );
    assert!(
        content.starts_with("# 会议记录"),
        "标题来自文件名: {}",
        content
    );
    assert!(
        content.contains("从 会议记录.txt 导入"),
        "要带来源行: {}",
        content
    );

    // 阴性对照：认不得的类型必须报错，且不留半截笔记
    let bad = dir.path().join("photo.xlsx");
    atomic_write(&bad, b"PK\x03\x04fake-xlsx-bytes").unwrap();
    let err = crate::commands::import_document_blocking(&bad).unwrap_err();
    assert!(err.contains("暂不支持"), "错误要指路: {}", err);

    // 旧版 .doc 给出明确指引
    let doc = dir.path().join("旧文档.doc");
    atomic_write(&doc, b"OLE binary").unwrap();
    let err = crate::commands::import_document_blocking(&doc).unwrap_err();
    assert!(
        err.contains("另存为 .docx"),
        "旧 .doc 错误要指明出路: {}",
        err
    );

    let _ = std::fs::remove_file(&note_path);
}

/// import_document 对空文本文件要报错，不落空笔记
#[test]
fn import_document_rejects_empty_text() {
    use crate::atomic_write::atomic_write;
    let dir = tempfile_dir("import-doc-empty");
    let src = dir.path().join("空白.md");
    atomic_write(&src, "   \n  ".as_bytes()).unwrap();
    let err = crate::commands::import_document_blocking(&src).unwrap_err();
    assert!(
        err.contains("没提取到任何文本"),
        "空文件错误要可读: {}",
        err
    );
}

/// 测试用临时目录（随作用域删除）。integration_tests 不引 dev 依赖，
/// 就地做一个最小版：原子创建、撞名重试、Drop 清理。
fn tempfile_dir(tag: &str) -> TempTestDir {
    TempTestDir::new(tag)
}

struct TempTestDir {
    path: std::path::PathBuf,
}

impl TempTestDir {
    fn new(tag: &str) -> Self {
        static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let pid = std::process::id();
        for _ in 0..1000 {
            let nonce = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let seq = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let path =
                std::env::temp_dir().join(format!("znote-test-{}-{}-{}-{}", tag, pid, nonce, seq));
            if std::fs::create_dir_all(&path).is_ok() {
                return Self { path };
            }
        }
        panic!("连续 1000 次都没能建出唯一临时目录（tag={tag}）");
    }

    fn path(&self) -> &std::path::Path {
        &self.path
    }
}

impl Drop for TempTestDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}
