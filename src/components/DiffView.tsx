interface DiffViewProps {
  diff: string;
  visible: boolean;
}

export function DiffView({ diff, visible }: DiffViewProps) {
  if (!visible || !diff) return null;

  const lines = diff.split('\n');

  return (
    <div className="diff-panel">
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
