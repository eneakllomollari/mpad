use crate::git::{self, CommitInfo, FileStatus, TreeEntry};
use crate::window;
use crate::InitialFileState;

use std::path::Path;

/// Validate that a file path is absolute, contains no null bytes, and resolves
/// to a real location on disk. Returns the canonicalized path on success.
fn validate_file_path(path: &str) -> Result<std::path::PathBuf, String> {
    if path.contains('\0') {
        return Err("Path contains null bytes".to_string());
    }
    let p = Path::new(path);
    if !p.is_absolute() {
        return Err(format!("Path must be absolute: {path}"));
    }
    std::fs::canonicalize(p).map_err(|e| format!("Invalid path {path}: {e}"))
}

/// Returns the initial file path passed via CLI args (if any).
#[tauri::command]
pub fn get_initial_file(state: tauri::State<InitialFileState>) -> Option<String> {
    state.0.lock().unwrap().clone()
}

/// Read a text file from any path on disk (bypasses fs plugin scope).
#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    let canonical = validate_file_path(&path)?;
    std::fs::read_to_string(&canonical).map_err(|e| format!("Failed to read {}: {}", path, e))
}

/// Write a text file to any path on disk (bypasses fs plugin scope).
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    let canonical = validate_file_path(&path)?;
    std::fs::write(&canonical, &content).map_err(|e| format!("Failed to write {}: {}", path, e))
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

/// Recursively find all markdown files under a directory (includes dotdirs like .claude/).
#[tauri::command]
pub fn list_markdown_files(root: String) -> Result<Vec<String>, String> {
    use std::path::Path;

    fn walk(dir: &Path, root: &Path, out: &mut Vec<String>, visited: &mut std::collections::HashSet<String>) -> std::io::Result<()> {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return Ok(()),
        };

        for entry in entries {
            let entry = entry?;
            let path = entry.path();

            // Resolve symlinks, skip on error
            let resolved_path = std::fs::canonicalize(&path).unwrap_or_else(|_| path.clone());
            let resolved_str = resolved_path.to_string_lossy().to_string();

            // Skip already-visited paths (prevents loops and duplicates)
            if !visited.insert(resolved_str) {
                continue;
            }

            let name = entry.file_name();
            let name_str = name.to_string_lossy();

            // Skip heavy directories
            if resolved_path.is_dir() {
                if matches!(name_str.as_ref(),
                    "node_modules" | "target" | ".git" | "dist" | "build" | "__pycache__" | ".venv" | ".env" | ".pytest_cache"
                ) {
                    continue;
                }
                walk(&path, root, out, visited)?;
                continue;
            }

            // Collect markdown files
            if let Some(ext) = resolved_path.extension() {
                let ext = ext.to_string_lossy().to_ascii_lowercase();
                if matches!(ext.as_str(), "md" | "markdown" | "mdown") {
                    if let Ok(rel) = path.strip_prefix(root) {
                        out.push(rel.to_string_lossy().to_string());
                    }
                }
            }
        }
        Ok(())
    }

    let root_path = Path::new(&root);
    let mut files = Vec::new();
    let mut visited = std::collections::HashSet::new();
    
    // Add root to visited
    if let Ok(canon) = std::fs::canonicalize(root_path) {
        visited.insert(canon.to_string_lossy().to_string());
    }
    
    walk(root_path, root_path, &mut files, &mut visited)
        .map_err(|e| format!("Failed to walk {}: {}", root, e))?;
    files.sort();
    Ok(files)
}

/// Open a markdown file in a new editor window.
#[tauri::command]
pub fn open_md_in_window(app: tauri::AppHandle, path: String) -> Result<(), String> {
    window::create_window(&app, Some(&path)).map_err(|e| e.to_string())
}

/// Open a URL or file path with the system default handler.
/// Only allows http/https/mailto URLs and absolute file paths.
#[tauri::command]
pub fn open_with_system(target: String) -> Result<(), String> {
    let allowed = target.starts_with("http://")
        || target.starts_with("https://")
        || target.starts_with("mailto:")
        || (target.starts_with('/') && !target.contains('\0'));

    if !allowed {
        return Err(format!("Blocked disallowed target: {target}"));
    }

    open::that(&target).map_err(|e| format!("Failed to open {}: {}", target, e))
}

/// Check if a path is a directory.
#[tauri::command]
pub fn is_directory(path: String) -> Result<bool, String> {
    let meta = std::fs::metadata(&path).map_err(|e| format!("Failed to stat {}: {}", path, e))?;
    Ok(meta.is_dir())
}
