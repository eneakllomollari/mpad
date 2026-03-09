use crate::git::{self, CommitInfo, FileStatus, TreeEntry};
use crate::window;
use crate::InitialFileState;

fn take_initial_file(state: &InitialFileState) -> Option<String> {
    state.0.lock().unwrap().take()
}

/// Returns the initial file path passed via CLI args (if any).
#[tauri::command]
pub fn get_initial_file(state: tauri::State<InitialFileState>) -> Option<String> {
    take_initial_file(&state)
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

/// Recursively find all markdown files under a directory (includes dotdirs like .claude/).
#[tauri::command]
pub fn list_markdown_files(root: String) -> Result<Vec<String>, String> {
    use std::path::Path;

    fn is_markdown_file(path: &Path) -> bool {
        path.extension()
            .map(|ext| {
                let ext = ext.to_string_lossy().to_ascii_lowercase();
                ext == "md" || ext == "markdown" || ext == "mdown"
            })
            .unwrap_or(false)
    }

    fn walk(dir: &Path, root: &Path, out: &mut Vec<String>) -> std::io::Result<()> {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return Ok(()), // skip unreadable dirs
        };
        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            let file_type = match std::fs::symlink_metadata(&path) {
                Ok(metadata) => metadata.file_type(),
                Err(_) => continue, // skip unreadable entries
            };

            if file_type.is_symlink() {
                continue;
            }

            // Skip common heavy directories that never contain useful markdown
            if file_type.is_dir() {
                if matches!(
                    name_str.as_ref(),
                    "node_modules" | "target" | ".git" | "dist" | "build" | "__pycache__"
                    | ".venv" | ".env" | ".pytest_cache"
                ) {
                    continue;
                }
                walk(&path, root, out)?;
            } else if file_type.is_file() && is_markdown_file(&path) {
                if let Ok(rel) = path.strip_prefix(root) {
                    out.push(rel.to_string_lossy().to_string());
                }
            }
        }
        Ok(())
    }

    let root_path = Path::new(&root);
    let mut files = Vec::new();
    walk(root_path, root_path, &mut files)
        .map_err(|e| format!("Failed to walk {}: {}", root, e))?;
    files.sort();
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(prefix: &str) -> std::path::PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("mpad_{prefix}_{stamp}"))
    }

    #[test]
    fn get_initial_file_consumes_value() {
        let state = InitialFileState(std::sync::Mutex::new(Some("/tmp/example.md".into())));

        assert_eq!(take_initial_file(&state), Some("/tmp/example.md".into()));
        assert_eq!(take_initial_file(&state), None);
    }

    #[cfg(unix)]
    #[test]
    fn list_markdown_files_skips_symlinked_directories() {
        use std::os::unix::fs::symlink;

        let root = unique_temp_dir("markdown_root");
        let outside = unique_temp_dir("markdown_outside");
        fs::create_dir_all(root.join("docs")).unwrap();
        fs::create_dir_all(&outside).unwrap();

        fs::write(root.join("docs/inside.md"), "# inside").unwrap();
        fs::write(outside.join("outside.md"), "# outside").unwrap();
        symlink(&outside, root.join("linked")).unwrap();

        let files = list_markdown_files(root.to_string_lossy().to_string()).unwrap();

        assert_eq!(files, vec!["docs/inside.md".to_string()]);

        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
    }
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
