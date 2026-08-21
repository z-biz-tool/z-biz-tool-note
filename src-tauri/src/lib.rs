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
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
