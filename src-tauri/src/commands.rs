use crate::git::{self, CommitInfo, FileStatus, TreeEntry};
use crate::window;
use crate::InitialFileState;

/// Returns the initial file path passed via CLI args (if any).
#[tauri::command]
pub fn get_initial_file(state: tauri::State<InitialFileState>) -> Option<String> {
    state.0.lock().unwrap().clone()
}

/// Read a text file from any path on disk (bypasses fs plugin scope).
#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

/// Write a text file to any path on disk (bypasses fs plugin scope).
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[tauri::command]
pub fn git_find_repo(path: String) -> Result<Option<String>, String> {
    Ok(git::find_repo(&path))
}

#[tauri::command]
pub fn git_file_status(repo_path: String, file_path: String) -> Result<FileStatus, String> {
    git::file_status(&repo_path, &file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn git_file_diff(repo_path: String, file_path: String) -> Result<String, String> {
    git::file_diff(&repo_path, &file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn git_file_log(
    repo_path: String,
    file_path: String,
    limit: usize,
) -> Result<Vec<CommitInfo>, String> {
    git::file_log(&repo_path, &file_path, limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn git_repo_tree(repo_path: String) -> Result<Vec<TreeEntry>, String> {
    git::repo_tree(&repo_path).map_err(|e| e.to_string())
}

/// Open a markdown file in a new editor window.
#[tauri::command]
pub fn open_md_in_window(app: tauri::AppHandle, path: String) -> Result<(), String> {
    window::create_window(&app, Some(&path)).map_err(|e| e.to_string())
}

/// Open a URL or file path with the system default handler.
#[tauri::command]
pub fn open_with_system(target: String) -> Result<(), String> {
    open::that(&target).map_err(|e| format!("Failed to open {}: {}", target, e))
}
