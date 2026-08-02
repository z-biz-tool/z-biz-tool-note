mod commands;

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
        ])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
