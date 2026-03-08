import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface FileEntry {
  path: string;
  status: string;
}

interface QuickOpenProps {
  repoPath: string | null;
  onSelect: (absolutePath: string) => void;
  onClose: () => void;
}

const MD_EXTENSIONS = /\.(md|markdown|mdown)$/i;

function fuzzyMatch(query: string, target: string): { match: boolean; score: number } {
  const lowerQuery = query.toLowerCase();
  const lowerTarget = target.toLowerCase();

  // Exact substring match gets high score
  if (lowerTarget.includes(lowerQuery)) {
    // Prefer matches closer to the filename (end of path)
    const idx = lowerTarget.lastIndexOf(lowerQuery);
    return { match: true, score: 1000 - idx };
  }

  // Character-by-character fuzzy match
  let qi = 0;
  let score = 0;
  let lastMatchIdx = -1;

  for (let ti = 0; ti < lowerTarget.length && qi < lowerQuery.length; ti++) {
    if (lowerTarget[ti] === lowerQuery[qi]) {
      // Consecutive matches score higher
      score += lastMatchIdx === ti - 1 ? 10 : 1;
      // Matches after separator score higher (path segments, camelCase)
      if (ti === 0 || lowerTarget[ti - 1] === '/' || lowerTarget[ti - 1] === '-' || lowerTarget[ti - 1] === '_') {
        score += 5;
      }
      lastMatchIdx = ti;
      qi++;
    }
  }

  if (qi === lowerQuery.length) {
    return { match: true, score };
  }

  return { match: false, score: 0 };
}

function fileName(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(idx + 1) : path;
}

function dirPath(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(0, idx) : '';
}

export function QuickOpen({ repoPath, onSelect, onClose }: QuickOpenProps) {
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch file list on mount
  useEffect(() => {
    if (!repoPath) return;
    invoke<FileEntry[]>('git_repo_tree', { repoPath })
      .then(setFiles)
      .catch(() => setFiles([]));
  }, [repoPath]);

  // Auto-focus input
  useEffect(() => {
    // Small delay to ensure the element is mounted
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  // Filter and sort results
  const results = useMemo(() => {
    if (!query.trim()) {
      return [...files]
        .sort((a, b) => {
          const aMd = MD_EXTENSIONS.test(a.path);
          const bMd = MD_EXTENSIONS.test(b.path);
          if (aMd !== bMd) return aMd ? -1 : 1;
          return a.path.localeCompare(b.path);
        })
        .slice(0, 50);
    }

    return files
      .map((f) => {
        const { match, score } = fuzzyMatch(query, f.path);
        const isMd = MD_EXTENSIONS.test(f.path);
        return { file: f, match, score: score + (isMd ? 500 : 0) };
      })
      .filter((r) => r.match)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map((r) => r.file);
  }, [query, files]);

  // Clamp selection to valid range
  const clampedIndex = Math.min(selectedIndex, Math.max(results.length - 1, 0));

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[clampedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [clampedIndex]);

  const handleSelect = useCallback(
    (path: string) => {
      if (!repoPath) return;
      const base = repoPath.endsWith('/') ? repoPath : `${repoPath}/`;
      onSelect(`${base}${path}`);
      onClose();
    },
    [repoPath, onSelect, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (results[clampedIndex]) {
            handleSelect(results[clampedIndex].path);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [results, clampedIndex, handleSelect, onClose],
  );

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <div style={styles.backdrop} onClick={handleBackdropClick}>
      <div style={styles.modal} onKeyDown={handleKeyDown}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search files..."
          style={styles.input}
          spellCheck={false}
          autoComplete="off"
        />
        <div ref={listRef} style={styles.list}>
          {results.length === 0 && (
            <div style={styles.empty}>
              {files.length === 0 ? 'No repo loaded' : 'No matching files'}
            </div>
          )}
          {results.map((file, i) => {
            const isMd = MD_EXTENSIONS.test(file.path);
            const isSelected = i === clampedIndex;
            return (
              <div
                key={file.path}
                style={{
                  ...styles.item,
                  backgroundColor: isSelected ? 'var(--accent-subtle)' : 'transparent',
                  borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
                }}
                onClick={() => handleSelect(file.path)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span style={{
                  ...styles.fileName,
                  color: isMd ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: isMd ? 500 : 400,
                }}>
                  {fileName(file.path)}
                </span>
                {dirPath(file.path) && (
                  <span style={styles.filePath}>{dirPath(file.path)}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingTop: '15vh',
    zIndex: 1000,
  },
  modal: {
    width: '500px',
    maxWidth: '90vw',
    backgroundColor: 'var(--bg-primary)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.2)',
    overflow: 'hidden',
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '15px',
    fontFamily: 'var(--font-ui)',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    border: 'none',
    borderBottom: '1px solid var(--border-color)',
    outline: 'none',
    boxSizing: 'border-box',
  },
  list: {
    maxHeight: '340px',
    overflowY: 'auto',
    padding: '4px 0',
  },
  item: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    padding: '6px 14px',
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
    fontSize: '13px',
    transition: 'background-color var(--transition-fast)',
  },
  fileName: {
    flexShrink: 0,
  },
  filePath: {
    color: 'var(--text-muted)',
    fontSize: '12px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  empty: {
    padding: '16px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-ui)',
    fontSize: '13px',
  },
};
