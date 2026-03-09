use git2::{DiffOptions, Repository, StatusOptions};
use serde::Serialize;
use std::path::Path;

/// Map a `git2::Status` bitflag to a human-readable label.
fn status_label(s: git2::Status) -> &'static str {
    if s.intersects(git2::Status::INDEX_NEW | git2::Status::WT_NEW) {
        "new"
    } else if s.intersects(git2::Status::INDEX_MODIFIED | git2::Status::WT_MODIFIED) {
        "modified"
    } else if s.intersects(git2::Status::INDEX_DELETED | git2::Status::WT_DELETED) {
        "deleted"
    } else if s.intersects(git2::Status::INDEX_RENAMED | git2::Status::WT_RENAMED) {
        "renamed"
    } else if s.is_ignored() {
        "ignored"
    } else {
        "clean"
    }
}

/// Open a repository and compute the relative path of `file_path` within it.
fn open_repo_and_relativize(
    repo_path: &str,
    file_path: &str,
) -> Result<(Repository, std::path::PathBuf), git2::Error> {
    let repo = Repository::open(repo_path)?;
    let workdir = repo.workdir().unwrap_or(Path::new(repo_path));
    let abs = Path::new(file_path);
    let rel = abs.strip_prefix(workdir).unwrap_or(abs).to_path_buf();
    Ok((repo, rel))
}

#[derive(Serialize, Clone)]
pub struct CommitInfo {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TreeEntry {
    pub path: String,
    pub is_dir: bool,
    pub status: String,
}

#[derive(Serialize, Clone)]
pub struct FileStatus {
    pub branch: String,
    pub status: String,
}

/// Walk up from `path` to find the nearest git repository root.
pub fn find_repo(path: &str) -> Option<String> {
    let p = Path::new(path);
    let start = if p.is_file() {
        p.parent().unwrap_or(p)
    } else {
        p
    };
    Repository::discover(start)
        .ok()
        .and_then(|repo| repo.workdir().map(|w| w.to_string_lossy().into_owned()))
}

/// Return the git status of a single file relative to its repo, including branch name.
pub fn file_status(repo_path: &str, file_path: &str) -> Result<FileStatus, git2::Error> {
    let (repo, rel) = open_repo_and_relativize(repo_path, file_path)?;

    let branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(String::from))
        .unwrap_or_else(|| "HEAD".into());

    let mut opts = StatusOptions::new();
    opts.pathspec(rel.to_string_lossy().as_ref());
    opts.include_untracked(true);

    let statuses = repo.statuses(Some(&mut opts))?;

    if statuses.is_empty() {
        return Ok(FileStatus { branch, status: "clean".into() });
    }

    let entry = match statuses.get(0) {
        Some(e) => e,
        None => return Ok(FileStatus { branch, status: "clean".into() }),
    };
    let label = status_label(entry.status());

    Ok(FileStatus { branch, status: label.into() })
}

/// Return a unified diff of the file against HEAD.
pub fn file_diff(repo_path: &str, file_path: &str) -> Result<String, git2::Error> {
    let (repo, rel) = open_repo_and_relativize(repo_path, file_path)?;

    let head_tree = repo
        .head()
        .and_then(|r| r.peel_to_tree())
        .ok();

    let mut opts = DiffOptions::new();
    opts.pathspec(rel.to_string_lossy().as_ref());

    let diff = repo.diff_tree_to_workdir_with_index(
        head_tree.as_ref(),
        Some(&mut opts),
    )?;

    let mut output = String::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        let origin = line.origin();
        if origin == '+' || origin == '-' || origin == ' ' {
            output.push(origin);
        }
        output.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
        true
    })?;

    Ok(output)
}

/// Return the commit log for a specific file, limited to `limit` entries.
pub fn file_log(
    repo_path: &str,
    file_path: &str,
    limit: usize,
) -> Result<Vec<CommitInfo>, git2::Error> {
    let (repo, rel) = open_repo_and_relativize(repo_path, file_path)?;
    let rel_str = rel.to_string_lossy().into_owned();

    let mut revwalk = repo.revwalk()?;
    revwalk.push_head()?;
    revwalk.set_sorting(git2::Sort::TIME)?;

    let mut results = Vec::new();

    for oid in revwalk {
        if results.len() >= limit {
            break;
        }
        let oid = oid?;
        let commit = repo.find_commit(oid)?;

        // Check if this commit touches our file by comparing trees.
        let tree = commit.tree()?;
        let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());

        let mut diff_opts = DiffOptions::new();
        diff_opts.pathspec(rel_str.as_str());

        let diff =
            repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut diff_opts))?;

        if diff.deltas().len() == 0 && commit.parent_count() > 0 {
            continue;
        }

        let sig = commit.author();
        let time = sig.when();
        let date_str = format_epoch_iso8601(time.seconds(), time.offset_minutes());

        results.push(CommitInfo {
            hash: oid.to_string(),
            message: commit.message().unwrap_or("").trim().to_string(),
            author: sig.name().unwrap_or("").to_string(),
            date: date_str,
        });
    }

    Ok(results)
}

/// List all tracked/untracked files in the repo with their git status.
pub fn repo_tree(repo_path: &str) -> Result<Vec<TreeEntry>, git2::Error> {
    let repo = Repository::open(repo_path)?;

    let mut opts = StatusOptions::new();
    opts.include_untracked(true);
    opts.recurse_untracked_dirs(true);
    opts.include_ignored(false);

    let statuses = repo.statuses(Some(&mut opts))?;

    // Collect status for changed files.
    let mut entries: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut dirs: std::collections::HashSet<String> = std::collections::HashSet::new();

    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        entries.insert(path.clone(), status_label(entry.status()).to_string());

        // Track parent directories.
        let p = Path::new(&path);
        for ancestor in p.ancestors().skip(1) {
            let dir_str = ancestor.to_string_lossy().to_string();
            if !dir_str.is_empty() {
                dirs.insert(dir_str);
            }
        }
    }

    // Also walk the HEAD tree to include clean files.
    if let Ok(head) = repo.head() {
        if let Ok(tree) = head.peel_to_tree() {
            tree.walk(git2::TreeWalkMode::PreOrder, |root, entry| {
                let name = entry.name().unwrap_or("");
                let full_path = if root.is_empty() {
                    name.to_string()
                } else {
                    format!("{root}{name}")
                };

                if entry.kind() == Some(git2::ObjectType::Blob) {
                    entries.entry(full_path.clone()).or_insert_with(|| "clean".into());
                    let p = Path::new(&full_path);
                    for ancestor in p.ancestors().skip(1) {
                        let dir_str = ancestor.to_string_lossy().to_string();
                        if !dir_str.is_empty() {
                            dirs.insert(dir_str);
                        }
                    }
                }

                git2::TreeWalkResult::Ok
            })?;
        }
    }

    let mut result: Vec<TreeEntry> = Vec::new();

    // Add directories.
    for dir in &dirs {
        result.push(TreeEntry {
            path: dir.clone(),
            is_dir: true,
            status: "clean".into(),
        });
    }

    // Add files.
    for (path, status) in &entries {
        result.push(TreeEntry {
            path: path.clone(),
            is_dir: false,
            status: status.clone(),
        });
    }

    result.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(result)
}

/// Format a Unix epoch timestamp as ISO 8601 with timezone offset.
pub(crate) fn format_epoch_iso8601(epoch: i64, offset_minutes: i32) -> String {
    let offset_secs = (offset_minutes as i64) * 60;
    let local = epoch + offset_secs;

    // Days since epoch.
    let mut days = local / 86400;
    let mut time_of_day = local % 86400;
    if time_of_day < 0 {
        days -= 1;
        time_of_day += 86400;
    }

    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    // Convert days since 1970-01-01 to y/m/d.
    let (year, month, day) = days_to_date(days + 719468); // shift to 0000-03-01 epoch

    let offset_h = offset_minutes / 60;
    let offset_m = (offset_minutes % 60).abs();
    let sign = if offset_minutes >= 0 { '+' } else { '-' };

    format!(
        "{year:04}-{month:02}-{day:02}T{hours:02}:{minutes:02}:{seconds:02}{sign}{:02}:{:02}",
        offset_h.abs(),
        offset_m
    )
}

/// Civil date from day count (algorithm from Howard Hinnant).
pub(crate) fn days_to_date(z: i64) -> (i64, u32, u32) {
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// Helper: create a temp git repo with one committed file, returning (repo_path, file_path).
    fn make_temp_repo(name: &str) -> (String, String) {
        let tmp = std::env::temp_dir().join(format!("mpad_test_{name}"));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        let repo = Repository::init(&tmp).unwrap();
        let file = tmp.join("hello.md");
        fs::write(&file, "# Hello").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("hello.md")).unwrap();
        index.write().unwrap();
        let tree_oid = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_oid).unwrap();
        let sig = git2::Signature::now("Test", "test@test.com").unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[]).unwrap();

        let repo_path = tmp.to_string_lossy().into_owned();
        let file_path = file.to_string_lossy().into_owned();
        (repo_path, file_path)
    }

    fn cleanup_temp_repo(name: &str) {
        let tmp = std::env::temp_dir().join(format!("mpad_test_{name}"));
        let _ = fs::remove_dir_all(&tmp);
    }

    // ── find_repo ───────────────────────────────────────────────

    #[test]
    fn find_repo_returns_none_for_non_repo() {
        let result = find_repo("/tmp");
        assert!(result.is_none(), "expected None for a non-repo path, got {:?}", result);
    }

    #[test]
    fn find_repo_returns_none_for_nonexistent_path() {
        let result = find_repo("/nonexistent/path/that/does/not/exist");
        assert!(result.is_none());
    }

    #[test]
    fn find_repo_returns_some_for_repo_dir() {
        let (repo_path, _) = make_temp_repo("find_repo_dir");
        let result = find_repo(&repo_path);
        assert!(result.is_some(), "expected Some for a path inside a git repo");
        cleanup_temp_repo("find_repo_dir");
    }

    #[test]
    fn find_repo_returns_some_for_file_in_repo() {
        let (_, file_path) = make_temp_repo("find_repo_file");
        let result = find_repo(&file_path);
        assert!(result.is_some(), "expected Some when given a file path inside a repo");
        cleanup_temp_repo("find_repo_file");
    }

    // ── file_status ─────────────────────────────────────────────

    #[test]
    fn file_status_returns_valid_result() {
        let (repo_path, file_path) = make_temp_repo("file_status_valid");
        let status = file_status(&repo_path, &file_path).expect("file_status should succeed");
        assert!(!status.branch.is_empty(), "branch should not be empty");
        let valid = ["clean", "new", "modified", "deleted", "renamed", "ignored"];
        assert!(
            valid.contains(&status.status.as_str()),
            "unexpected status: {}",
            status.status
        );
        cleanup_temp_repo("file_status_valid");
    }

    #[test]
    fn file_status_clean_for_committed_file() {
        let (repo_path, file_path) = make_temp_repo("file_status_clean");
        let status = file_status(&repo_path, &file_path).expect("file_status should succeed");
        assert_eq!(status.status, "clean");
        cleanup_temp_repo("file_status_clean");
    }

    #[test]
    fn file_status_modified_after_edit() {
        let (repo_path, file_path) = make_temp_repo("file_status_mod");
        // Modify the committed file on disk.
        fs::write(&file_path, "# Changed content\nExtra line").unwrap();
        // Canonicalize paths so strip_prefix works reliably.
        let canon_repo = fs::canonicalize(&repo_path)
            .unwrap()
            .to_string_lossy()
            .to_string();
        let canon_file = fs::canonicalize(&file_path)
            .unwrap()
            .to_string_lossy()
            .to_string();
        let status = file_status(&canon_repo, &canon_file).expect("file_status should succeed");
        assert_eq!(status.status, "modified");
        cleanup_temp_repo("file_status_mod");
    }

    #[test]
    fn file_status_error_for_invalid_repo() {
        let result = file_status("/tmp", "/tmp/nonexistent.md");
        assert!(result.is_err(), "should return error for non-repo path");
    }

    // ── repo_tree ───────────────────────────────────────────────

    #[test]
    fn repo_tree_returns_entries() {
        let (repo_path, _) = make_temp_repo("repo_tree_entries");
        let entries = repo_tree(&repo_path).expect("repo_tree should succeed");
        assert!(!entries.is_empty(), "repo tree should have entries");
        assert!(
            entries.iter().any(|e| !e.is_dir),
            "repo tree should contain file entries"
        );
        cleanup_temp_repo("repo_tree_entries");
    }

    #[test]
    fn repo_tree_contains_committed_file() {
        let (repo_path, _) = make_temp_repo("repo_tree_file");
        let entries = repo_tree(&repo_path).expect("repo_tree should succeed");
        assert!(
            entries.iter().any(|e| e.path == "hello.md" && !e.is_dir),
            "should contain hello.md"
        );
        cleanup_temp_repo("repo_tree_file");
    }

    // ── format_epoch_iso8601 ────────────────────────────────────

    #[test]
    fn format_epoch_iso8601_utc() {
        let result = format_epoch_iso8601(1704067200, 0);
        assert_eq!(result, "2024-01-01T00:00:00+00:00");
    }

    #[test]
    fn format_epoch_iso8601_positive_offset() {
        let result = format_epoch_iso8601(1704067200, 330);
        assert_eq!(result, "2024-01-01T05:30:00+05:30");
    }

    #[test]
    fn format_epoch_iso8601_negative_offset() {
        let result = format_epoch_iso8601(1704067200, -300);
        assert_eq!(result, "2023-12-31T19:00:00-05:00");
    }

    #[test]
    fn format_epoch_iso8601_unix_epoch() {
        let result = format_epoch_iso8601(0, 0);
        assert_eq!(result, "1970-01-01T00:00:00+00:00");
    }

    // ── days_to_date ────────────────────────────────────────────

    #[test]
    fn days_to_date_unix_epoch() {
        let (y, m, d) = days_to_date(719468);
        assert_eq!((y, m, d), (1970, 1, 1));
    }

    #[test]
    fn days_to_date_known_date() {
        // 2024-01-01 is 19723 days after 1970-01-01
        let (y, m, d) = days_to_date(19723 + 719468);
        assert_eq!((y, m, d), (2024, 1, 1));
    }

    #[test]
    fn days_to_date_leap_day() {
        // 2024-02-29: 19723 days to Jan 1 + 59 days (31 Jan + 28 Feb) = Feb 29
        let (y, m, d) = days_to_date(19723 + 59 + 719468);
        assert_eq!((y, m, d), (2024, 2, 29));
    }

    #[test]
    fn days_to_date_y2k() {
        // 2000-01-01 is 10957 days after 1970-01-01
        let (y, m, d) = days_to_date(10957 + 719468);
        assert_eq!((y, m, d), (2000, 1, 1));
    }
}
