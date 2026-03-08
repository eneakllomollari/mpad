mod commands;
mod git;
mod window;

use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_cli::CliExt;

/// Stores the initial file path resolved from CLI args so the frontend can
/// retrieve it via the `get_initial_file` command (avoids the race condition
/// where an emitted event fires before React mounts its listener).
pub struct InitialFileState(pub Mutex<Option<String>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // When a second instance is launched, open a new window with the file arg.
            let file_path = args.get(1).cloned();
            if let Err(e) = window::create_window(app, file_path.as_deref()) {
                eprintln!("failed to create window for second instance: {e}");
            }
        }))
        .manage(InitialFileState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            commands::git_find_repo,
            commands::git_file_status,
            commands::git_file_diff,
            commands::git_file_log,
            commands::git_repo_tree,
            commands::get_initial_file,
            commands::read_file,
            commands::write_file,
            commands::open_md_in_window,
            commands::open_with_system,
        ])
        .setup(|app| {
            // Handle CLI "file" argument — store the resolved path in state
            // so the frontend can fetch it when ready (no race condition).
            if let Ok(matches) = app.cli().matches() {
                if let Some(file_arg) = matches.args.get("file") {
                    if let Some(path) = file_arg.value.as_str() {
                        if !path.is_empty() {
                            // Resolve to absolute path.
                            let abs_path = std::path::Path::new(path);
                            let abs_path = if abs_path.is_relative() {
                                std::env::current_dir()
                                    .map(|cwd| cwd.join(abs_path))
                                    .unwrap_or_else(|_| abs_path.to_path_buf())
                            } else {
                                abs_path.to_path_buf()
                            };

                            let file_name = abs_path
                                .file_name()
                                .map(|n| n.to_string_lossy().to_string())
                                .unwrap_or_else(|| "mdview".into());

                            let path_str = abs_path.to_string_lossy().to_string();

                            // Store for frontend to retrieve.
                            if let Some(state) = app.try_state::<InitialFileState>() {
                                *state.0.lock().unwrap() = Some(path_str);
                            }

                            // Set the window title.
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.set_title(&file_name);
                            }
                        }
                    }
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
