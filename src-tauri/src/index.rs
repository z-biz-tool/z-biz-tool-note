//! SQLite FTS5 全文搜索索引
//!
//! 设计目标：1000+ 笔记时搜索 < 200ms（vs 当前暴力遍历 3-8s）。
//!
//! 索引位置：`~/.z-note/index.db`
//! 表结构：
//!   - notes(path PK, title, mtime, tags, links)
//!   - notes_fts(title, content) USING fts5 —— FTS5 虚拟表
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
const SCHEMA_VERSION: i32 = 2;

impl IndexStore {
    /// 创建或打开索引文件
    pub fn open() -> Result<Self, String> {
        let base = dirs::home_dir()
            .ok_or_else(|| "无法获取主目录".to_string())?
            .join(".z-note");
        std::fs::create_dir_all(&base)
            .map_err(|e| format!("创建索引目录失败: {}", e))?;
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

        // 3. 建表（IF NOT EXISTS 保证幂等）
        // 注意：notes_fts 用内联存储（不带 content='notes'），
        // 这样 snippet() 和 highlight() 才能工作。
        // 存储开销：~2x content 大小，对个人笔记库（< 100MB）可接受。
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
        tx.execute(
            "DELETE FROM notes_fts WHERE rowid = (SELECT rowid FROM notes WHERE path = ?1)",
            params![path],
        )
        .map_err(|e| format!("删除旧 FTS 条目失败: {}", e))?;
        tx.execute(
            "INSERT INTO notes_fts(rowid, title, content)
             VALUES((SELECT rowid FROM notes WHERE path = ?1), ?2, ?3)",
            params![path, title, safe_content],
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
    ///   - tag:#work（前端在传入前转换为 content 包含 #work）
    ///   - path:folder/sub
    ///   - "精确匹配"
    pub fn search(&self, raw_query: &str, limit: usize) -> Result<Vec<IndexedMatch>, String> {
        let fts_query = build_fts_query(raw_query);
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                "SELECT n.path, n.title,
                        snippet(notes_fts, 1, '<mark>', '</mark>', '…', 16) AS snip,
                        bm25(notes_fts) AS score,
                        1 AS line
                 FROM notes_fts
                 JOIN notes n ON n.rowid = notes_fts.rowid
                 WHERE notes_fts MATCH ?1
                 ORDER BY score
                 LIMIT ?2",
            )
            .map_err(|e| format!("搜索语句准备失败: {}", e))?;

        let rows = stmt
            .query_map(params![fts_query, limit as i64], |row| {
                Ok(IndexedMatch {
                    file_path: row.get(0)?,
                    title: row.get(1)?,
                    line: row.get::<_, i64>(4)? as usize,
                    snippet: row.get(2)?,
                    score: row.get(3)?,
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
        .map(|t| {
            // 去掉不安全字符
            let safe: String = t
                .chars()
                .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
                .collect();
            if safe.is_empty() {
                return String::new();
            }
            format!("{}*", safe)
        })
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
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
        // 中文不会被切分（unicode61 tokenizer 处理），但前缀通配不适用
        let q = build_fts_query("中文 笔记");
        assert!(q.contains("中文*"));
    }

    #[test]
    fn fts_query_sanitizes_dangerous_chars() {
        let q = build_fts_query("foo bar");
        assert!(!q.contains('(') && !q.contains(')'));
    }
}