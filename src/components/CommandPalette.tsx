import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { filterItems } from '../lib/fuzzyMatch';
import type { PaletteCommand } from '../lib/fuzzyMatch';
import { motion } from 'framer-motion';


interface Props {
  commands: PaletteCommand[];
  files: string[];
  repoPath: string | null;
  onFileSelect: (absolutePath: string) => void;
  onClose: () => void;
}

const MAX_RESULTS = 50;
const LISTBOX_ID = 'palette-listbox';
const itemId = (item: { type: string; id: string }) => `palette-opt-${item.type}-${item.id}`;

export const CommandPalette = memo(function CommandPalette({ commands, files, repoPath, onFileSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [deferredQuery, setDeferredQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const [, startTransition] = useTransition();

  const results = useMemo(
    () => filterItems(deferredQuery, commands, files, MAX_RESULTS),
    [deferredQuery, commands, files],
  );

  const clamped = Math.min(selectedIndex, Math.max(results.length - 1, 0));
  const activeDescendant = results[clamped] ? itemId(results[clamped]) : undefined;

  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setSelectedIndex(0);
    startTransition(() => setDeferredQuery(value));
  }, []);

  // Auto-focus + trap focus within dialog
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Focus trap: keep Tab within the palette
  useEffect(() => {
    const handleFocusTrap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !paletteRef.current) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', handleFocusTrap);
    return () => window.removeEventListener('keydown', handleFocusTrap);
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
    <motion.div
      className="palette-backdrop"
      onMouseDown={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1 }}
    >
      <motion.div
        ref={paletteRef}
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        initial={{ opacity: 0, scale: 0.98, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -10 }}
        transition={{ type: "spring", stiffness: 500, damping: 30, mass: 0.5 }}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleQueryChange}
          placeholder="Search files and commands..."
          className="palette-input"
          spellCheck={false}
          autoComplete="off"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={LISTBOX_ID}
          aria-activedescendant={activeDescendant}
          aria-autocomplete="list"
        />
        <div ref={listRef} id={LISTBOX_ID} role="listbox" className="palette-list" aria-label="Results">
          {query.trim() && results.length === 0 && (
            <div className="palette-empty" role="status">No results</div>
          )}
          {results.map((item, i) => (
            <div
              key={`${item.type}-${item.id}`}
              id={itemId(item)}
              role="option"
              aria-selected={i === clamped}
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
      </motion.div>
    </motion.div>
  );
});
