import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface GitStatusBarProps {
  filePath: string | null;
  repoPath: string | null;
}

interface GitStatus {
  branch: string;
  status: 'clean' | 'new' | 'modified' | 'deleted' | 'renamed' | 'ignored' | 'conflicted' | 'unknown';
}

export function GitStatusBar({ filePath, repoPath }: GitStatusBarProps) {
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);

  const canFetch = !!filePath && !!repoPath;

  useEffect(() => {
    if (!canFetch || !filePath || !repoPath) return;

    let stale = false;
    invoke<GitStatus>('git_file_status', { repoPath, filePath })
      .then((s) => { if (!stale) setGitStatus(s); })
      .catch(() => { if (!stale) setGitStatus(null); });

    return () => { stale = true; };
  }, [canFetch, filePath, repoPath]);

  const displayStatus = canFetch ? gitStatus : null;

  const statusClass = displayStatus
    ? `git-status-${displayStatus.status}`
    : '';

  const statusLabel = displayStatus
    ? displayStatus.status
    : '';

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        {displayStatus ? (
          <>
            <span className="git-branch">{displayStatus.branch}</span>
            <span className={statusClass}>{statusLabel}</span>
          </>
        ) : filePath ? (
          <span>No git repo</span>
        ) : (
          <span>No file open</span>
        )}
      </div>
    </div>
  );
}
