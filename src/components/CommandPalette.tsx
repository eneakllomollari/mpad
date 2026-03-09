import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { filterItems } from '../lib/fuzzyMatch';
import type { PaletteCommand } from '../lib/fuzzyMatch';


interface Props {
  commands: PaletteCommand[];
  files: string[];
  repoPath: string | null;
  onFileSelect: (absolutePath: string) => void;
  onClose: () => void;
}

const MAX_RESULTS = 50;

export const CommandPalette = memo(function CommandPalette({ commands, files, repoPath, onFileSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [deferredQuery, setDeferredQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [, startTransition] = useTransition();

  const results = useMemo(
    () => filterItems(deferredQuery, commands, files, MAX_RESULTS),
    [deferredQuery, commands, files],
  );

  const clamped = Math.min(selectedIndex, Math.max(results.length - 1, 0));

  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setSelectedIndex(0);
    startTransition(() => setDeferredQuery(value));
  }, []);

  // Auto-focus
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Scroll selected into view
  useEffect(() => {
    const item = listRef.current?.children[clamped] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [clamped]);

  const execute = useCallback(
    (item: { type: string; id: string }) => {
      if (item.type === 'command') {
        const cmd = commands.find((c) => c.id === item.id);
        cmd?.action();
      } else if (repoPath) {
        const base = repoPath.endsWith('/') ? repoPath : `${repoPath}/`;
        onFileSelect(`${base}${item.id}`);
      }
      onClose();
    },
    [commands, repoPath, onFileSelect, onClose],
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
          if (results[clamped]) execute(results[clamped]);
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [results, clamped, execute, onClose],
  );

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleQueryChange}
          placeholder="Search files and commands..."
          className="palette-input"
          spellCheck={false}
          autoComplete="off"
        />
        <div ref={listRef} className="palette-list">
          {query.trim() && results.length === 0 && (
            <div className="palette-empty">No results</div>
          )}
          {results.map((item, i) => (
            <div
              key={`${item.type}-${item.id}`}
              className={`palette-item ${i === clamped ? 'selected' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); execute(item); }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className={`palette-label ${item.type === 'command' ? 'palette-command' : ''}`}>
                {item.label}
              </span>
              {item.hint && (
                <span className="palette-hint">{item.hint}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
