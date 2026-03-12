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
      <div className="diff-panel" style={style}>
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
    <div className="diff-panel" style={style}>
      {lines.map((line, i) => {
        let className = 'diff-line diff-context';
        if (line.startsWith('+') && !line.startsWith('+++')) {
          className = 'diff-line diff-added';
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          className = 'diff-line diff-deleted';
        } else if (line.startsWith('@@')) {
          className = 'diff-line diff-header';
        }

        return (
          <div key={i} className={className}>
            {line}
          </div>
        );
      })}
    </div>
  );
}
