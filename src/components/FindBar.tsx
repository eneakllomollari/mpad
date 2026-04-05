import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import type { SearchHighlightStorage } from '../extensions/SearchHighlight';

interface FindBarProps {
  editor: Editor | null;
  visible: boolean;
  activationToken: number;
  onClose: () => void;
}

function getSearch(editor: Editor): SearchHighlightStorage {
  return (editor.storage as unknown as Record<string, SearchHighlightStorage>).searchHighlight;
}

function clearSearch(editor: Editor | null) {
  if (!editor || editor.isDestroyed) return;
  const s = getSearch(editor);
  s.query = '';
  s.activeIndex = 0;
  editor.view.dispatch(editor.state.tr);
}

export function FindBar({ editor, visible, activationToken, onClose }: FindBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  // Focus and reveal the bar on every explicit find request.
  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => {
        barRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [activationToken, visible]);

  // Clear search highlights when the bar closes or unmounts.
  useEffect(() => {
    return () => { clearSearch(editor); };
  }, [visible, editor]);

  const handleClose = useCallback(() => {
    setQuery('');
    clearSearch(editor);
    onClose();
  }, [editor, onClose]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setQuery(val);
      if (!editor || editor.isDestroyed) return;
      const s = getSearch(editor);
      s.query = val;
      s.activeIndex = 0;
      editor.view.dispatch(editor.state.tr);
    },
    [editor],
  );

  const navigate = useCallback(
    (direction: 1 | -1) => {
      if (!editor || editor.isDestroyed) return;
      const s = getSearch(editor);
      if (s.totalMatches === 0) return;

      s.activeIndex = (s.activeIndex + direction + s.totalMatches) % s.totalMatches;
      editor.view.dispatch(editor.state.tr);

      requestAnimationFrame(() => {
        const active = editor.view.dom.querySelector('.search-match-active');
        active?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    },
    [editor],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        navigate(e.shiftKey ? -1 : 1);
      }
    },
    [handleClose, navigate],
  );

  if (!visible) return null;

  const s = editor && !editor.isDestroyed ? getSearch(editor) : null;
  const total = s?.totalMatches ?? 0;
  const current = total > 0 ? (s?.activeIndex ?? 0) + 1 : 0;

  const countText = query ? `${current} of ${total}` : '';

  return (
    <div ref={barRef} className="find-bar" role="search" aria-label="Find in document">
      <input
        ref={inputRef}
        type="text"
        className="find-bar-input"
        placeholder="Find…"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        aria-label="Search text"
      />
      <span className="find-bar-count" role="status" aria-live="polite" aria-atomic="true">
        {countText}
      </span>
      <button
        type="button"
        className="find-bar-btn"
        onClick={() => navigate(-1)}
        disabled={total === 0}
        aria-label="Previous match (Shift+Enter)"
      >
        ▲
      </button>
      <button
        type="button"
        className="find-bar-btn"
        onClick={() => navigate(1)}
        disabled={total === 0}
        aria-label="Next match (Enter)"
      >
        ▼
      </button>
      <button
        type="button"
        className="find-bar-btn"
        onClick={handleClose}
        aria-label="Close find bar (Escape)"
      >
        ✕
      </button>
    </div>
  );
}
