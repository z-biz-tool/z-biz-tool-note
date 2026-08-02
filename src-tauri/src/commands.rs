use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use chrono::{DateTime, Local};
use uuid::Uuid;

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

/// 从笔记内容提取标题（第一行 # 标题 或 第一行文本）
fn extract_title(content: &str) -> String {
    content
        .lines()
        .find(|line| !line.trim().is_empty())
        .map(|line| {
            let trimmed = line.trim();
            if trimmed.starts_with("# ") {
                trimmed.trim_start_matches("# ").to_string()
            } else if trimmed.len() > 50 {
                format!("{}...", &trimmed[..50])
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
                html.push_str(&format!("<h1>{}</h1>", trimmed.trim_start_matches("# ")));
            } else if trimmed.starts_with("## ") {
                html.push_str(&format!("<h2>{}</h2>", trimmed.trim_start_matches("## ")));
            } else if trimmed.starts_with("### ") {
                html.push_str(&format!("<h3>{}</h3>", trimmed.trim_start_matches("### ")));
            } else if trimmed.starts_with("- ") || trimmed.starts_with("* ") {
                html.push_str(&format!("<li>{}</li>", &trimmed[2..]));
            } else if trimmed.starts_with("> ") {
                html.push_str(&format!("<blockquote>{}</blockquote>", trimmed.trim_start_matches("> ")));
            } else if trimmed.starts_with("```") {
                html.push_str("<pre><code>");
            } else if trimmed.is_empty() {
                html.push_str("<br/>");
            } else {
                html.push_str(&format!("<p>{}</p>", trimmed));
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
