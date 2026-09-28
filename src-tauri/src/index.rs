//! SQLite FTS5 全文搜索索引
//!
//! 设计目标：1000+ 笔记时搜索 < 200ms（vs 当前暴力遍历 3-8s）。
//!
//! 索引位置：`~/.z-note/index.db`
//! 表结构：
//!   - notes(path PK, title, mtime, tags, links)
//!   - notes_fts(title, content, tokens) USING fts5 —— FTS5 虚拟表
//!     tokens 是 content 的「汉字逐字加空格」形态，中文召回靠它（见 cjk_split）
//!
//! 触发：
//!   - 打开文件夹 → 全量扫描，对比 mtime，仅更新变化文件
//!   - 文件保存成功 → upsert 单条
//!   - 文件删除/重命名 → delete + insert
//!   - 手动 rebuild_index → 清空重来
//!
//! 容错：
//!   - 索引文件损坏 → 删除重建
//!   - FTS5 不可用（编译时 feature 没开）→ 降级为暴力搜索

use parking_lot::Mutex;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// 单条搜索匹配（含高亮）
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct IndexedMatch {
    pub file_path: String,
    pub title: String,
    pub line: usize,
    pub snippet: String, // 含 <mark> 高亮
    pub score: f64,
}

/// 索引状态
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct IndexStatus {
    pub total: usize,
    pub indexed: usize,
    pub stale: usize,
    pub index_age_ms: u64,
    pub last_build_ms: u128,
}

/// 索引数据库句柄（线程安全）
pub struct IndexStore {
    conn: Arc<Mutex<Connection>>,
    index_path: PathBuf,
    last_build_ms: Arc<Mutex<u128>>, // 上次全量构建耗时
}

/// 当前 schema 版本。结构变更时 +1；版本不匹配时丢弃旧 DB 自动重建。
/// v3：notes_fts 增加 tokens 列（中文单字切分），旧库的中文召回是坏的，必须重建。
const SCHEMA_VERSION: i32 = 3;

impl IndexStore {
    /// 创建或打开索引文件
    pub fn open() -> Result<Self, String> {
        let base = dirs::home_dir()
            .ok_or_else(|| "无法获取主目录".to_string())?
            .join(".z-note");
        std::fs::create_dir_all(&base)
            .map_err(|e| format!("创建索引目录失败: {}", e))?;
        Self::open_in(&base)
    }

    /// 在指定目录下打开 index.db（测试用隔离库，绝不碰用户真实索引）
    pub fn open_in(base: &Path) -> Result<Self, String> {
        let index_path = base.join("index.db");

        // 如果索引文件存在但打开失败（损坏），重命名备份后重建
        let conn = if index_path.exists() {
            match Connection::open(&index_path) {
                Ok(c) => c,
                Err(_) => {
                    let backup = base.join(format!(
                        "index.db.corrupt-{}",
                        std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_secs())
                            .unwrap_or(0)
                    ));
                    let _ = std::fs::rename(&index_path, &backup);
                    Connection::open(&index_path)
                        .map_err(|e| format!("重建索引失败: {}", e))?
                }
            }
        } else {
            Connection::open(&index_path).map_err(|e| format!("创建索引失败: {}", e))?
        };

        // 1. 建/迁移 schema_meta 表
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_meta (
                key TEXT PRIMARY KEY,
                value INTEGER NOT NULL
            );",
        )
        .map_err(|e| format!("初始化元数据表失败: {}", e))?;

        // 2. 检查 schema 版本，不匹配则丢库重建
        let stored_version: i32 = conn
            .query_row(
                "SELECT value FROM schema_meta WHERE key = 'schema_version'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        if stored_version != SCHEMA_VERSION {
            // 版本不兼容：清空所有表（含旧 FTS 虚拟表），保留 schema_meta
            conn.execute_batch(
                "DROP TABLE IF EXISTS notes_fts;
                 DROP TABLE IF EXISTS notes;
                 DROP INDEX IF EXISTS idx_notes_mtime;",
            )
            .map_err(|e| format!("丢弃旧索引失败: {}", e))?;
        }

        // 注意：notes_fts 用内联存储（不带 content='notes'），
        // 这样 snippet() 和 highlight() 才能工作。
        // 存储开销：~2x content 大小，对个人笔记库（< 100MB）可接受。
        // tokens 列是 content 的逐字切分形态：unicode61 会把「我的笔记」整个当成
        // 一个 token，中文查询在此前恒 0 命中（实测 MATCH '笔记*' = 0 行），
        // 所以额外存一列「每个汉字之间插入空格」的正文供召回。
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS notes (
                path TEXT PRIMARY KEY,
                title TEXT NOT NULL DEFAULT '',
                mtime INTEGER NOT NULL,
                size INTEGER NOT NULL DEFAULT 0,
                tags TEXT NOT NULL DEFAULT '',
                links TEXT NOT NULL DEFAULT ''
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
                title,
                content,
                tokens,
                tokenize='unicode61 remove_diacritics 2'
            );
            CREATE INDEX IF NOT EXISTS idx_notes_mtime ON notes(mtime);",
        )
        .map_err(|e| format!("初始化索引表失败: {}", e))?;
        conn.execute(
            "INSERT OR REPLACE INTO schema_meta(key, value) VALUES('schema_version', ?1)",
            [SCHEMA_VERSION],
        )
        .map_err(|e| format!("写入 schema 版本失败: {}", e))?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            index_path,
            last_build_ms: Arc::new(Mutex::new(0)),
        })
    }

    /// 索引文件路径
    #[allow(dead_code)]
    pub fn path(&self) -> &Path {
        &self.index_path
    }

    /// upsert 单文件
    /// 参数就是 notes 表的列，聚成 struct 只会让每个调用点多一层组装，收益为负。
    #[allow(clippy::too_many_arguments)]
    pub fn upsert_note(
        &self,
        path: &str,
        title: &str,
        content: &str,
        mtime: i64,
        size: i64,
        tags: &str,
        links: &str,
    ) -> Result<(), String> {
        let conn = self.conn.lock();
        let tx = conn.unchecked_transaction().map_err(|e| format!("事务开启失败: {}", e))?;

        tx.execute(
            "INSERT INTO notes(path, title, mtime, size, tags, links)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(path) DO UPDATE SET
                title=excluded.title,
                mtime=excluded.mtime,
                size=excluded.size,
                tags=excluded.tags,
                links=excluded.links",
            params![path, title, mtime, size, tags, links],
        )
        .map_err(|e| format!("upsert notes 失败: {}", e))?;

        // 内联存储的 FTS5：先 DELETE 后 INSERT（标准模式）
        // 内容先 HTML 转义：避免用户笔记里的 <script> 等通过 snippet 注入到前端
        // （前端用 dangerouslySetInnerHTML 渲染 snippet 以支持 <mark> 高亮）
        let safe_content = html_escape(content);
        let safe_tokens = html_escape(&cjk_split(content));
        tx.execute(
            "DELETE FROM notes_fts WHERE rowid = (SELECT rowid FROM notes WHERE path = ?1)",
            params![path],
        )
        .map_err(|e| format!("删除旧 FTS 条目失败: {}", e))?;
        tx.execute(
            "INSERT INTO notes_fts(rowid, title, content, tokens)
             VALUES((SELECT rowid FROM notes WHERE path = ?1), ?2, ?3, ?4)",
            params![path, title, safe_content, safe_tokens],
        )
        .map_err(|e| format!("插入 FTS 条目失败: {}", e))?;

        tx.commit().map_err(|e| format!("提交事务失败: {}", e))?;
        Ok(())
    }

    /// 删除单条
    pub fn delete_note(&self, path: &str) -> Result<(), String> {
        let conn = self.conn.lock();
        tx_try(&conn, |c| {
            c.execute(
                "INSERT INTO notes_fts(notes_fts, rowid) VALUES('delete', (SELECT rowid FROM notes WHERE path = ?1))",
                params![path],
            )?;
            c.execute("DELETE FROM notes WHERE path = ?1", params![path])?;
            Ok(())
        })
    }

    /// 路径改名
    #[allow(dead_code)]
    pub fn rename_note(&self, old_path: &str, new_path: &str) -> Result<(), String> {
        let conn = self.conn.lock();
        tx_try(&conn, |c| {
            c.execute(
                "UPDATE notes SET path = ?1 WHERE path = ?2",
                params![new_path, old_path],
            )?;
            Ok(())
        })
    }

    /// 全文搜索（FTS5 MATCH + BM25 排序）
    /// query 支持：
    ///   - 普通词：`hello world`
    ///   - 中文：`笔记`（经 build_fts_query 转成单字 phrase，命中 tokens 列）
    ///   - tag:#work（前端在传入前转换为 content 包含 #work）
    ///   - path:folder/sub
    ///   - "精确匹配"
    pub fn search(&self, raw_query: &str, limit: usize) -> Result<Vec<IndexedMatch>, String> {
        let fts_query = build_fts_query(raw_query);
        let conn = self.conn.lock();
        // content 列（原文，英文/整词高亮准）与 tokens 列（逐字，中文召回准）各取一段
        // snippet，在 Rust 侧挑：原文里没高亮就说明这次是中文召回，用逐字那段并还原间距。
        let mut stmt = conn
            .prepare(
                "SELECT n.path, n.title,
                        snippet(notes_fts, 1, '<mark>', '</mark>', '…', 16) AS snip_raw,
                        snippet(notes_fts, 2, '<mark>', '</mark>', '…', 16) AS snip_split,
                        bm25(notes_fts) AS score,
                        0 AS line
                 FROM notes_fts
                 JOIN notes n ON n.rowid = notes_fts.rowid
                 WHERE notes_fts MATCH ?1
                 ORDER BY score
                 LIMIT ?2",
            )
            .map_err(|e| format!("搜索语句准备失败: {}", e))?;

        let rows = stmt
            .query_map(params![fts_query, limit as i64], |row| {
                let snip_raw: String = row.get(2)?;
                let snip_split: String = row.get(3)?;
                let snippet = if snip_raw.contains("<mark>") {
                    snip_raw
                } else {
                    collapse_cjk_spaces(&snip_split)
                };
                Ok(IndexedMatch {
                    file_path: row.get(0)?,
                    title: row.get(1)?,
                    line: row.get::<_, i64>(5)? as usize,
                    snippet,
                    score: row.get(4)?,
                })
            })
            .map_err(|e| format!("搜索执行失败: {}", e))?;

        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| format!("读取结果失败: {}", e))?);
        }
        Ok(out)
    }

    /// 全量重建（清空 → 重新扫描）
    /// 注意：实际扫描由 `rebuild_index` command 调用 scan_md_recursive 完成。
    /// 这里只清空并返回状态。
    #[allow(dead_code)]
    pub fn rebuild(&self, _dir: &Path) -> Result<IndexStatus, String> {
        let started = std::time::Instant::now();
        let conn = self.conn.lock();

        conn.execute_batch(
            "DELETE FROM notes_fts;
             DELETE FROM notes;",
        )
        .map_err(|e| format!("清空索引失败: {}", e))?;

        drop(conn); // 释放锁后再扫描（不阻塞其它读）

        // 调用方负责扫描并逐条 upsert
        // 这里只清空，扫描由 rebuild_index 命令完成
        let elapsed = started.elapsed().as_millis();
        *self.last_build_ms.lock() = elapsed;

        Ok(self.status())
    }

    /// 获取索引状态
    pub fn status(&self) -> IndexStatus {
        let conn = self.conn.lock();
        let total: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes", [], |r| r.get(0))
            .unwrap_or(0);
        let indexed: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM notes WHERE mtime > 0",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let last_build = *self.last_build_ms.lock();
        IndexStatus {
            total: total as usize,
            indexed: indexed as usize,
            stale: 0,
            index_age_ms: now,
            last_build_ms: last_build,
        }
    }

    /// 全表清空
    #[allow(dead_code)]
    pub fn clear(&self) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute_batch("DELETE FROM notes_fts; DELETE FROM notes;")
            .map_err(|e| format!("清空失败: {}", e))?;
        Ok(())
    }

    /// 列出所有已索引路径（用于对比 last_query 与 mtime）
    pub fn list_paths(&self) -> Result<Vec<(String, i64)>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare("SELECT path, mtime FROM notes")
            .map_err(|e| format!("查询索引失败: {}", e))?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
            .map_err(|e| format!("读取索引失败: {}", e))?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| format!("解码行失败: {}", e))?);
        }
        Ok(out)
    }
}

/// 包装事务辅助函数
fn tx_try<F>(conn: &Connection, f: F) -> Result<(), String>
where
    F: FnOnce(&Connection) -> rusqlite::Result<()>,
{
    let tx = conn.unchecked_transaction().map_err(|e| format!("事务开启失败: {}", e))?;
    f(&tx).map_err(|e| format!("事务执行失败: {}", e))?;
    tx.commit().map_err(|e| format!("提交失败: {}", e))?;
    Ok(())
}

/// 把用户查询转成 FTS5 MATCH 表达式。
/// FTS5 默认 AND 语义，简单分词已满足；引号视为 phrase。
fn build_fts_query(query: &str) -> String {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return String::from("\"\"");
    }
    // 如果用户已经用了 FTS5 语法（tag:、path:、引号、AND/OR/NOT、* 通配），原样透传
    if trimmed.contains(':')
        || trimmed.contains('"')
        || trimmed.contains(" AND ")
        || trimmed.contains(" OR ")
        || trimmed.contains(" NOT ")
        || trimmed.ends_with('*')
    {
        return trimmed.to_string();
    }
    // 否则对每个 token 加 `*` 后缀做前缀匹配 → 类模糊搜索
    trimmed
        .split_whitespace()
        .flat_map(expand_token)
        .collect::<Vec<_>>()
        .join(" ")
}

/// 单个查询 token → FTS5 片段（多个片段之间是隐式 AND）。
/// 拉丁段保留 `*` 前缀语义；汉字段拆成单字 phrase，才能命中 tokens 列。
fn expand_token(token: &str) -> Vec<String> {
    let cleaned: Vec<char> = token
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-' || is_cjk(*c))
        .collect();

    let mut out = Vec::new();
    let mut run: Vec<char> = Vec::new();
    let mut run_is_cjk = false;
    for &c in cleaned.iter() {
        let cjk = is_cjk(c);
        if !run.is_empty() && cjk != run_is_cjk {
            out.push(flush_run(&run, run_is_cjk));
            run.clear();
        }
        run_is_cjk = cjk;
        run.push(c);
    }
    if !run.is_empty() {
        out.push(flush_run(&run, run_is_cjk));
    }
    out.into_iter().filter(|s| !s.is_empty()).collect()
}

fn flush_run(run: &[char], cjk: bool) -> String {
    if cjk {
        let chars: Vec<String> = run.iter().map(|c| c.to_string()).collect();
        // 单字直接当 term；多字用 phrase 保证相邻（"笔记" ≠ "记…笔"）
        if chars.len() == 1 {
            chars.into_iter().next().unwrap()
        } else {
            format!("\"{}\"", chars.join(" "))
        }
    } else {
        let s: String = run.iter().collect();
        if s.is_empty() {
            String::new()
        } else {
            format!("{}*", s)
        }
    }
}

/// 中日韩统一表意文字 + 扩展 A + 假名 + 谚文：unicode61 会把这些连成整块 token 的字符。
fn is_cjk(c: char) -> bool {
    matches!(c,
        '\u{3040}'..='\u{30ff}'    // 平假名/片假名
        | '\u{3400}'..='\u{4dbf}'  // 扩展 A
        | '\u{4e00}'..='\u{9fff}'  // 基本汉字
        | '\u{f900}'..='\u{faff}'  // 兼容汉字
        | '\u{ac00}'..='\u{d7af}'  // 谚文音节
    )
}

/// 在相邻两个汉字之间插入空格，让 unicode61 把每个汉字切成独立 token。
/// 拉丁/数字/标点原样保留 —— 只有汉字之间加空格，reverse（collapse_cjk_spaces）才无歧义。
fn cjk_split(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + s.len() / 2);
    let mut prev_cjk = false;
    for c in s.chars() {
        let cjk = is_cjk(c);
        if cjk && prev_cjk {
            out.push(' ');
        }
        out.push(c);
        prev_cjk = cjk;
    }
    out
}

/// 把 cjk_split 加进去的分隔空格撤掉，用于展示逐字列的 snippet。
/// snippet 里夹着 `<mark>`/`</mark>`/`…`，得跳过标签再判断左右是否都是汉字。
fn collapse_cjk_spaces(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    for i in 0..chars.len() {
        if chars[i] == ' '
            && prev_visible(&chars, i).is_some_and(is_cjk)
            && next_visible(&chars, i).is_some_and(is_cjk)
        {
            continue;
        }
        out.push(chars[i]);
    }
    out
}

/// i 左边第一个非空格、非标签字符
fn prev_visible(chars: &[char], i: usize) -> Option<char> {
    if i == 0 {
        return None;
    }
    let mut j = i - 1;
    loop {
        match chars.get(j) {
            None => return None,
            Some(' ') => {
                if j == 0 {
                    return None;
                }
                j -= 1;
            }
            Some('>') => {
                // 退回标签开头
                while j > 0 && chars[j] != '<' {
                    j -= 1;
                }
                if j == 0 {
                    return None;
                }
                j -= 1;
            }
            Some(c) => return Some(*c),
        }
    }
}

/// i 右边第一个非空格、非标签字符
fn next_visible(chars: &[char], i: usize) -> Option<char> {
    let mut j = i;
    while j < chars.len() {
        match chars[j] {
            ' ' => j += 1,
            '<' => {
                while j < chars.len() && chars[j] != '>' {
                    j += 1;
                }
                j += 1;
            }
            c => return Some(c),
        }
    }
    None
}

/// HTML 转义：snippet() 会返回含 `<mark>` 的结果。
/// 用户笔记原始内容里可能有 `<script>`、`<img onerror=...>` 等，
/// 必须先转义再存入 FTS，否则前端用 dangerouslySetInnerHTML 渲染时被 XSS。
///
/// 注意：只转义 5 个字符（& < > " '），不转义引号以外的 Unicode，
/// 避免破坏中文/Unicode 搜索。
fn html_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fts_query_passthrough_with_quotes() {
        let q = build_fts_query("\"hello world\"");
        assert_eq!(q, "\"hello world\"");
    }

    #[test]
    fn fts_query_passthrough_with_tag() {
        let q = build_fts_query("tag:work");
        assert_eq!(q, "tag:work");
    }

    #[test]
    fn fts_query_default_to_prefix() {
        let q = build_fts_query("hello world");
        assert_eq!(q, "hello* world*");
    }

    #[test]
    fn fts_query_handles_chinese() {
        // 汉字必须转成单字 phrase：unicode61 把连续汉字当一个 token，
        // 此前的 `中文*` 形态对"我的中文笔记"恒 0 命中（sqlite3 实测）
        let q = build_fts_query("中文 笔记");
        assert_eq!(q, "\"中 文\" \"笔 记\"");
    }

    #[test]
    fn fts_query_mixed_cjk_and_latin() {
        assert_eq!(build_fts_query("笔记note"), "\"笔 记\" note*");
    }

    #[test]
    fn fts_query_single_cjk_char_is_bare_term() {
        assert_eq!(build_fts_query("笔"), "笔");
    }

    #[test]
    fn cjk_split_only_touches_hanzi_runs() {
        assert_eq!(cjk_split("我的笔记"), "我 的 笔 记");
        assert_eq!(cjk_split("hello 世界 ok"), "hello 世 界 ok");
        assert_eq!(cjk_split("English only"), "English only");
        assert_eq!(cjk_split(""), "");
    }

    #[test]
    fn cjk_collapse_is_inverse_of_split() {
        for raw in [
            "我的笔记内容",
            "混合 english 笔记 with 词 mixed",
            "# 标题\n\n正文第二行",
        ] {
            assert_eq!(collapse_cjk_spaces(&cjk_split(raw)), raw);
        }
    }

    #[test]
    fn cjk_collapse_keeps_highlight_tags_and_drops_split_spaces() {
        let snip = "我 的 <mark>笔</mark> 记 内 容";
        assert_eq!(collapse_cjk_spaces(snip), "我的<mark>笔</mark>记内容");
    }

    #[test]
    fn cjk_collapse_keeps_spaces_touching_latin() {
        // 与拉丁相邻的空格一定保留；两个汉字之间的原文空格无法与切分空格区分，
        // 只在 snippet 展示层少一个空格（正文本身不受影响，写盘路径不经过这里）
        assert_eq!(collapse_cjk_spaces("笔 记 note 摘 要"), "笔记 note 摘要");
    }

    #[test]
    fn is_cjk_covers_hanzi_kana_and_rejects_punctuation() {
        assert!(is_cjk('笔'));
        assert!(is_cjk('あ'));
        assert!(is_cjk('한'));
        assert!(!is_cjk('a'));
        assert!(!is_cjk('，'));
    }

    #[test]
    fn fts_query_sanitizes_dangerous_chars() {
        let q = build_fts_query("foo bar");
        assert!(!q.contains('(') && !q.contains(')'));
    }
}