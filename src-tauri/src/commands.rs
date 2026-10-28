use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use crate::atomic_write::{atomic_write, atomic_write_str};

// 标题/标签/双链的提取只有 extract.rs 一份实现：commands.rs 里曾经复制过三个同名私有函数，
// 索引（rebuild_index / note_updated）走 extract.rs、侧栏摘要走复制品，改一处漏一处。
use crate::extract::{extract_links, extract_tags, extract_title};

/// 允许的临时目录根：`/tmp` 与各平台的 `std::env::temp_dir()`。
///
/// 为什么两个都要：只写 `/tmp` 时 Windows 上没有任何临时目录能过校验，导出/新建临时文件
/// 会被判"路径不在允许范围内"（note 的 Windows CI 腿实测红过两条用例）；而只写 temp_dir()
/// 又会在 macOS 上漏掉 `/tmp` 本身（macOS 的 temp_dir 是 `/var/folders/...`）。
/// 两者都是同一条口径：应用自己的临时落盘位置。
fn temp_roots() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = vec![std::path::Path::new("/tmp")
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from("/tmp"))];
    let platform = std::env::temp_dir();
    let platform = platform.canonicalize().unwrap_or(platform);
    if !roots.contains(&platform) {
        roots.push(platform);
    }
    roots
}

fn in_temp_root(path: &Path) -> bool {
    temp_roots().iter().any(|r| path.starts_with(r))
}

/// 验证路径是否在允许的目录范围内（防止路径遍历攻击）
///
/// 允许的目录（按优先级）：
/// 1. 当前打开的笔记库目录（运行时由 caller 注入；这里查不到则用 home）
/// 2. 用户主目录下允许的子目录：`Documents/`、`Desktop/`、`Downloads/`、`Notes/`
/// 3. `~/.z-note/`（应用自身数据）
/// 4. `/tmp/` 与本平台的临时目录（导出临时文件）
///
/// 设计取舍：
/// - 仍允许主目录主要是为了兼容"~/Documents/MyNotes" 类典型笔记库位置
/// - 同时收紧到常见子目录；不允许 ~/.ssh、~/.aws、~/Library 等敏感区域
pub(crate) fn validate_path(path: &str) -> Result<PathBuf, String> {
    let canonical = std::path::Path::new(path)
        .canonicalize()
        .map_err(|e| format!("路径无效: {}", e))?;

    let home = dirs::home_dir().ok_or_else(|| "无法获取主目录".to_string())?;
    // canonicalize home 避免 symlink 误判
    let canonical_home = home.canonicalize().unwrap_or_else(|_| home.clone());

    // 1. 应用数据目录 ~/.z-note
    let app_data = canonical_home.join(".z-note");
    if canonical.starts_with(&app_data) {
        return Ok(canonical);
    }

    // 2. 临时目录（含 macOS 的 /private/tmp：一律用 canonical 前缀比较）
    if in_temp_root(&canonical) {
        return Ok(canonical);
    }

    // 3. 常见笔记存放位置
    const ALLOWED_SUBDIRS: &[&str] = &[
        "Documents",
        "Desktop",
        "Downloads",
        "Notes",
        "notes",
        "Documents/Notes",
    ];
    for sub in ALLOWED_SUBDIRS {
        let dir = canonical_home.join(sub);
        if canonical.starts_with(&dir) {
            return Ok(canonical);
        }
    }

    // 4. 兜底：主目录直接子目录（一级），允许 ~/MyNotes、~/workspace 这种
    if let Some(parent) = canonical.parent() {
        if parent == canonical_home.as_path() {
            return Ok(canonical);
        }
    }

    Err(format!("路径不在允许范围内: {}", path))
}

/// 安全文件名清洗：仅保留字母数字与 `-_`，截断至 64 字符。
/// 防止 `save_image` / `read_image` 等命令被 `../../../tmp/xxx` 注入。
pub(crate) fn sanitize_filename(name: &str) -> String {
    name.chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .take(64)
        .collect()
}

/// 校验目标路径是否在允许范围内（适用于文件/目录可能尚不存在的场景）。
/// 策略：canonicalize 父目录 + 拼接 basename，等价于"未来创建后"的位置判断。
/// 用于 `ensure_dir`（创建新目录）、`write_text_file`（写入新文件）等命令。
pub(crate) fn validate_path_allow_nonexistent(path: &str) -> Result<PathBuf, String> {
    let candidate = std::path::Path::new(path);
    let candidate_canonical = if candidate.exists() {
        candidate
            .canonicalize()
            .map_err(|e| format!("路径解析失败: {}", e))?
    } else {
        let parent = candidate
            .parent()
            .ok_or_else(|| format!("路径无父目录: {}", path))?;
        let file_name = candidate
            .file_name()
            .ok_or_else(|| format!("路径无文件名: {}", path))?;
        let canonical_parent = parent
            .canonicalize()
            .map_err(|e| format!("父目录解析失败: {}", e))?;
        canonical_parent.join(file_name)
    };

    // 复用 validate_path 的内部逻辑（先校验 canonical 路径）
    // 由于 candidate_canonical 已经是 canonical，可以直接比较
    let home = dirs::home_dir().ok_or_else(|| "无法获取主目录".to_string())?;
    let canonical_home = home.canonicalize().unwrap_or_else(|_| home.clone());

    let app_data = canonical_home.join(".z-note");
    if candidate_canonical.starts_with(&app_data) {
        return Ok(candidate_canonical);
    }

    if in_temp_root(&candidate_canonical) {
        return Ok(candidate_canonical);
    }

    const ALLOWED_SUBDIRS: &[&str] = &[
        "Documents",
        "Desktop",
        "Downloads",
        "Notes",
        "notes",
        "Documents/Notes",
    ];
    for sub in ALLOWED_SUBDIRS {
        let dir = canonical_home.join(sub);
        if candidate_canonical.starts_with(&dir) {
            return Ok(candidate_canonical);
        }
    }

    // 兜底：父目录为主目录直接子目录（一级）
    if let Some(parent) = candidate_canonical.parent() {
        if parent == canonical_home.as_path() {
            return Ok(candidate_canonical);
        }
    }

    Err(format!("路径不在允许范围内: {}", path))
}

/// 校验目标路径必须落在指定目录内（canonicalize 后做前缀判断）。
/// 用于 `read_image` 这类 "path 在某容器内" 的命令，避免 `..` 跳出。
pub(crate) fn ensure_path_within(base: &Path, candidate: &Path) -> Result<PathBuf, String> {
    // 文件不存在时，canonicalize 会失败；改用父目录 canonicalize + 文件名拼接
    let resolved = if candidate.exists() {
        candidate
            .canonicalize()
            .map_err(|e| format!("路径解析失败: {}", e))?
    } else {
        let parent = candidate
            .parent()
            .ok_or_else(|| format!("路径无父目录: {}", candidate.display()))?;
        let file_name = candidate
            .file_name()
            .ok_or_else(|| format!("路径无文件名: {}", candidate.display()))?;
        let canonical_parent = parent
            .canonicalize()
            .map_err(|e| format!("父目录解析失败: {}", e))?;
        canonical_parent.join(file_name)
    };
    let canonical_base = base
        .canonicalize()
        .map_err(|e| format!("基准目录解析失败: {}", e))?;
    if !resolved.starts_with(&canonical_base) {
        return Err(format!(
            "路径越界: {} 不在 {} 内",
            resolved.display(),
            canonical_base.display()
        ));
    }
    Ok(resolved)
}

/// 笔记元数据
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NoteMeta {
    pub id: String,
    pub title: String,
    pub created: String,
    pub modified: String,
    pub tags: Vec<String>,
}

/// 应用配置
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Config {
    pub theme: String,
    pub font_size: u32,
    pub font_family: String,
    pub auto_save: bool,
    pub last_note_id: String,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            theme: "light".to_string(),
            font_size: 16,
            font_family: "system-ui".to_string(),
            auto_save: true,
            last_note_id: String::new(),
        }
    }
}

/// 获取笔记数据目录 ~/.z-note/notes/
fn notes_dir() -> PathBuf {
    let base = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join(".z-note").join("notes");
    if !dir.exists() {
        fs::create_dir_all(&dir).ok();
    }
    dir
}

/// 获取配置文件路径 ~/.z-note/config.json
fn config_path() -> PathBuf {
    let base = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join(".z-note");
    if !dir.exists() {
        fs::create_dir_all(&dir).ok();
    }
    dir.join("config.json")
}

/// 获取回收站目录 ~/.z-note/trash/
fn trash_dir() -> PathBuf {
    let base = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join(".z-note").join("trash");
    if !dir.exists() {
        fs::create_dir_all(&dir).ok();
    }
    dir
}

/// 从文件名提取笔记ID（去掉.md后缀）
fn id_from_filename(filename: &str) -> String {
    filename.trim_end_matches(".md").to_string()
}

/// 这篇文件算不算 markdown 笔记。
///
/// 口径跟前端 `fileTypes.isMarkdownPath` 对齐（那里 kindOf 查表得到 'markdown'，
/// 扩展名先 toLowerCase，所以 .md/.markdown、大小写混排都算）。之前 Rust 侧
/// 六处过滤各自写死 `ext == "md"`，于是 `Changelog.markdown` 能在文件树里看到
/// （list_dir_single 收 markdown）、能点开编辑、能改名，却搜不到、进不了图谱和反链。
/// 备份文件名是 `{timestamp}.md` 那一套，不走这个判定。
pub(crate) fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"))
}

/// HTML 特殊字符转义（防止 XSS）
fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

/// 列出所有笔记
#[tauri::command]
pub fn list_notes() -> Vec<NoteMeta> {
    let dir = notes_dir();
    let mut notes: Vec<NoteMeta> = Vec::new();

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if is_markdown_path(&path) {
                let filename = path.file_name().unwrap().to_string_lossy().to_string();
                let id = id_from_filename(&filename);

                if let Ok(content) = fs::read_to_string(&path) {
                    let title = extract_title(&content);
                    let tags = extract_tags(&content);

                    let created = path
                        .metadata()
                        .and_then(|m| m.created())
                        .map(|t| {
                            let dt: DateTime<Local> = t.into();
                            dt.format("%Y-%m-%d %H:%M:%S").to_string()
                        })
                        .unwrap_or_default();

                    let modified = path
                        .metadata()
                        .and_then(|m| m.modified())
                        .map(|t| {
                            let dt: DateTime<Local> = t.into();
                            dt.format("%Y-%m-%d %H:%M:%S").to_string()
                        })
                        .unwrap_or_default();

                    notes.push(NoteMeta {
                        id,
                        title,
                        created,
                        modified,
                        tags,
                    });
                }
            }
        }
    }

    // 按修改时间倒序排列
    notes.sort_by(|a, b| b.modified.cmp(&a.modified));
    notes
}

/// 把笔记 id 解析成笔记库里的路径，顺手挡住想跳出库的 id。
///
/// id 直接来自正文里的 `![[...]]`，等于用户可控输入：写 `../../.ssh/config` 这种
/// 原样 join 出去就能读到笔记库外的文件（后缀 .md 限制了面，但不该靠它兜底）。
/// 空串、带分隔符、带 `..` 都返回 None，让调用方按"没有这篇"处理。
fn note_path_in(dir: &Path, id: &str) -> Option<PathBuf> {
    if id.is_empty() || id.contains('/') || id.contains('\\') || id.contains("..") {
        return None;
    }
    Some(dir.join(format!("{}.md", id)))
}

/// 读取笔记内容。
///
/// 返回 `Option` 而不是 `unwrap_or_default()` 吞成空串：那样"库里没这篇"和"这篇是空的"
/// 长得一样，嵌入块只能画一片空白，用户不知道是写错了 id 还是笔记真没内容。
#[tauri::command]
pub async fn read_note(id: String) -> Option<String> {
    read_note_in(&notes_dir(), &id)
}

fn read_note_in(dir: &Path, id: &str) -> Option<String> {
    let path = note_path_in(dir, id)?;
    fs::read_to_string(path).ok()
}

/// 保存笔记（写入失败必须显式返回错误，前端不允许静默吞错）
#[tauri::command]
pub fn save_note(id: String, content: String) -> Result<(), String> {
    let path = notes_dir().join(format!("{}.md", id));
    atomic_write_str(&path, &content)
}

/// 删除笔记（移到回收站）
#[tauri::command]
pub fn delete_note(id: String) {
    let src = notes_dir().join(format!("{}.md", id));
    let dst = trash_dir().join(format!("{}.md", id));
    if src.exists() {
        let _ = fs::rename(&src, &dst);
    }
}

/// 创建新笔记，返回id
#[tauri::command]
pub fn create_note(title: String) -> Result<String, String> {
    let uuid = Uuid::new_v4().to_string();
    let id = &uuid[..8];
    let content = format!("# {}\n\n", title);
    let path = notes_dir().join(format!("{}.md", id));
    atomic_write_str(&path, &content)?;
    Ok(id.to_string())
}

/// 读取配置
#[tauri::command]
pub fn get_config() -> Config {
    let path = config_path();
    if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        let config = Config::default();
        let _ = save_config(config.clone());
        config
    }
}

/// 保存配置
#[tauri::command]
pub fn save_config(config: Config) -> Result<(), String> {
    let path = config_path();
    let json =
        serde_json::to_string_pretty(&config).map_err(|e| format!("序列化配置失败: {}", e))?;
    atomic_write_str(&path, &json)
}

/// 导出笔记（写入用户指定路径，必须校验防越界覆盖）
#[tauri::command]
pub fn export_note(id: String, format: String, path: String) -> Result<String, String> {
    validate_path(&path)?;
    let note_path = notes_dir().join(format!("{}.md", id));
    let content = fs::read_to_string(&note_path).unwrap_or_default();

    let output = if format == "html" {
        // 简单的Markdown转HTML
        let mut html = String::from("<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><title>导出笔记</title><style>body{font-family:system-ui;max-width:800px;margin:0 auto;padding:20px;line-height:1.6}code{background:#f4f4f4;padding:2px 6px;border-radius:3px}pre{background:#f4f4f4;padding:12px;border-radius:6px;overflow-x:auto}blockquote{border-left:4px solid #ddd;margin:0;padding-left:16px;color:#666}</style></head><body>");
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("# ") {
                html.push_str(&format!(
                    "<h1>{}</h1>",
                    escape_html(trimmed.trim_start_matches("# "))
                ));
            } else if trimmed.starts_with("## ") {
                html.push_str(&format!(
                    "<h2>{}</h2>",
                    escape_html(trimmed.trim_start_matches("## "))
                ));
            } else if trimmed.starts_with("### ") {
                html.push_str(&format!(
                    "<h3>{}</h3>",
                    escape_html(trimmed.trim_start_matches("### "))
                ));
            } else if trimmed.starts_with("- ") || trimmed.starts_with("* ") {
                html.push_str(&format!("<li>{}</li>", escape_html(&trimmed[2..])));
            } else if trimmed.starts_with("> ") {
                html.push_str(&format!(
                    "<blockquote>{}</blockquote>",
                    escape_html(trimmed.trim_start_matches("> "))
                ));
            } else if trimmed.starts_with("```") {
                html.push_str("<pre><code>");
            } else if trimmed.is_empty() {
                html.push_str("<br/>");
            } else {
                html.push_str(&format!("<p>{}</p>", escape_html(trimmed)));
            }
        }
        html.push_str("</body></html>");
        html
    } else {
        content
    };

    atomic_write_str(std::path::Path::new(&path), &output)?;
    Ok("导出成功".to_string())
}

/// 导入笔记（从任意 .md 读取到 ~/.z-note/notes/）
/// 必须校验源路径防越界读取（如 /etc/passwd）
#[tauri::command]
pub fn import_note(path: String) -> Result<String, String> {
    validate_path(&path)?;
    let content = fs::read_to_string(&path).map_err(|e| format!("读取文件失败: {}", e))?;
    if content.is_empty() {
        return Err("导入失败: 文件为空".to_string());
    }

    let _title = extract_title(&content);
    let uuid = Uuid::new_v4().to_string();
    let id = &uuid[..8];
    let note_path = notes_dir().join(format!("{}.md", id));
    atomic_write_str(&note_path, &content)?;
    Ok(id.to_string())
}

/// 列出回收站笔记
#[tauri::command]
pub fn list_trash() -> Vec<NoteMeta> {
    let dir = trash_dir();
    let mut notes: Vec<NoteMeta> = Vec::new();

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if is_markdown_path(&path) {
                let filename = path.file_name().unwrap().to_string_lossy().to_string();
                let id = id_from_filename(&filename);

                if let Ok(content) = fs::read_to_string(&path) {
                    let title = extract_title(&content);
                    let modified = path
                        .metadata()
                        .and_then(|m| m.modified())
                        .map(|t| {
                            let dt: DateTime<Local> = t.into();
                            dt.format("%Y-%m-%d %H:%M:%S").to_string()
                        })
                        .unwrap_or_default();

                    notes.push(NoteMeta {
                        id,
                        title,
                        created: String::new(),
                        modified,
                        tags: vec![],
                    });
                }
            }
        }
    }

    notes.sort_by(|a, b| b.modified.cmp(&a.modified));
    notes
}

/// 恢复回收站笔记
#[tauri::command]
pub fn restore_note(id: String) {
    let src = trash_dir().join(format!("{}.md", id));
    let dst = notes_dir().join(format!("{}.md", id));
    if src.exists() {
        let _ = fs::rename(&src, &dst);
    }
}

/// 永久删除回收站笔记
#[tauri::command]
pub fn permanent_delete_note(id: String) {
    let path = trash_dir().join(format!("{}.md", id));
    if path.exists() {
        let _ = fs::remove_file(&path);
    }
}

/// 获取所有标签
#[tauri::command]
pub fn list_tags() -> Vec<String> {
    let notes = list_notes();
    let mut tags = std::collections::HashSet::new();
    for note in &notes {
        for tag in &note.tags {
            tags.insert(tag.clone());
        }
    }
    let mut result: Vec<String> = tags.into_iter().collect();
    result.sort();
    result
}

/// 保存图片到本地，返回相对路径
#[tauri::command]
pub async fn save_image(note_id: String, data: String) -> Result<String, String> {
    let images_dir = notes_dir().join("images");
    if !images_dir.exists() {
        fs::create_dir_all(&images_dir).map_err(|e| format!("创建图片目录失败: {}", e))?;
    }
    // data格式: data:image/png;base64,xxxxx
    // data URI 拆分 + base64 解码走能力层 cap-img；mime→ext 留在本仓，
    // 因为这里有 svg 特例和"认不出一律 png"的兜底，是本产品的命名规则。
    if !data.starts_with("data:") {
        return Err("只支持data URI格式".to_string());
    }
    let parsed = cap_img::decode_data_url(&data).ok_or("无效的base64数据")?;
    let ext = ext_for_save(&parsed.mime);
    // note_id 必须经 sanitize_filename 清洗，避免 `../../tmp/evil` 注入
    let safe_id = sanitize_filename(&note_id);
    if safe_id.is_empty() {
        return Err("无效的 note_id".to_string());
    }
    let filename = format!("{}-{}.{}", safe_id, &Uuid::new_v4().to_string()[..8], ext);
    let path = images_dir.join(&filename);
    atomic_write(&path, &parsed.bytes).map_err(|e| format!("写入图片失败: {}", e))?;
    Ok(format!("images/{}", filename))
}

/// mime → 存盘扩展名：本产品的命名规则（svg 单列，认不出回退 png）
fn ext_for_save(mime: &str) -> &'static str {
    if mime.contains("png") {
        "png"
    } else if mime.contains("jpeg") || mime.contains("jpg") {
        "jpg"
    } else if mime.contains("gif") {
        "gif"
    } else if mime.contains("webp") {
        "webp"
    } else if mime.contains("svg") {
        "svg"
    } else {
        "png"
    }
}

/// 读取图片文件，返回base64 data URI
#[tauri::command]
pub async fn read_image(path: String) -> Result<String, String> {
    let images_dir = notes_dir().join("images");
    let full_path = images_dir.join(&path);
    // 防止 path 中含 `../` 跳出 images 目录
    ensure_path_within(&images_dir, &full_path).map_err(|e| format!("图片路径越界: {}", e))?;
    if !full_path.exists() {
        return Err(format!("图片不存在: {}", path));
    }
    let bytes = fs::read(&full_path).map_err(|e| format!("读取图片失败: {}", e))?;
    let ext = full_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");
    // ext→mime 同样是本产品的映射（svg → image/svg+xml 是 cap-img 没有的特例）
    let mime = match ext {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "image/png",
    };
    Ok(cap_img::encode_data_url(&bytes, mime))
}

/// 确保目录存在（路径校验防越界创建）
#[tauri::command]
pub async fn ensure_dir(path: String) -> Result<(), String> {
    ensure_dir_at(&path)
}

/// ensure_dir 的实体：单列出来让测试能直接喂路径（async 命令在测试里跑不了）
pub fn ensure_dir_at(path: &str) -> Result<(), String> {
    validate_path_allow_nonexistent(path)?;
    std::fs::create_dir_all(path).map_err(|e| format!("创建目录失败: {}", e))
}

/// 写入文本文件（前端编辑笔记 / 通用文本写入的统一入口）
#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> Result<(), String> {
    validate_path_allow_nonexistent(&path)?;
    atomic_write_str(std::path::Path::new(&path), &content)
}

// ==================== 新增结构体 ====================

/// 目录条目（递归）
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_file: bool,
    pub size: u64,
    pub modified: String,
    pub children: Vec<FileEntry>,
}

/// 搜索匹配结果
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SearchMatch {
    pub file_path: String,
    pub line: usize,
    pub preview: String,
}

/// 笔记摘要（用于知识图谱）
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NoteSummary {
    pub file_path: String,
    pub title: String,
    pub tags: Vec<String>,
    pub links: Vec<String>,
}

/// 反向链接条目
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BacklinkEntry {
    pub file_path: String,
    pub title: String,
    pub preview: String,
}

/// 备份条目（版本历史）
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BackupEntry {
    pub path: String,
    pub timestamp: String,
    pub modified: String,
}

/// AI聊天配置
///
/// ⚠ **字段名必须与前端的 `AIConfig`（src/types/index.ts）一字不差**：
/// 前端是 `baseURL` / `apiKey`（camelCase，且 URL 是全大写），
/// 而 **Tauri v2 只对顶层参数做 camelCase → snake_case，嵌套结构体走 serde 自己那套**
/// ⇒ serde 默认只认 `base_url` ⇒ 不写下面的 rename 的话，
/// **桌面端每一条 AI 请求都会在反序列化这一步就失败**（实测：missing field `base_url`）。
///
/// ⛔ **别用 `#[serde(rename_all = "camelCase")]`**：serde 把 `base_url` 转成的是
/// `baseUrl`，**不是 `baseURL`**（全大写的 URL 会错一位）⇒ 必须显式 rename。
///
/// 这条契约由 `ai_payload_wire_tests` 钉住（照抄前端那个 JSON 形状）。
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AiConfigPayload {
    #[serde(rename = "baseURL")]
    pub base_url: String,
    #[serde(rename = "apiKey")]
    pub api_key: String,
    pub model: String,
}

/// 聊天消息
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

// ==================== 新增命令 ====================

/// 读取任意文件内容
#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    validate_path(&path)?;
    fs::read_to_string(&path).map_err(|e| format!("读取文件失败: {}", e))
}

/// 写入内容到任意文件（应用层接口；底层走原子写防止断电损坏笔记）。
/// 写入成功后自动 emit `note-updated` 事件，前端增量更新知识图谱。
#[tauri::command]
pub async fn write_file(
    path: String,
    content: String,
    app: tauri::AppHandle,
    index: tauri::State<'_, IndexStore>,
) -> Result<(), String> {
    validate_path(&path)?;
    atomic_write_str(std::path::Path::new(&path), &content)?;

    // 写入成功后：解析摘要 → emit 增量事件 → upsert 索引
    let title = extract_title(&content);
    let tags = extract_tags(&content).join(",");
    let links = extract_links(&content).join(",");

    let _ = app.emit(
        "note-updated",
        serde_json::json!({
            "file_path": path,
            "title": title,
            "tags": tags,
            "links": links,
        }),
    );

    // upsert 到 FTS5 索引（失败不阻塞主流程）
    if let Ok(meta) = fs::metadata(&path) {
        let mtime = meta
            .modified()
            .map(|t| {
                t.duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0)
            })
            .unwrap_or(0);
        let size = meta.len() as i64;
        let _ = index.upsert_note(&path, &title, &content, mtime, size, &tags, &links);
    }

    Ok(())
}

/// 删除文件或目录（已从 invoke_handler 移除，统一改走 `move_to_trash` 走废纸篓）。
///
/// 保留函数仅为方便内部调用与单测；前端不可直接通过 invoke 触发永久删除。
#[allow(dead_code)]
pub async fn delete_file(path: String) -> Result<(), String> {
    validate_path(&path)?;
    if std::path::Path::new(&path).is_dir() {
        std::fs::remove_dir_all(&path).map_err(|e| format!("删除目录失败: {}", e))
    } else {
        std::fs::remove_file(&path).map_err(|e| format!("删除文件失败: {}", e))
    }
}

/// 将文件移到废纸篓（而非永久删除）
#[tauri::command]
pub async fn move_to_trash(path: String) -> Result<(), String> {
    validate_path(&path)?;
    let home = dirs::home_dir().ok_or("无法获取主目录")?;
    let trash_dir = home.join(".Trash");

    let file_name = std::path::Path::new(&path)
        .file_name()
        .ok_or("无法获取文件名")?
        .to_string_lossy()
        .to_string();

    let mut trash_path = trash_dir.join(&file_name);
    // 处理同名文件
    let mut counter = 1;
    while trash_path.exists() {
        let new_name = format!("{} ({})", file_name, counter);
        trash_path = trash_dir.join(new_name);
        counter += 1;
    }

    std::fs::rename(&path, &trash_path).map_err(|e| format!("移到废纸篓失败: {}", e))
}

/// 重命名文件或目录
#[tauri::command]
pub async fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    validate_path(&old_path)?;
    validate_path(&new_path)?;
    std::fs::rename(&old_path, &new_path).map_err(|e| format!("重命名失败: {}", e))
}

/// 检查文件或目录是否存在
#[tauri::command]
pub async fn file_exists(path: String) -> bool {
    if validate_path(&path).is_err() {
        return false;
    }
    std::path::Path::new(&path).exists()
}

/// 算出「在文件管理器里定位这个文件」该用哪个命令与参数（纯函数，可测）
///
/// 平台差异：
/// - macOS：`open -R <path>` —— 在 Finder 里**选中**该文件；
/// - Windows：`explorer /select,<path>` —— 资源管理器里选中；
/// - Linux：`xdg-open <父目录>` —— 没有等价的「选中」语义，退化成打开所在目录。
pub fn reveal_command(path: &Path) -> (String, Vec<String>) {
    let target = path.to_string_lossy().to_string();
    if cfg!(target_os = "windows") {
        ("explorer".to_string(), vec![format!("/select,{}", target)])
    } else if cfg!(target_os = "macos") {
        ("open".to_string(), vec!["-R".to_string(), target])
    } else {
        let parent = path
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| target.clone());
        ("xdg-open".to_string(), vec![parent])
    }
}

/// 在系统文件管理器中定位（选中）文件
///
/// **2026-10-22 修**：前端 `BinaryViewer.tsx` 的「在文件管理器中显示」
/// 一直在调 `show_in_folder`，但**后端从来没有注册过这个命令**
/// ⇒ invoke 直接报 "command not found"，而前端把错误 `catch { /* noop */ }` 吞掉
/// ⇒ **按钮点了没有任何反应，也没有任何提示**。
/// （db 仓把同一类叫「界面说成功、事实不是」；这里是「界面说能做、事实是啥也没发生」。）
#[tauri::command]
pub async fn show_in_folder(path: String) -> Result<(), String> {
    show_in_folder_at(&path)
}

/// show_in_folder 的实体：单列出来让测试能直接喂路径（async 命令在测试里跑不了）
pub fn show_in_folder_at(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    if !p.exists() {
        return Err(format!("文件不存在: {}", path));
    }
    // 路径校验：只允许笔记库/常见笔记位置/应用数据/临时目录里的文件
    let canonical = validate_path(path)?;
    let (program, args) = reveal_command(&canonical);
    std::process::Command::new(&program)
        .args(&args)
        .spawn()
        .map_err(|e| format!("在文件管理器中显示失败: {}", e))?;
    Ok(())
}

/// 列出目录内容（单层；子目录的 children 由前端展开时按需加载，避免大目录递归遍历阻塞 UI）
#[tauri::command]
pub async fn list_dir(path: String) -> Result<Vec<FileEntry>, String> {
    validate_path(&path)?;
    list_dir_single(&PathBuf::from(&path))
}

/// 递归列出目录全部内容（供快速切换器等需要全量文件列表的场景）
#[tauri::command]
pub async fn list_dir_recursive(path: String) -> Result<Vec<FileEntry>, String> {
    validate_path(&path)?;
    list_dir_recursive_impl(&PathBuf::from(&path))
}

/// 递归列出的内部实现
fn list_dir_recursive_impl(dir: &PathBuf) -> Result<Vec<FileEntry>, String> {
    let mut single = list_dir_single(dir)?;
    for entry in single.iter_mut() {
        if entry.is_dir {
            entry.children =
                list_dir_recursive_impl(&PathBuf::from(&entry.path)).unwrap_or_default();
        }
    }
    Ok(single)
}

/// 单层列出目录内容
fn list_dir_single(dir: &PathBuf) -> Result<Vec<FileEntry>, String> {
    if !dir.is_dir() {
        return Err(format!("路径不是目录: {}", dir.display()));
    }

    let mut entries: Vec<FileEntry> = Vec::new();
    let read_dir = fs::read_dir(dir).map_err(|e| format!("读取目录失败: {}", e))?;

    for entry in read_dir.flatten() {
        let path = entry.path();
        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        // 只显示目录和常见文件类型
        let is_dir = metadata.is_dir();
        let is_file = !is_dir;
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if !is_dir
            && !matches!(
                ext,
                "md" | "markdown"
                    | "png"
                    | "jpg"
                    | "jpeg"
                    | "gif"
                    | "webp"
                    | "svg"
                    | "pdf"
                    | "doc"
                    | "docx"
                    | "txt"
            )
        {
            continue;
        }

        let modified = metadata
            .modified()
            .map(|t| {
                let dt: DateTime<Local> = t.into();
                dt.format("%Y-%m-%d %H:%M:%S").to_string()
            })
            .unwrap_or_default();

        entries.push(FileEntry {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir,
            is_file,
            size: metadata.len(),
            modified,
            children: vec![],
        });
    }

    // 排序：目录在前，文件在后
    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.cmp(&b.name)));

    Ok(entries)
}

/// 递归搜索目录中所有 markdown 文件的内容（旧版暴力搜索，已由 FTS5 替代）
#[tauri::command]
pub async fn search_in_files(dir: String, query: String) -> Result<Vec<SearchMatch>, String> {
    validate_path(&dir)?;
    let query_lower = query.to_lowercase();
    let mut results: Vec<SearchMatch> = Vec::new();
    search_in_files_recursive(&PathBuf::from(&dir), &query_lower, &mut results)?;
    Ok(results)
}

/// 递归搜索 markdown 文件内容的内部实现
fn search_in_files_recursive(
    dir: &PathBuf,
    query_lower: &str,
    results: &mut Vec<SearchMatch>,
) -> Result<(), String> {
    let read_dir = fs::read_dir(dir).map_err(|e| format!("读取目录失败: {}", e))?;

    for entry in read_dir.flatten() {
        let path = entry.path();

        if path.is_dir() {
            search_in_files_recursive(&path, query_lower, results)?;
            continue;
        }

        if !is_markdown_path(&path) {
            continue;
        }

        if let Ok(content) = fs::read_to_string(&path) {
            let file_path = path.to_string_lossy().to_string();
            for (line_num, line) in content.lines().enumerate() {
                let line_lower = line.to_lowercase();
                if let Some(pos) = line_lower.find(query_lower) {
                    // 提取匹配位置前后共50个字符的预览
                    let chars: Vec<char> = line.chars().collect();
                    let preview = if chars.len() > 50 {
                        let match_char_pos = line[..pos].chars().count();
                        let preview_start = match_char_pos.saturating_sub(10);
                        let preview_end = (match_char_pos + 40).min(chars.len());
                        let preview_str: String =
                            chars[preview_start..preview_end].iter().collect();
                        format!("{}...", preview_str)
                    } else {
                        line.to_string()
                    };
                    results.push(SearchMatch {
                        file_path: file_path.clone(),
                        line: line_num + 1,
                        preview,
                    });
                }
            }
        }
    }

    Ok(())
}

/// 递归读取目录中所有 markdown 笔记的摘要信息（用于知识图谱）
#[tauri::command]
pub async fn read_all_notes(dir: String) -> Result<Vec<NoteSummary>, String> {
    validate_path(&dir)?;
    let mut results: Vec<NoteSummary> = Vec::new();
    read_all_notes_recursive(&PathBuf::from(&dir), &mut results)?;
    Ok(results)
}

/// 递归读取笔记摘要的内部实现
fn read_all_notes_recursive(dir: &PathBuf, results: &mut Vec<NoteSummary>) -> Result<(), String> {
    let read_dir = fs::read_dir(dir).map_err(|e| format!("读取目录失败: {}", e))?;

    for entry in read_dir.flatten() {
        let path = entry.path();

        if path.is_dir() {
            read_all_notes_recursive(&path, results)?;
            continue;
        }

        if !is_markdown_path(&path) {
            continue;
        }

        if let Ok(content) = fs::read_to_string(&path) {
            let title = extract_title(&content);
            let tags = extract_tags(&content);
            let links = extract_links(&content);

            results.push(NoteSummary {
                file_path: path.to_string_lossy().to_string(),
                title,
                tags,
                links,
            });
        }
    }

    Ok(())
}

/// 查找反向链接：搜索所有 markdown 文件中引用了指定笔记标题的文件
#[tauri::command]
pub async fn find_backlinks(
    dir: String,
    note_title: String,
    note_path: String,
) -> Result<Vec<BacklinkEntry>, String> {
    validate_path(&dir)?;
    if !note_path.is_empty() {
        validate_path(&note_path)?;
    }
    let mut results: Vec<BacklinkEntry> = Vec::new();
    find_backlinks_recursive(&PathBuf::from(&dir), &note_title, &note_path, &mut results)?;
    Ok(results)
}

/// 递归查找反向链接的内部实现
fn find_backlinks_recursive(
    dir: &PathBuf,
    note_title: &str,
    note_path: &str,
    results: &mut Vec<BacklinkEntry>,
) -> Result<(), String> {
    let read_dir = fs::read_dir(dir).map_err(|e| format!("读取目录失败: {}", e))?;

    for entry in read_dir.flatten() {
        let path = entry.path();

        if path.is_dir() {
            find_backlinks_recursive(&path, note_title, note_path, results)?;
            continue;
        }

        if !is_markdown_path(&path) {
            continue;
        }

        // 跳过自身
        if path.to_string_lossy() == note_path {
            continue;
        }

        if let Ok(content) = fs::read_to_string(&path) {
            let file_path = path.to_string_lossy().to_string();
            let title = extract_title(&content);

            // 搜索 [[note_title]] 或 [[note_title#heading]] 格式
            let pattern = format!("[[{}", note_title);
            let mut found = false;

            for line in content.lines() {
                if line.contains(&pattern) {
                    // 验证是完整的 [[...]] 链接
                    if let Some(start) = line.find(&format!("[[{}", note_title)) {
                        let after = &line[start + 2..];
                        if let Some(end) = after.find("]]") {
                            let link_content = &after[..end];
                            // link_content 应该是 note_title 或 note_title#heading
                            if (link_content == note_title
                                || link_content.starts_with(&format!("{}#", note_title)))
                                && !found
                            {
                                found = true;
                                // 提取包含链接的行的前100个字符作为预览
                                let preview = if line.chars().count() > 100 {
                                    let truncated: String = line.chars().take(100).collect();
                                    format!("{}...", truncated)
                                } else {
                                    line.to_string()
                                };
                                results.push(BacklinkEntry {
                                    file_path: file_path.clone(),
                                    title: title.clone(),
                                    preview,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

/// AI聊天代理：转发请求到 AI 服务商。
///
/// 协议、鉴权、响应解析已收口到 cap-llm（见 ai.rs 头部说明）—— 这里只做
/// 「收参数、调封装」。2026-10-26 之前这里是本仓自拼的
/// `/chat/completions` 请求 + 手写 JSON 取值，是家族十套重复实现的之一。
#[tauri::command]
pub async fn ai_chat(
    config: AiConfigPayload,
    messages: Vec<ChatMessage>,
) -> Result<String, String> {
    crate::ai::chat(&config, &messages).await
}

/// AI 流式聊天：通过 SSE 推送 token，前端 listen('ai-stream://token') 增量显示。
#[tauri::command]
pub async fn ai_chat_stream(
    config: AiConfigPayload,
    messages: Vec<ChatMessage>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let result = crate::ai::chat_stream(&config, &messages, |token| {
        let _ = app.emit("ai-stream://token", token);
    })
    .await;

    match result {
        Ok(full) => {
            let _ = app.emit("ai-stream://done", serde_json::json!({ "full": full }));
            Ok(())
        }
        Err(e) => {
            let _ = app.emit("ai-stream://error", &e);
            Err(e)
        }
    }
}


/// 列出可选的 AI 服务商预设。
///
/// 单一事实源在 `cap-llm::presets` —— 前端**不许**再留第二份表。
/// 以前设置页有 6 个手写按钮，连模型名一起写死（`glm-4-flash` /
/// `moonshot-v1-8k` 这些早已换代），界面看着正常、点了就 404。
#[tauri::command]
pub fn list_llm_presets() -> Vec<crate::ai::PresetView> {
    crate::ai::list_llm_presets()
}

/// 用「表单里的草稿配置」拉模型列表（不必先保存）。
///
/// 刻意收草稿而非读磁盘：用户是「填完 key 先点获取模型、满意了才保存」，
/// 读磁盘会让他看到上一次的旧结果，误判新 key 不可用。
#[tauri::command]
pub async fn list_llm_models(
    config: AiConfigPayload,
) -> Result<Vec<String>, crate::ai::LlmFailure> {
    crate::ai::list_models(&config).await
}

/// 测试连接：发一个 1 token 的对话。
///
/// 不用 `/models` 探活 —— 很多自建代理不实现它，会把「服务好好的、
/// 只是没这个接口」误报成「连不上」。
#[tauri::command]
pub async fn test_ai_config(config: AiConfigPayload) -> Result<String, crate::ai::LlmFailure> {
    crate::ai::test_connection(&config).await
}

/// 创建笔记备份（版本历史）
/// 备份存储在 ~/.z-note/backups/{note_id}/ 目录下，文件名为 {timestamp}.md
/// 最多保留 20 个备份版本
#[tauri::command]
pub async fn create_backup(note_path: String, content: String) -> Result<(), String> {
    // note_path 来自前端，必须校验防越界备份
    validate_path(&note_path)?;
    let base = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let backup_base = base.join(".z-note").join("backups");

    // 从文件路径生成备份目录名（替换 / 为 _）
    let safe_name = note_path.replace(['/', '\\'], "_");
    let backup_dir = backup_base.join(&safe_name);
    fs::create_dir_all(&backup_dir).map_err(|e| format!("创建备份目录失败: {}", e))?;

    // 写入备份文件（原子写，避免备份中途损坏）
    let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
    let backup_path = backup_dir.join(format!("{}.md", timestamp));
    atomic_write_str(&backup_path, &content).map_err(|e| format!("写入备份失败: {}", e))?;

    // 清理旧备份，只保留最近 20 个
    if let Ok(entries) = fs::read_dir(&backup_dir) {
        let mut files: Vec<_> = entries.flatten().collect();
        files.sort_by_key(|e| e.file_name());
        while files.len() > 20 {
            if let Some(old) = files.first() {
                let _ = fs::remove_file(old.path());
            }
            files.remove(0);
        }
    }

    Ok(())
}

/// 列出笔记的备份版本
#[tauri::command]
pub async fn list_backups(note_path: String) -> Result<Vec<BackupEntry>, String> {
    validate_path(&note_path)?;
    let base = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let backup_base = base.join(".z-note").join("backups");
    let safe_name = note_path.replace(['/', '\\'], "_");
    let backup_dir = backup_base.join(&safe_name);

    if !backup_dir.exists() {
        return Ok(vec![]);
    }

    let mut entries = Vec::new();
    if let Ok(dir_entries) = fs::read_dir(&backup_dir) {
        for entry in dir_entries.flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|ext| ext == "md") {
                let filename = path.file_name().unwrap().to_string_lossy().to_string();
                let timestamp = filename.trim_end_matches(".md").to_string();
                let modified = path
                    .metadata()
                    .and_then(|m| m.modified())
                    .map(|t| {
                        let dt: DateTime<Local> = t.into();
                        dt.format("%Y-%m-%d %H:%M:%S").to_string()
                    })
                    .unwrap_or_default();
                entries.push(BackupEntry {
                    path: path.to_string_lossy().to_string(),
                    timestamp,
                    modified,
                });
            }
        }
    }

    entries.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(entries)
}

/// 恢复备份版本（安全约束：必须验证 backup_path 与 target_path 都位于允许目录内，
/// 防止前端被劫持后覆盖任意系统文件，例如 /etc/passwd）
#[tauri::command]
pub async fn restore_backup(backup_path: String, target_path: String) -> Result<(), String> {
    // 两个路径都做 canonicalize + 范围校验
    validate_path(&backup_path).map_err(|e| format!("备份路径非法: {}", e))?;
    validate_path(&target_path).map_err(|e| format!("目标路径非法: {}", e))?;

    let backup = std::path::Path::new(&backup_path);
    if !backup.is_file() {
        return Err(format!("备份文件不存在: {}", backup_path));
    }
    let target = std::path::Path::new(&target_path);

    let content = fs::read_to_string(backup).map_err(|e| format!("读取备份失败: {}", e))?;
    atomic_write_str(target, &content).map_err(|e| format!("恢复备份失败: {}", e))
}

/// 获取文件修改时间（用于检测外部修改）
#[tauri::command]
pub async fn get_file_modified(path: String) -> Result<String, String> {
    validate_path(&path)?;
    let metadata = fs::metadata(&path).map_err(|e| format!("获取文件信息失败: {}", e))?;
    let modified = metadata
        .modified()
        .map(|t| {
            let dt: DateTime<Local> = t.into();
            dt.format("%Y-%m-%d %H:%M:%S").to_string()
        })
        .map_err(|e| format!("获取修改时间失败: {}", e))?;
    Ok(modified)
}

/// 读取任意文件并以 Base64 字符串返回（用于图片/PDF/视频/Office 等二进制文件）
#[tauri::command]
pub async fn read_file_binary(path: String) -> Result<String, String> {
    validate_path(&path)?;
    let bytes = fs::read(&path).map_err(|e| format!("读取文件失败: {}", e))?;
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    Ok(STANDARD.encode(&bytes))
}

/// 读取任意文件的基础元信息（大小、修改时间、MIME 推断）
#[derive(Serialize)]
pub struct FileMeta {
    pub size: u64,
    pub modified: String,
    pub mime: String,
}

#[tauri::command]
pub async fn get_file_meta(path: String) -> Result<FileMeta, String> {
    use std::path::Path;
    validate_path(&path)?;
    let metadata = fs::metadata(&path).map_err(|e| format!("获取文件信息失败: {}", e))?;
    let modified = metadata
        .modified()
        .map(|t| {
            let dt: DateTime<Local> = t.into();
            dt.format("%Y-%m-%d %H:%M:%S").to_string()
        })
        .unwrap_or_else(|_| "未知".to_string());
    let mime = guess_mime_from_ext(
        Path::new(&path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or(""),
    );
    Ok(FileMeta {
        size: metadata.len(),
        modified,
        mime,
    })
}

/// 根据扩展名猜 MIME（覆盖常见图片/音视频/PDF/Office/文本类型）
fn guess_mime_from_ext(ext: &str) -> String {
    let ext = ext.to_lowercase();
    let mime = match ext.as_str() {
        // 图片
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "heic" | "heif" => "image/heic",
        // 音视频
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "flac" => "audio/flac",
        "m4a" => "audio/mp4",
        "aac" => "audio/aac",
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        // 文档
        "pdf" => "application/pdf",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        // 文本
        "md" | "markdown" => "text/markdown",
        "txt" | "log" => "text/plain",
        "json" => "application/json",
        "xml" => "application/xml",
        "yaml" | "yml" => "application/yaml",
        "toml" => "application/toml",
        "ini" | "conf" => "text/plain",
        "csv" | "tsv" => "text/csv",
        "html" | "htm" => "text/html",
        "css" => "text/css",
        "js" | "mjs" => "application/javascript",
        "ts" | "tsx" => "application/typescript",
        "jsx" => "application/jsx",
        // 代码
        "py" => "text/x-python",
        "rs" => "text/x-rust",
        "go" => "text/x-go",
        "java" => "text/x-java",
        "kt" | "kts" => "text/x-kotlin",
        "swift" => "text/x-swift",
        "c" | "h" => "text/x-c",
        "cpp" | "cc" | "cxx" | "hpp" => "text/x-c++",
        "cs" => "text/x-csharp",
        "rb" => "text/x-ruby",
        "php" => "text/x-php",
        "sh" | "bash" | "zsh" => "text/x-shellscript",
        "sql" => "text/x-sql",
        "scss" | "less" => "text/x-scss",
        "vue" | "svelte" => "text/x-vue",
        _ => "application/octet-stream",
    };
    mime.to_string()
}

// ==================== Phase 2: 搜索索引 / 文件监听 / 增量图谱 ====================

use crate::index::{IndexStatus, IndexStore, IndexedMatch};
use crate::rag::{self, RagStatus};
use crate::watcher::WatcherState;
use parking_lot::Mutex;
use tauri::{Emitter, State};

// ==================== 问笔记（RAG，原 kb 仓的能力并入） ====================
//
// 与 kb 的差异一句话讲完：kb 问的是「上传的 PDF」，这里问的是「你自己的
// 笔记」—— 语料就是 FTS 索引旁边的片段表，保存一篇笔记就自动重建它的
// 片段，不需要任何「先上传」的动作。

/// BM25 索引的进程内缓存。
///
/// 每次提问都从 SQLite 读全部片段再建索引，1000 篇笔记要几百毫秒；
/// 缓存键是片段表版本号（IndexStore::chunks_epoch），保存/删除/改名任何
/// 一次都会让版本号跳变，缓存随之失效 —— 不存在「答了删掉的内容」的窗口。
pub struct RagState(Mutex<Option<(u64, rag::Bm25Index)>>);

impl RagState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

impl Default for RagState {
    fn default() -> Self {
        Self::new()
    }
}

/// 拿到（必要时重建）检索索引并完成一次检索。锁只护缓存读写；
/// 几千片的 BM25 检索是微秒级，在锁内做不构成争用。
fn search_rag(
    index: &IndexStore,
    rag_state: &RagState,
    question: &str,
    top_k: usize,
    only_path: Option<&str>,
) -> Result<Vec<rag::Citation>, String> {
    let epoch = index.chunks_epoch();
    let mut guard = rag_state.0.lock();
    if guard.as_ref().is_none_or(|(e, _)| *e != epoch) {
        let chunks = index.load_chunks()?;
        *guard = Some((epoch, rag::Bm25Index::build(chunks)));
    }
    let cached = &guard.as_ref().expect("上面刚填充").1;
    let hits = cached.search(question, top_k, only_path);
    Ok(rag::to_citations(cached, &hits))
}

/// 索引规模（前端显示「已索引 N 段 / M 篇」）
#[tauri::command]
pub async fn rag_status(index: State<'_, IndexStore>) -> Result<RagStatus, String> {
    let (notes, chunks) = index.corpus_status()?;
    Ok(RagStatus { notes, chunks })
}

/// 问答事件：引用先到、token 后到、done 收尾，前端按这个顺序渲染。
mod ask_events {
    pub const CITATIONS: &str = "ask://citations";
    pub const TOKEN: &str = "ask://token";
    pub const DONE: &str = "ask://done";
    pub const ERROR: &str = "ask://error";
}

/// 问自己的笔记（流式）。
///
/// 事件序列：
/// 1. `ask://citations` — 检索到的证据（先给，用户在模型说话前就能点开来源）
/// 2. `ask://token` × N — 回答增量
/// 3. `ask://done` — `{ answer, citations }` 收尾
/// 失败时发 `ask://error` 并返回 Err。
#[tauri::command]
pub async fn ask_notes(
    question: String,
    scope: Option<String>,
    note_path: Option<String>,
    config: AiConfigPayload,
    index: State<'_, IndexStore>,
    rag_state: State<'_, RagState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let question = question.trim().to_string();
    if question.is_empty() {
        return Err("问题不能为空".to_string());
    }
    let scoped = scope.as_deref() == Some("note");
    let only_path = if scoped { note_path.as_deref() } else { None };

    // 1. 检索
    let citations = search_rag(&index, &rag_state, &question, rag::DEFAULT_TOP_K, only_path)?;
    let corpus_chunks = index
        .corpus_status()
        .map(|(_, c)| c)
        .unwrap_or(0);

    // 2. 证据先发给前端（哪怕最终要走向「没找到」的兜底话术）
    let _ = app.emit(ask_events::CITATIONS, &citations);

    // 3. 没有证据就不花一次模型调用：直接给引导话术
    if citations.is_empty() {
        let (notes, _) = index.corpus_status()?;
        let msg = rag::no_evidence_message(corpus_chunks, scoped && notes > 0);
        let _ = app.emit(
            ask_events::DONE,
            serde_json::json!({ "answer": msg, "citations": [] }),
        );
        return Ok(());
    }

    // 4. 组提示词，流式回答
    let messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: rag::SYSTEM_PROMPT.to_string(),
        },
        ChatMessage {
            role: "user".to_string(),
            content: rag::build_user_message(&question, &citations),
        },
    ];

    let result = crate::ai::chat_stream(&config, &messages, |token| {
        let _ = app.emit(ask_events::TOKEN, token);
    })
    .await;

    match result {
        Ok(answer) => {
            let _ = app.emit(
                ask_events::DONE,
                serde_json::json!({ "answer": answer, "citations": citations }),
            );
            Ok(())
        }
        Err(e) => {
            let _ = app.emit(ask_events::ERROR, &e);
            Err(e)
        }
    }
}

/// 索引笔记文件：内部命令（前端一般不需要直接调）。
/// 行为：读取文件、提取 title/tags/links、写入 FTS5 索引。
#[tauri::command]
pub async fn index_upsert_note(path: String, index: State<'_, IndexStore>) -> Result<(), String> {
    validate_path(&path)?;
    let content = fs::read_to_string(&path).map_err(|e| format!("读取失败: {}", e))?;
    let title = extract_title(&content);
    let tags = extract_tags(&content).join(",");
    let links = extract_links(&content).join(",");
    let meta = fs::metadata(&path).map_err(|e| format!("元信息失败: {}", e))?;
    let mtime = meta
        .modified()
        .map(|t| {
            t.duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0)
        })
        .unwrap_or(0);
    let size = meta.len() as i64;
    index.upsert_note(&path, &title, &content, mtime, size, &tags, &links)
}

/// 从索引中删除单条
#[tauri::command]
pub async fn index_delete_note(path: String, index: State<'_, IndexStore>) -> Result<(), String> {
    validate_path(&path)?;
    index.delete_note(&path)
}

/// 全文搜索（FTS5 + BM25 排序）
#[tauri::command]
pub async fn search_notes(
    query: String,
    index: State<'_, IndexStore>,
    limit: Option<usize>,
) -> Result<Vec<IndexedMatch>, String> {
    index.search(&query, limit.unwrap_or(50))
}

/// 全量重建索引：扫描 dir 下所有 markdown 笔记，按 mtime 与现有条目对比，仅 upsert 变化项。
/// 返回最终状态。
#[tauri::command]
pub async fn rebuild_index(
    dir: String,
    index: State<'_, IndexStore>,
) -> Result<IndexStatus, String> {
    validate_path(&dir)?;

    // 1. 取出已有索引
    let existing = index.list_paths()?;
    let existing_map: std::collections::HashMap<String, i64> = existing.into_iter().collect();

    // 2. 扫描目录
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut to_upsert: Vec<String> = Vec::new();
    let mut to_delete: Vec<String> = Vec::new();

    scan_md_recursive(&PathBuf::from(&dir), &mut seen)?;
    for path in &seen {
        let meta = match fs::metadata(path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let mtime = meta
            .modified()
            .map(|t| {
                t.duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0)
            })
            .unwrap_or(0);
        match existing_map.get(path) {
            Some(&old_mtime) if old_mtime == mtime => {
                // 未变化，跳过
            }
            _ => to_upsert.push(path.clone()),
        }
    }
    for path in existing_map.keys() {
        if !seen.contains(path) {
            to_delete.push(path.clone());
        }
    }

    // 3. 应用变更
    for path in &to_delete {
        let _ = index.delete_note(path);
    }
    for path in &to_upsert {
        let result: Result<(), String> = (|| {
            let content = fs::read_to_string(path).map_err(|e| format!("读取失败: {}", e))?;
            let title = extract_title(&content);
            let tags = extract_tags(&content).join(",");
            let links = extract_links(&content).join(",");
            let meta = fs::metadata(path).map_err(|e| format!("元信息失败: {}", e))?;
            let mtime = meta
                .modified()
                .map(|t| {
                    t.duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs() as i64)
                        .unwrap_or(0)
                })
                .unwrap_or(0);
            let size = meta.len() as i64;
            index.upsert_note(path, &title, &content, mtime, size, &tags, &links)
        })();
        if let Err(e) = result {
            eprintln!("[rebuild_index] upsert 失败 ({}): {}", path, e);
        }
    }

    Ok(index.status())
}

/// 递归扫描返回所有 markdown 文件路径
fn scan_md_recursive(
    dir: &std::path::Path,
    out: &mut std::collections::HashSet<String>,
) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("读取目录失败: {}", e))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            // 跳过常见排除目录
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if matches!(
                name,
                ".git" | "node_modules" | ".z-note" | "images" | ".trash"
            ) {
                continue;
            }
            scan_md_recursive(&path, out)?;
            continue;
        }
        if is_markdown_path(&path) {
            out.insert(path.to_string_lossy().to_string());
        }
    }
    Ok(())
}

/// 索引状态（前端 StatusBar / 调试用）
#[tauri::command]
pub fn index_status(index: State<'_, IndexStore>) -> IndexStatus {
    index.status()
}

/// 启动对 dir 的文件监听（替换 5 秒轮询）
#[tauri::command]
pub async fn start_watch(
    dir: String,
    watcher: State<'_, WatcherState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    validate_path(&dir)?;
    watcher.watch(PathBuf::from(dir), app)
}

/// 停止当前监听
#[tauri::command]
pub async fn stop_watch(watcher: State<'_, WatcherState>) -> Result<(), String> {
    watcher.unwatch();
    Ok(())
}

#[cfg(test)]
mod read_note_tests {
    use super::{note_path_in, read_note_in};
    use crate::atomic_write::atomic_write_str;
    use std::fs;

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!(
            "zennote-read-note-{}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            tag
        ));
        fs::create_dir_all(&p).unwrap();
        p
    }

    /// "没这篇"和"这篇是空的"必须是两个不同的返回值——改之前两者都是 ""，
    /// 嵌入块于是永远分不清该提示"找不到"还是渲染空内容。
    #[test]
    fn missing_and_empty_are_distinguishable() {
        let dir = temp_dir("shape");
        atomic_write_str(&dir.join("empty.md"), "").unwrap();
        atomic_write_str(&dir.join("hello.md"), "# Hello\n").unwrap();

        assert_eq!(read_note_in(&dir, "empty"), Some(String::new()));
        assert_eq!(read_note_in(&dir, "hello"), Some("# Hello\n".to_string()));
        assert_eq!(read_note_in(&dir, "nope"), None);
        assert_eq!(read_note_in(&dir, ""), None);
        fs::remove_dir_all(&dir).ok();
    }

    /// id 来自正文里的 `![[...]]`，是用户可控输入：不能顺着它跳出笔记库。
    /// 对照组证明这不是"文件本来就读不到"：同一个 secret 用笔记库根去读是能读到的。
    #[test]
    fn traversal_ids_are_rejected() {
        let base = temp_dir("guard");
        let library = base.join("notes");
        fs::create_dir_all(&library).unwrap();
        atomic_write_str(&base.join("secret.md"), "leaked").unwrap();

        for bad in ["../secret", "..\\secret", "a/b", "sub/../secret", ".."] {
            assert_eq!(
                note_path_in(&library, bad),
                None,
                "id {bad:?} 不该解析成路径"
            );
            assert_eq!(
                read_note_in(&library, bad),
                None,
                "id {bad:?} 读到了库外内容"
            );
        }
        assert_eq!(read_note_in(&base, "secret"), Some("leaked".to_string()));
        fs::remove_dir_all(&base).ok();
    }
}

#[cfg(test)]
mod minimax_live_tests {
    use super::{ai_chat, AiConfigPayload, ChatMessage};

    /// **真实 API 实测**：用真的 MiniMax 端点跑一遍本仓自己的 `ai_chat`。
    ///
    /// 为什么不写桩：桩只能证明「请求拼得像 OpenAI」，证明不了
    /// 「MiniMax 真的认这个协议」—— 而本仓的 `ai_chat` 就是要直连第三方服务。
    /// 2026-10-20 实测：MiniMax 开放平台是 OpenAI 兼容的，
    /// `https://api.minimaxi.com/v1/chat/completions` 返回 200。
    ///
    /// 跑法：`MINIMAX_API_KEY=<key> cargo test --lib minimax`
    /// **没设 key 就显式跳过并打印原因**，不静默通过 ——
    /// 「跳过了」和「跑过了」在报告里必须长得不一样。
    #[tokio::test]
    async fn minimax_live_chat() {
        let Ok(key) = std::env::var("MINIMAX_API_KEY") else {
            eprintln!(
                "[LIVE] 跳过 minimax 真实 API 实测：未设置 MINIMAX_API_KEY（这是「没跑」，不是「跑过了」）"
            );
            return;
        };
        let cfg = AiConfigPayload {
            base_url: std::env::var("MINIMAX_BASE_URL")
                .unwrap_or_else(|_| "https://api.minimaxi.com/v1".to_string()),
            api_key: key,
            model: std::env::var("MINIMAX_MODEL")
                .unwrap_or_else(|_| "MiniMax-M3.1-Flash".to_string()),
        };
        let msgs = vec![ChatMessage {
            role: "user".to_string(),
            content: "只回两个字：收到".to_string(),
        }];
        let out = ai_chat(cfg, msgs).await.expect("真实调用应成功");
        assert!(!out.trim().is_empty(), "返回内容为空");
        eprintln!(
            "[LIVE] note ai_chat 真实调用成功：{}",
            out.chars().take(40).collect::<String>()
        );
    }

    /// 假 key 必须被服务端拒 —— 反向钉，证明上面的 live 用例不是恒绿。
    #[tokio::test]
    async fn minimax_live_rejects_bad_key() {
        let Ok(_key) = std::env::var("MINIMAX_API_KEY") else {
            eprintln!("[LIVE] 跳过（未设置 MINIMAX_API_KEY）");
            return;
        };
        let cfg = AiConfigPayload {
            base_url: "https://api.minimaxi.com/v1".to_string(),
            api_key: "sk-cp-definitely-invalid-key".to_string(),
            model: "MiniMax-M3.1-Flash".to_string(),
        };
        let msgs = vec![ChatMessage {
            role: "user".to_string(),
            content: "hi".to_string(),
        }];
        let err = ai_chat(cfg, msgs).await.expect_err("假 key 必须被拒");
        assert!(
            err.contains("401") || err.contains("403"),
            "期望 401/403，实际错误：{err}"
        );
    }
}

#[cfg(test)]
mod ai_payload_wire_tests {
    use super::AiConfigPayload;

    /// **线上形状**测试：前端 `AIConfig`（src/types/index.ts）的字段名是
    /// `baseURL` / `apiKey`（camelCase，且 URL 是全大写），而 Rust 结构体字段是
    /// `base_url` / `api_key`。**Tauri v2 只对顶层参数做 camelCase → snake_case，
    /// 嵌套结构体的字段名走 serde 自己那套** ⇒ serde 默认只认 `base_url`。
    ///
    /// 为什么要有这条：上面那个 `minimax_live_chat` 是在 **Rust 里直接构造**
    /// `AiConfigPayload` 的 ⇒ 它证明的是「请求拼得像 OpenAI」，
    /// **证明不了「前端发过来的那份 JSON 能被反序列化」** ⇒
    /// 两边字段名对不上时，live 用例照样绿，而桌面端每一条 AI 请求都会失败。
    ///
    /// 这条把**前端真实发的那个 JSON** 钉住（不是推测的形状，是照抄
    /// `src/types/index.ts` 的 interface + `src/App.tsx` 传的对象）。
    #[test]
    fn accepts_frontend_camel_case_shape() {
        let raw = r#"{
            "provider": "minimax",
            "apiKey": "sk-test-not-a-real-key",
            "model": "MiniMax-M3.1-Flash",
            "baseURL": "https://api.minimaxi.com/v1",
            "enabled": true
        }"#;
        let cfg: AiConfigPayload = serde_json::from_str(raw)
            .expect("前端发来的 AIConfig 形状必须能被反序列化（否则桌面端每条 AI 请求都失败）");
        assert_eq!(cfg.base_url, "https://api.minimaxi.com/v1");
        assert_eq!(cfg.api_key, "sk-test-not-a-real-key");
        assert_eq!(cfg.model, "MiniMax-M3.1-Flash");
    }

    /// 反向钉：只认 snake_case 的形状必须**不再**被接受 ——
    /// 否则就变成「两种都收 ⇒ 到底是哪种说了算没人知道」。
    #[test]
    fn rejects_snake_case_shape() {
        let raw = r#"{"base_url":"https://x/v1","api_key":"k","model":"m"}"#;
        let err = serde_json::from_str::<AiConfigPayload>(raw)
            .expect_err("snake_case 形状应当不被接受（真源只有前端那一份）");
        assert!(
            err.to_string().contains("baseURL") || err.to_string().contains("apiKey"),
            "错误信息应当点名缺哪个字段，实际：{err}"
        );
    }
}

#[cfg(test)]
mod show_in_folder_tests {
    use super::{reveal_command, show_in_folder_at};
    use std::fs;
    use std::path::PathBuf;

    fn temp_dir(tag: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!(
            "zennote-show-in-folder-{}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            tag
        ));
        fs::create_dir_all(&p).unwrap();
        p
    }

    /// 平台映射不能写错：macOS 是 `open -R`（Finder 里**选中**），
    /// Windows 是 `explorer /select,`，Linux 没有「选中」语义 ⇒ 退化成打开父目录。
    #[test]
    fn reveal_command_matches_platform() {
        let (program, args) = reveal_command(std::path::Path::new("/tmp/x.txt"));
        if cfg!(target_os = "windows") {
            assert_eq!(program, "explorer");
            assert_eq!(args, vec!["/select,/tmp/x.txt".to_string()]);
        } else if cfg!(target_os = "macos") {
            assert_eq!(program, "open");
            assert_eq!(args, vec!["-R".to_string(), "/tmp/x.txt".to_string()]);
        } else {
            assert_eq!(program, "xdg-open");
            assert_eq!(args, vec!["/tmp".to_string()], "Linux 退化成打开父目录");
        }
    }

    /// 文件不存在 ⇒ 必须报错（而不是让系统命令去处理一个不存在的路径）
    #[test]
    fn missing_file_is_rejected() {
        let dir = temp_dir("missing");
        let p = dir.join("nope.bin");
        let err = show_in_folder_at(&p.to_string_lossy()).expect_err("不存在的文件必须拒");
        assert!(err.contains("不存在"), "错误要说清是文件不存在: {err}");
        let _ = fs::remove_dir_all(&dir);
    }

    /// 越界路径必须被路径校验挡下（这条命令会把路径交给系统命令 ⇒ 不能放行任意路径）
    #[test]
    fn path_outside_allowed_dirs_is_rejected() {
        // 选一个**在当前平台确实存在、但一定不在允许范围内**的路径。
        // ⚠ 不能用同一个字符串跨平台：Windows 上 `/etc/hosts` 压根不存在
        // ⇒ 会先被「文件不存在」拦下（那时错误里没有「路径」二字）
        // ⇒ 断言就红了（2026-10-23 实测：Windows CI 的 Tests 步就是被这一条顶红的）。
        #[cfg(target_os = "windows")]
        let outside = "C:\\Windows\\System32\\drivers\\etc\\hosts";
        #[cfg(not(target_os = "windows"))]
        let outside = "/etc/hosts";

        let err = show_in_folder_at(outside).expect_err("越界路径必须拒");
        assert!(
            err.contains("不在允许范围内"),
            "错误要说清是路径被拒（若这里报的是「不存在」，说明该平台上选的测试路径不对）: {err}"
        );
    }
}
