mod commands;

use tauri::{
    menu::{MenuBuilder, MenuItem, MenuItemBuilder, SubmenuBuilder},
    Emitter, Runtime,
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
            commands::write_file,
            commands::delete_file,
            commands::move_to_trash,
            commands::rename_file,
            commands::file_exists,
            commands::list_dir,
            commands::list_dir_recursive,
            commands::search_in_files,
            commands::read_all_notes,
            commands::find_backlinks,
            commands::ai_chat,
            commands::create_backup,
            commands::list_backups,
            commands::restore_backup,
            commands::get_file_modified,
        ])
        .setup(|app| {
            let handle = app.handle();

            // ===== ZenNote 应用菜单（macOS 第一个子菜单）=====
            let settings_item = menu_item(handle, "open-settings", "Settings…", Some("CmdOrCtrl+,"))?;
            let app_menu = SubmenuBuilder::new(handle, "ZenNote")
                .about(None)
                .separator()
                .item(&settings_item)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;

            // ===== File =====
            let file_menu = SubmenuBuilder::new(handle, "File")
                .item(&menu_item(handle, "new-note", "New Note", Some("CmdOrCtrl+N"))?)
                .item(&menu_item(handle, "open-folder", "Open Folder…", Some("CmdOrCtrl+O"))?)
                .separator()
                .item(&menu_item(handle, "save", "Save", Some("CmdOrCtrl+S"))?)
                .item(&menu_item(handle, "save-as", "Save As…", Some("CmdOrCtrl+Shift+S"))?)
                .separator()
                .item(&menu_item(handle, "export-html", "Export as HTML", None)?)
                .item(&menu_item(handle, "export-pdf", "Export as PDF", None)?)
                .separator()
                .item(&menu_item(handle, "create-daily", "Today's Daily Note", Some("CmdOrCtrl+Shift+D"))?)
                .item(&menu_item(handle, "version-history", "Version History", Some("CmdOrCtrl+Shift+H"))?)
                .separator()
                .item(&menu_item(handle, "close-tab", "Close Tab", Some("CmdOrCtrl+W"))?)
                .build()?;

            // ===== Edit（预定义项：同时让 Cmd+Z/X/C/V/A 在 WebView 中生效）=====
            let edit_menu = SubmenuBuilder::new(handle, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .separator()
                .item(&menu_item(handle, "find", "Find", Some("CmdOrCtrl+F"))?)
                .build()?;

            // ===== View =====
            let view_menu = SubmenuBuilder::new(handle, "View")
                .item(&menu_item(handle, "toggle-sidebar", "Toggle Sidebar", Some("CmdOrCtrl+B"))?)
                .item(&menu_item(handle, "toggle-outline", "Toggle Outline", None)?)
                .item(&menu_item(handle, "toggle-backlinks", "Toggle Backlinks", None)?)
                .item(&menu_item(handle, "toggle-graph", "Toggle Knowledge Graph", Some("CmdOrCtrl+Shift+G"))?)
                .item(&menu_item(handle, "toggle-ai", "Toggle AI Assistant", Some("CmdOrCtrl+J"))?)
                .separator()
                .item(&menu_item(handle, "toggle-source", "Toggle Source Mode", None)?)
                .item(&menu_item(handle, "toggle-focus", "Focus Mode", None)?)
                .item(&menu_item(handle, "toggle-typewriter", "Typewriter Mode", None)?)
                .separator()
                .item(&menu_item(handle, "cycle-theme", "Cycle Theme", None)?)
                .build()?;

            // ===== Go =====
            let go_menu = SubmenuBuilder::new(handle, "Go")
                .item(&menu_item(handle, "quick-switch", "Quick Switch File…", Some("CmdOrCtrl+P"))?)
                .item(&menu_item(handle, "command-palette", "Command Palette…", Some("CmdOrCtrl+Shift+P"))?)
                .separator()
                .item(&menu_item(handle, "prev-tab", "Previous Tab", None)?)
                .item(&menu_item(handle, "next-tab", "Next Tab", None)?)
                .build()?;

            // ===== Window =====
            let window_menu = SubmenuBuilder::new(handle, "Window")
                .minimize()
                .maximize()
                .build()?;

            // ===== Help =====
            let help_menu = SubmenuBuilder::new(handle, "Help")
                .item(&menu_item(handle, "welcome-guide", "Welcome Guide", None)?)
                .item(&menu_item(handle, "command-palette-help", "All Commands (Command Palette)", None)?)
                .build()?;

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
