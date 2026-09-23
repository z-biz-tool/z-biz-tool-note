mod commands;
mod atomic_write;
mod extract;
mod index;
mod watcher;
#[cfg(test)]
mod integration_tests;

use tauri::{
    menu::{MenuBuilder, MenuItem, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    Emitter, Manager, Runtime,
};

/// 构建带 id 的自定义菜单项（可选快捷键）
fn menu_item<R: Runtime>(
    app: &tauri::AppHandle<R>,
    id: &str,
    text: &str,
    accel: Option<&str>,
) -> tauri::Result<MenuItem<R>> {
    let mut builder = MenuItemBuilder::with_id(id, text);
    if let Some(a) = accel {
        builder = builder.accelerator(a);
    }
    builder.build(app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::list_notes,
            commands::read_note,
            commands::save_note,
            commands::delete_note,
            commands::create_note,
            commands::get_config,
            commands::save_config,
            commands::export_note,
            commands::import_note,
            commands::list_trash,
            commands::restore_note,
            commands::permanent_delete_note,
            commands::list_tags,
            commands::save_image,
            commands::read_image,
            commands::ensure_dir,
            commands::write_text_file,
            commands::read_file,
            commands::read_file_binary,
            commands::get_file_meta,
            commands::write_file,
            // commands::delete_file 已移除：永久删除风险高，统一通过 move_to_trash 处理
            commands::move_to_trash,
            commands::rename_file,
            commands::file_exists,
            commands::list_dir,
            commands::list_dir_recursive,
            commands::search_in_files,
            commands::read_all_notes,
            commands::find_backlinks,
            commands::ai_chat,
            commands::ai_chat_stream,
            commands::create_backup,
            commands::list_backups,
            commands::restore_backup,
            commands::get_file_modified,
            // === Phase 2 新增命令 ===
            commands::search_notes,
            commands::rebuild_index,
            commands::index_status,
            commands::index_upsert_note,
            commands::index_delete_note,
            commands::start_watch,
            commands::stop_watch,
        ])
        .setup(|app| {
            // 初始化索引与 watcher 状态
            app.manage(index::IndexStore::open().expect("初始化搜索索引失败"));
            app.manage(watcher::WatcherState::new());

            let handle = app.handle();

            // ===== ZenNote 应用菜单（macOS 第一个子菜单）=====
            // 文案与界面语言一致（应用整体为中文）。只改标题，id 全部保持不变——
            // 菜单事件是按 id 转发给前端 menuActions 的，改文案不影响任何行为。
            let settings_item = menu_item(handle, "open-settings", "设置…", Some("CmdOrCtrl+,"))?;
            let app_menu = SubmenuBuilder::new(handle, "ZenNote")
                .item(&PredefinedMenuItem::about(handle, Some("关于 ZenNote"), None)?)
                .separator()
                .item(&settings_item)
                .separator()
                .item(&PredefinedMenuItem::services(handle, Some("服务"))?)
                .separator()
                .item(&PredefinedMenuItem::hide(handle, Some("隐藏 ZenNote"))?)
                .item(&PredefinedMenuItem::hide_others(handle, Some("隐藏其他"))?)
                .item(&PredefinedMenuItem::show_all(handle, Some("全部显示"))?)
                .separator()
                .item(&PredefinedMenuItem::quit(handle, Some("退出 ZenNote"))?)
                .build()?;

            // ===== 文件 =====
            let file_menu = SubmenuBuilder::new(handle, "文件")
                .item(&menu_item(handle, "new-note", "新建笔记", Some("CmdOrCtrl+N"))?)
                .item(&menu_item(handle, "open-folder", "打开文件夹…", Some("CmdOrCtrl+O"))?)
                .separator()
                .item(&menu_item(handle, "save", "保存", Some("CmdOrCtrl+S"))?)
                .item(&menu_item(handle, "save-as", "另存为…", Some("CmdOrCtrl+Shift+S"))?)
                .separator()
                .item(&menu_item(handle, "export-html", "导出 HTML", None)?)
                .item(&menu_item(handle, "export-pdf", "导出 PDF", None)?)
                .separator()
                .item(&menu_item(handle, "create-daily", "今日日记", Some("CmdOrCtrl+Shift+D"))?)
                .item(&menu_item(handle, "version-history", "版本历史", Some("CmdOrCtrl+Shift+H"))?)
                .separator()
                .item(&menu_item(handle, "close-tab", "关闭标签页", Some("CmdOrCtrl+W"))?)
                .build()?;

            // ===== 编辑（预定义项：同时让 Cmd+Z/X/C/V/A 在 WebView 中生效）=====
            let edit_menu = SubmenuBuilder::new(handle, "编辑")
                .item(&PredefinedMenuItem::undo(handle, Some("撤销"))?)
                .item(&PredefinedMenuItem::redo(handle, Some("重做"))?)
                .separator()
                .item(&PredefinedMenuItem::cut(handle, Some("剪切"))?)
                .item(&PredefinedMenuItem::copy(handle, Some("拷贝"))?)
                .item(&PredefinedMenuItem::paste(handle, Some("粘贴"))?)
                .item(&PredefinedMenuItem::select_all(handle, Some("全选"))?)
                .separator()
                .item(&menu_item(handle, "find", "查找…", Some("CmdOrCtrl+F"))?)
                .build()?;

            // ===== 视图 =====
            let view_menu = SubmenuBuilder::new(handle, "视图")
                .item(&menu_item(handle, "toggle-sidebar", "切换侧边栏", Some("CmdOrCtrl+B"))?)
                .item(&menu_item(handle, "toggle-outline", "切换大纲", None)?)
                .item(&menu_item(handle, "toggle-backlinks", "切换反向链接", None)?)
                .item(&menu_item(handle, "toggle-graph", "切换知识图谱", Some("CmdOrCtrl+Shift+G"))?)
                .item(&menu_item(handle, "toggle-ai", "切换 AI 助手", Some("CmdOrCtrl+J"))?)
                .separator()
                .item(&menu_item(handle, "toggle-source", "切换源码模式", None)?)
                .item(&menu_item(handle, "toggle-focus", "专注模式", None)?)
                .item(&menu_item(handle, "toggle-typewriter", "打字机模式", None)?)
                .separator()
                .item(&menu_item(handle, "cycle-theme", "切换主题", None)?)
                .build()?;

            // ===== 前往 =====
            let go_menu = SubmenuBuilder::new(handle, "前往")
                .item(&menu_item(handle, "quick-switch", "快速切换文件…", Some("CmdOrCtrl+P"))?)
                .item(&menu_item(handle, "command-palette", "命令面板…", Some("CmdOrCtrl+Shift+P"))?)
                .separator()
                .item(&menu_item(handle, "prev-tab", "上一个标签页", None)?)
                .item(&menu_item(handle, "next-tab", "下一个标签页", None)?)
                .build()?;

            // ===== 窗口 =====
            let window_menu = SubmenuBuilder::new(handle, "窗口")
                .item(&PredefinedMenuItem::minimize(handle, Some("最小化"))?)
                .item(&PredefinedMenuItem::maximize(handle, Some("缩放"))?)
                .build()?;

            // ===== 帮助 =====
            let help_menu = SubmenuBuilder::new(handle, "帮助")
                .item(&menu_item(handle, "welcome-guide", "使用指南", None)?)
                .item(&menu_item(handle, "command-palette-help", "全部命令（命令面板）", None)?)
                .build()?;

            // 显式把「窗口」「帮助」注册给 AppKit：标题是英文时系统靠标题匹配识别，
            // 中文化之后只能显式注册，否则窗口切换列表和帮助搜索框都会消失。
            #[cfg(target_os = "macos")]
            {
                window_menu.set_as_windows_menu_for_nsapp()?;
                help_menu.set_as_help_menu_for_nsapp()?;
            }

            let menu = MenuBuilder::new(handle)
                .item(&app_menu)
                .item(&file_menu)
                .item(&edit_menu)
                .item(&view_menu)
                .item(&go_menu)
                .item(&window_menu)
                .item(&help_menu)
                .build()?;

            app.set_menu(menu)?;

            // 菜单事件统一转发给前端（前端按 id 分发到对应 action）
            app.on_menu_event(|app, event| {
                let _ = app.emit("zennote-menu", event.id().as_ref());
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
