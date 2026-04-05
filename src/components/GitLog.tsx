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
    <section className="git-log-panel" style={style} aria-label="Git log">
      <h2 className="git-log-header">Commits</h2>
      {commits.length === 0 ? (
        <div style={{ padding: '0.5em 1em', color: 'var(--text-muted)' }}>
          No commits found
        </div>
      ) : (
        <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {commits.map((commit) => (
            <li key={commit.hash} className="git-log-entry">
              <span className="git-log-hash">{commit.hash.slice(0, 7)}</span>
              <span className="git-log-message">{commit.message}</span>
              <span className="git-log-meta">
                {commit.author} &middot; {commit.date}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
