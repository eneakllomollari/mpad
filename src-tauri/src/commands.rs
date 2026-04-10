use crate::git::{self, CommitInfo, FileStatus, TreeEntry};
use crate::window;
use crate::InitialFileState;

use std::path::{Path, PathBuf};

/// Basic path safety: reject null bytes and require an absolute path.
fn check_path_basics(path: &str) -> Result<&Path, String> {
    if path.contains('\0') {
        return Err("Path contains null bytes".to_string());
    }
    let p = Path::new(path);
    if !p.is_absolute() {
        return Err(format!("Path must be absolute: {path}"));
    }
    Ok(p)
}

/// Validate a path that must already exist (reads, directory listings, git ops).
/// Returns the canonicalized path.
fn validate_read_path(path: &str) -> Result<PathBuf, String> {
    let p = check_path_basics(path)?;
    std::fs::canonicalize(p).map_err(|e| format!("Invalid path {path}: {e}"))
}

/// Validate a path for writing where the file may not yet exist.
/// The parent directory must exist; returns a path under the canonicalized parent.
fn validate_write_path(path: &str) -> Result<PathBuf, String> {
    let p = check_path_basics(path)?;
    let parent = p
        .parent()
        .ok_or_else(|| format!("No parent directory for {path}"))?;
    let canon_parent =
        std::fs::canonicalize(parent).map_err(|e| format!("Invalid parent for {path}: {e}"))?;
    let file_name = p
        .file_name()
        .ok_or_else(|| format!("No filename in {path}"))?;
    Ok(canon_parent.join(file_name))
}

/// Returns the initial file path passed via CLI args (if any).
#[tauri::command]
pub fn get_initial_file(state: tauri::State<InitialFileState>) -> Option<String> {
    state.0.lock().unwrap().clone()
}

/// Read a text file from any path on disk (bypasses fs plugin scope).
#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    let canonical = validate_read_path(&path)?;
    std::fs::read_to_string(&canonical).map_err(|e| format!("Failed to read {}: {}", path, e))
}

/// Write a text file to any path on disk (bypasses fs plugin scope).
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    let validated = validate_write_path(&path)?;
    std::fs::write(&validated, &content).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[tauri::command]
pub fn git_find_repo(path: String) -> Result<Option<String>, String> {
    let canonical = validate_read_path(&path)?;
    Ok(git::find_repo(&canonical.to_string_lossy()))
}

#[tauri::command]
pub fn git_file_status(repo_path: String, file_path: String) -> Result<FileStatus, String> {
    let repo = validate_read_path(&repo_path)?;
    let file = validate_read_path(&file_path)?;
    git::file_status(&repo.to_string_lossy(), &file.to_string_lossy()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn git_file_diff(repo_path: String, file_path: String) -> Result<String, String> {
    let repo = validate_read_path(&repo_path)?;
    let file = validate_read_path(&file_path)?;
    git::file_diff(&repo.to_string_lossy(), &file.to_string_lossy()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn git_file_log(
    repo_path: String,
    file_path: String,
    limit: usize,
) -> Result<Vec<CommitInfo>, String> {
    let repo = validate_read_path(&repo_path)?;
    let file = validate_read_path(&file_path)?;
    git::file_log(&repo.to_string_lossy(), &file.to_string_lossy(), limit)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn git_repo_tree(repo_path: String) -> Result<Vec<TreeEntry>, String> {
    let repo = validate_read_path(&repo_path)?;
    git::repo_tree(&repo.to_string_lossy()).map_err(|e| e.to_string())
}

/// Recursively find all markdown files under a directory (includes dotdirs like .claude/).
#[tauri::command]
pub fn list_markdown_files(root: String) -> Result<Vec<String>, String> {
    let canonical_root = validate_read_path(&root)?;

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

    let mut files = Vec::new();
    let mut visited = std::collections::HashSet::new();

    // Root is already canonicalized by validate_read_path
    visited.insert(canonical_root.to_string_lossy().to_string());

    walk(&canonical_root, &canonical_root, &mut files, &mut visited)
        .map_err(|e| format!("Failed to walk {}: {}", root, e))?;
    files.sort();
    Ok(files)
}

/// Open a markdown file in a new editor window.
#[tauri::command]
pub fn open_md_in_window(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let canonical = validate_read_path(&path)?;
    window::create_window(&app, Some(&canonical.to_string_lossy())).map_err(|e| e.to_string())
}

/// Open a URL or file path with the system default handler.
/// Only allows http/https/mailto URLs and absolute file paths with safe extensions.
#[tauri::command]
pub fn open_with_system(target: String) -> Result<(), String> {
    let is_safe_url = target.starts_with("http://")
        || target.starts_with("https://")
        || target.starts_with("mailto:");

    let is_safe_file = if target.starts_with('/') && !target.contains('\0') {
        // Only allow files with known-safe extensions
        let lower = target.to_ascii_lowercase();
        [".md", ".markdown", ".mdown", ".txt", ".pdf", ".json", ".csv", ".log"]
            .iter()
            .any(|ext| lower.ends_with(ext))
    } else {
        false
    };

    if !is_safe_url && !is_safe_file {
        return Err(format!("Blocked disallowed target: {target}"));
    }

    open::that(&target).map_err(|e| format!("Failed to open {}: {}", target, e))
}

/// Check if a path is a directory.
#[tauri::command]
pub fn is_directory(path: String) -> Result<bool, String> {
    let canonical = validate_read_path(&path)?;
    let meta =
        std::fs::metadata(&canonical).map_err(|e| format!("Failed to stat {}: {}", path, e))?;
    Ok(meta.is_dir())
}
