import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface GitLogProps {
  repoPath: string | null;
  filePath: string | null;
  style?: React.CSSProperties;
}

interface Commit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export function GitLog({ repoPath, filePath, style }: GitLogProps) {
  const [commits, setCommits] = useState<Commit[]>([]);

  useEffect(() => {
    if (!repoPath || !filePath) return;

    let stale = false;
    invoke<Commit[]>('git_file_log', { repoPath, filePath, limit: 50 })
      .then((data) => { if (!stale) setCommits(data); })
      .catch(() => { if (!stale) setCommits([]); });

    return () => { stale = true; };
  }, [repoPath, filePath]);

  return (
    <div className="git-log-panel" style={style}>
      <div className="git-log-header">Commits</div>
      {commits.length === 0 ? (
        <div style={{ padding: '0.5em 1em', color: 'var(--text-muted)' }}>
          No commits found
        </div>
      ) : (
        commits.map((commit) => (
          <div key={commit.hash} className="git-log-entry">
            <span className="git-log-hash">{commit.hash.slice(0, 7)}</span>
            <span className="git-log-message">{commit.message}</span>
            <span className="git-log-meta">
              {commit.author} &middot; {commit.date}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
