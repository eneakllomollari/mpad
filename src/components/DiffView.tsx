import type { CSSProperties } from 'react';

interface DiffViewProps {
  diff: string;
  visible: boolean;
  style?: CSSProperties;
}

export function DiffView({ diff, visible, style }: DiffViewProps) {
  if (!visible) return null;

  if (!diff) {
    return (
      <div className="diff-panel" style={style} role="region" aria-label="Diff view">
        <div style={{
          padding: '2em 1.5em',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-ui)',
          fontSize: '0.85em',
          textAlign: 'center',
        }}>
          No changes from HEAD
        </div>
      </div>
    );
  }

  const lines = diff.split('\n');

  return (
    <div className="diff-panel" style={style} role="region" aria-label="Diff view" tabIndex={0}>
      {lines.map((line, i) => {
        let className = 'diff-line diff-context';
        let prefix = '';
        if (line.startsWith('+') && !line.startsWith('+++')) {
          className = 'diff-line diff-added';
          prefix = 'Added: ';
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          className = 'diff-line diff-deleted';
          prefix = 'Removed: ';
        } else if (line.startsWith('@@')) {
          className = 'diff-line diff-header';
        }

        return (
          <div key={i} className={className}>
            {prefix && <span className="sr-only">{prefix}</span>}
            {line}
          </div>
        );
      })}
    </div>
  );
}
