import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface GitStatusBarProps {
  filePath: string | null;
  repoPath: string | null;
}

interface GitStatus {
  branch: string;
  status: 'clean' | 'modified' | 'untracked' | 'deleted' | 'unknown';
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

  const fileName = filePath?.split('/').pop() ?? null;

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
          <span>mpad</span>
        )}
      </div>
      <div className="status-bar-right">
        {fileName && <span className="status-bar-filename">{fileName}</span>}
      </div>
    </div>
  );
}
