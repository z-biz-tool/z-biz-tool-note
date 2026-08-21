use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use chrono::{DateTime, Local};
use uuid::Uuid;

/// 验证路径是否在允许的目录范围内（防止路径遍历攻击）
fn validate_path(path: &str) -> Result<PathBuf, String> {
    let canonical = std::path::Path::new(path)
        .canonicalize()
        .map_err(|e| format!("路径无效: {}", e))?;

    // 允许访问用户主目录下的所有文件（笔记库通常在主目录下）
    // 以及 /tmp 目录（用于临时导出）
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
    let tmp = PathBuf::from("/tmp");

    if canonical.starts_with(&home) || canonical.starts_with(&tmp) {
        Ok(canonical)
    } else {
        Err(format!("路径不在允许范围内: {}", path))
    }
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

/// HTML 特殊字符转义（防止 XSS）
fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
     .replace('<', "&lt;")
     .replace('>', "&gt;")
     .replace('"', "&quot;")
     .replace('\'', "&#39;")
}

/// 从笔记内容提取标题（第一行 # 标题 或 第一行文本）
fn extract_title(content: &str) -> String {
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

/// 从笔记内容提取标签（#tag 格式）
fn extract_tags(content: &str) -> Vec<String> {
    let mut tags = std::collections::HashSet::new();
    for line in content.lines() {
        for word in line.split_whitespace() {
            if word.starts_with('#') && word.len() > 1 {
                let tag = word.trim_start_matches('#')
                    .trim_matches(|c: char| !c.is_alphanumeric() && (c < '\u{4e00}' || c > '\u{9fff}'))
                    .to_string();
                if !tag.is_empty() && tag.len() < 20 {
                    tags.insert(tag);
                }
            }
        }
    }
    tags.into_iter().collect()
}

/// 列出所有笔记
#[tauri::command]
pub fn list_notes() -> Vec<NoteMeta> {
    let dir = notes_dir();
    let mut notes: Vec<NoteMeta> = Vec::new();

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "md") {
                let filename = path.file_name().unwrap().to_string_lossy().to_string();
                let id = id_from_filename(&filename);

                if let Ok(content) = fs::read_to_string(&path) {
                    let title = extract_title(&content);
                    let tags = extract_tags(&content);

                    let created = path.metadata()
                        .and_then(|m| m.created())
                        .map(|t| {
                            let dt: DateTime<Local> = t.into();
                            dt.format("%Y-%m-%d %H:%M:%S").to_string()
                        })
                        .unwrap_or_default();

                    let modified = path.metadata()
                        .and_then(|m| m.modified())
                        .map(|t| {
                            let dt: DateTime<Local> = t.into();
                            dt.format("%Y-%m-%d %H:%M:%S").to_string()
                        })
                        .unwrap_or_default();

                    notes.push(NoteMeta { id, title, created, modified, tags });
                }
            }
        }
    }

    // 按修改时间倒序排列
    notes.sort_by(|a, b| b.modified.cmp(&a.modified));
    notes
}

/// 读取笔记内容
#[tauri::command]
pub fn read_note(id: String) -> String {
    let path = notes_dir().join(format!("{}.md", id));
    fs::read_to_string(&path).unwrap_or_default()
}

/// 保存笔记
#[tauri::command]
pub fn save_note(id: String, content: String) {
    let path = notes_dir().join(format!("{}.md", id));
    fs::write(&path, &content).ok();
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
pub fn create_note(title: String) -> String {
    let uuid = Uuid::new_v4().to_string();
    let id = &uuid[..8];
    let content = format!("# {}\n\n", title);
    let path = notes_dir().join(format!("{}.md", id));
    fs::write(&path, &content).ok();
    id.to_string()
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
        save_config(config.clone());
        config
    }
}

/// 保存配置
#[tauri::command]
pub fn save_config(config: Config) {
    let path = config_path();
    if let Ok(json) = serde_json::to_string_pretty(&config) {
        fs::write(&path, &json).ok();
    }
}

/// 导出笔记
#[tauri::command]
pub fn export_note(id: String, format: String, path: String) -> String {
    let note_path = notes_dir().join(format!("{}.md", id));
    let content = fs::read_to_string(&note_path).unwrap_or_default();

    let output = if format == "html" {
        // 简单的Markdown转HTML
        let mut html = String::from("<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><title>导出笔记</title><style>body{font-family:system-ui;max-width:800px;margin:0 auto;padding:20px;line-height:1.6}code{background:#f4f4f4;padding:2px 6px;border-radius:3px}pre{background:#f4f4f4;padding:12px;border-radius:6px;overflow-x:auto}blockquote{border-left:4px solid #ddd;margin:0;padding-left:16px;color:#666}</style></head><body>");
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("# ") {
                html.push_str(&format!("<h1>{}</h1>", escape_html(trimmed.trim_start_matches("# "))));
            } else if trimmed.starts_with("## ") {
                html.push_str(&format!("<h2>{}</h2>", escape_html(trimmed.trim_start_matches("## "))));
            } else if trimmed.starts_with("### ") {
                html.push_str(&format!("<h3>{}</h3>", escape_html(trimmed.trim_start_matches("### "))));
            } else if trimmed.starts_with("- ") || trimmed.starts_with("* ") {
                html.push_str(&format!("<li>{}</li>", escape_html(&trimmed[2..])));
            } else if trimmed.starts_with("> ") {
                html.push_str(&format!("<blockquote>{}</blockquote>", escape_html(trimmed.trim_start_matches("> "))));
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

    match fs::write(&path, &output) {
        Ok(_) => "导出成功".to_string(),
        Err(e) => format!("导出失败: {}", e),
    }
}

/// 导入笔记
#[tauri::command]
pub fn import_note(path: String) -> String {
    let content = fs::read_to_string(&path).unwrap_or_default();
    if content.is_empty() {
        return "导入失败: 文件为空".to_string();
    }

    let title = extract_title(&content);
    let uuid = Uuid::new_v4().to_string();
    let id = &uuid[..8];
    let note_path = notes_dir().join(format!("{}.md", id));
    fs::write(&note_path, &content).ok();
    id.to_string()
}

/// 列出回收站笔记
#[tauri::command]
pub fn list_trash() -> Vec<NoteMeta> {
    let dir = trash_dir();
    let mut notes: Vec<NoteMeta> = Vec::new();

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "md") {
                let filename = path.file_name().unwrap().to_string_lossy().to_string();
                let id = id_from_filename(&filename);

                if let Ok(content) = fs::read_to_string(&path) {
                    let title = extract_title(&content);
                    let modified = path.metadata()
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
pub fn save_image(note_id: String, data: String) -> Result<String, String> {
    let images_dir = notes_dir().join("images");
    if !images_dir.exists() {
        fs::create_dir_all(&images_dir).map_err(|e| format!("创建图片目录失败: {}", e))?;
    }
    // data格式: data:image/png;base64,xxxxx
    let (mime, b64) = if data.starts_with("data:") {
        let parts: Vec<&str> = data[5..].splitn(2, ',').collect();
        if parts.len() != 2 {
            return Err("无效的base64数据".to_string());
        }
        (parts[0].to_string(), parts[1].to_string())
    } else {
        return Err("只支持data URI格式".to_string());
    };
    let ext = if mime.contains("png") {
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
    };
    let filename = format!("{}-{}.{}", note_id, Uuid::new_v4().to_string()[..8].to_string(), ext);
    let path = images_dir.join(&filename);
    let bytes = base64_decode(&b64)?;
    fs::write(&path, bytes).map_err(|e| format!("写入图片失败: {}", e))?;
    Ok(format!("images/{}", filename))
}

/// 读取图片文件，返回base64 data URI
#[tauri::command]
pub fn read_image(path: String) -> Result<String, String> {
    let full_path = notes_dir().join(&path);
    if !full_path.exists() {
        return Err(format!("图片不存在: {}", path));
    }
    let bytes = fs::read(&full_path).map_err(|e| format!("读取图片失败: {}", e))?;
    let ext = full_path.extension().and_then(|e| e.to_str()).unwrap_or("png");
    let mime = match ext {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "image/png",
    };
    let b64 = base64_encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    use std::fmt::Write;
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let input = input.trim_end_matches('=');
    let mut result = Vec::with_capacity(input.len() * 3 / 4);
    let buf: Vec<u8> = input.bytes().filter_map(|b| CHARS.iter().position(|&c| c == b).map(|i| i as u8)).collect();
    for chunk in buf.chunks(4) {
        let b0 = chunk.get(0).copied().unwrap_or(0);
        let b1 = chunk.get(1).copied().unwrap_or(0);
        let b2 = chunk.get(2).copied().unwrap_or(0);
        let b3 = chunk.get(3).copied().unwrap_or(0);
        let triple = ((b0 as u32) << 18) | ((b1 as u32) << 12) | ((b2 as u32) << 6) | (b3 as u32);
        result.push(((triple >> 16) & 0xFF) as u8);
        if chunk.len() > 2 { result.push(((triple >> 8) & 0xFF) as u8); }
        if chunk.len() > 3 { result.push((triple & 0xFF) as u8); }
    }
    Ok(result)
}

fn base64_encode(input: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity(input.len() * 4 / 3 + 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0];
        let b1 = chunk.get(1).copied().unwrap_or(0);
        let b2 = chunk.get(2).copied().unwrap_or(0);
        let triple = ((b0 as u32) << 16) | ((b1 as u32) << 8) | (b2 as u32);
        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        result.push(if chunk.len() > 1 { CHARS[((triple >> 6) & 0x3F) as usize] as char } else { '=' });
        result.push(if chunk.len() > 2 { CHARS[(triple & 0x3F) as usize] as char } else { '=' });
    }
    result
}

/// 确保目录存在
#[tauri::command]
pub fn ensure_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| format!("创建目录失败: {}", e))
}

/// 写入文本文件
#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| format!("写入文件失败: {}", e))
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
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AiConfigPayload {
    pub base_url: String,
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

/// 写入内容到任意文件
#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    validate_path(&path)?;
    fs::write(&path, &content).map_err(|e| format!("写入文件失败: {}", e))
}

/// 删除文件或目录
#[tauri::command]
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

    std::fs::rename(&path, &trash_path)
        .map_err(|e| format!("移到废纸篓失败: {}", e))
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
pub fn file_exists(path: String) -> bool {
    if validate_path(&path).is_err() { return false; }
    std::path::Path::new(&path).exists()
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
            entry.children = list_dir_recursive_impl(&PathBuf::from(&entry.path)).unwrap_or_default();
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

        let name = path.file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        // 只显示目录和常见文件类型
        let is_dir = metadata.is_dir();
        let is_file = !is_dir;
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if !is_dir && !matches!(ext, "md" | "markdown" | "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "pdf" | "doc" | "docx" | "txt") {
            continue;
        }

        let modified = metadata.modified()
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
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then_with(|| a.name.cmp(&b.name))
    });

    Ok(entries)
}

/// 递归搜索目录中所有.md文件的内容
#[tauri::command]
pub async fn search_in_files(dir: String, query: String) -> Result<Vec<SearchMatch>, String> {
    let query_lower = query.to_lowercase();
    let mut results: Vec<SearchMatch> = Vec::new();
    search_in_files_recursive(&PathBuf::from(&dir), &query_lower, &mut results)?;
    Ok(results)
}

/// 递归搜索.md文件的内部实现
fn search_in_files_recursive(dir: &PathBuf, query_lower: &str, results: &mut Vec<SearchMatch>) -> Result<(), String> {
    let read_dir = fs::read_dir(dir).map_err(|e| format!("读取目录失败: {}", e))?;

    for entry in read_dir.flatten() {
        let path = entry.path();

        if path.is_dir() {
            search_in_files_recursive(&path, query_lower, results)?;
            continue;
        }

        if path.extension().map_or(true, |ext| ext != "md") {
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
                        let preview_str: String = chars[preview_start..preview_end].iter().collect();
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

/// 递归读取目录中所有.md文件的摘要信息（用于知识图谱）
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

        if path.extension().map_or(true, |ext| ext != "md") {
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

/// 从笔记内容提取 [[link]] 格式的链接
fn extract_links(content: &str) -> Vec<String> {
    let mut links = Vec::new();
    let mut seen = std::collections::HashSet::new();
    // 手动匹配 [[link]] 或 [[link#heading]] 格式
    let mut i = 0;
    let bytes = content.as_bytes();
    while i < content.len() {
        if bytes[i] == b'[' && i + 1 < content.len() && bytes[i + 1] == b'[' {
            // 找到 [[ 开始
            let start = i + 2;
            if let Some(end) = content[start..].find("]]") {
                let raw_link = &content[start..start + end];
                // 提取链接主体（去掉 #heading 部分）
                let link = raw_link.split('#').next().unwrap_or(raw_link).trim().to_string();
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

/// 查找反向链接：搜索所有.md文件中引用了指定笔记标题的文件
#[tauri::command]
pub async fn find_backlinks(dir: String, note_title: String, note_path: String) -> Result<Vec<BacklinkEntry>, String> {
    validate_path(&dir)?;
    if !note_path.is_empty() {
        validate_path(&note_path)?;
    }
    let mut results: Vec<BacklinkEntry> = Vec::new();
    find_backlinks_recursive(&PathBuf::from(&dir), &note_title, &note_path, &mut results)?;
    Ok(results)
}

/// 递归查找反向链接的内部实现
fn find_backlinks_recursive(dir: &PathBuf, note_title: &str, note_path: &str, results: &mut Vec<BacklinkEntry>) -> Result<(), String> {
    let read_dir = fs::read_dir(dir).map_err(|e| format!("读取目录失败: {}", e))?;

    for entry in read_dir.flatten() {
        let path = entry.path();

        if path.is_dir() {
            find_backlinks_recursive(&path, note_title, note_path, results)?;
            continue;
        }

        if path.extension().map_or(true, |ext| ext != "md") {
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
                            if link_content == note_title || link_content.starts_with(&format!("{}#", note_title)) {
                                if !found {
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
    }

    Ok(())
}

/// AI聊天代理：转发请求到OpenAI兼容API
#[tauri::command]
pub async fn ai_chat(config: AiConfigPayload, messages: Vec<ChatMessage>) -> Result<String, String> {
    // 构建请求URL
    let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));

    // 构建请求体
    let body = serde_json::json!({
        "model": config.model,
        "messages": messages,
    });

    // 发送HTTP POST请求
    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求AI服务失败: {}", e))?;

    // 检查HTTP状态码
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("AI服务返回错误: {} - {}", status, body));
    }

    // 解析响应JSON
    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析AI响应失败: {}", e))?;

    // 提取 choices[0].message.content
    let content = json
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .ok_or_else(|| "AI响应格式异常: 无法提取content".to_string())?;

    Ok(content.to_string())
}

/// 创建笔记备份（版本历史）
/// 备份存储在 ~/.z-note/backups/{note_id}/ 目录下，文件名为 {timestamp}.md
/// 最多保留 20 个备份版本
#[tauri::command]
pub fn create_backup(note_path: String, content: String) -> Result<(), String> {
    let base = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let backup_base = base.join(".z-note").join("backups");

    // 从文件路径生成备份目录名（替换 / 为 _）
    let safe_name = note_path.replace('/', "_").replace('\\', "_");
    let backup_dir = backup_base.join(&safe_name);
    fs::create_dir_all(&backup_dir).map_err(|e| format!("创建备份目录失败: {}", e))?;

    // 写入备份文件
    let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
    let backup_path = backup_dir.join(format!("{}.md", timestamp));
    fs::write(&backup_path, &content).map_err(|e| format!("写入备份失败: {}", e))?;

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
pub fn list_backups(note_path: String) -> Result<Vec<BackupEntry>, String> {
    validate_path(&note_path)?;
    let base = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let backup_base = base.join(".z-note").join("backups");
    let safe_name = note_path.replace('/', "_").replace('\\', "_");
    let backup_dir = backup_base.join(&safe_name);

    if !backup_dir.exists() {
        return Ok(vec![]);
    }

    let mut entries = Vec::new();
    if let Ok(dir_entries) = fs::read_dir(&backup_dir) {
        for entry in dir_entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "md") {
                let filename = path.file_name().unwrap().to_string_lossy().to_string();
                let timestamp = filename.trim_end_matches(".md").to_string();
                let modified = path.metadata()
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

/// 恢复备份版本
#[tauri::command]
pub fn restore_backup(backup_path: String, target_path: String) -> Result<(), String> {
    let content = fs::read_to_string(&backup_path)
        .map_err(|e| format!("读取备份失败: {}", e))?;
    fs::write(&target_path, &content)
        .map_err(|e| format!("恢复备份失败: {}", e))
}

/// 获取文件修改时间（用于检测外部修改）
#[tauri::command]
pub async fn get_file_modified(path: String) -> Result<String, String> {
    validate_path(&path)?;
    let metadata = fs::metadata(&path)
        .map_err(|e| format!("获取文件信息失败: {}", e))?;
    let modified = metadata.modified()
        .map(|t| {
            let dt: DateTime<Local> = t.into();
            dt.format("%Y-%m-%d %H:%M:%S").to_string()
        })
        .map_err(|e| format!("获取修改时间失败: {}", e))?;
    Ok(modified)
}
