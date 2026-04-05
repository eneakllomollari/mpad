import { useEffect, useRef } from 'react';

interface ShortcutHandlers {
  onSave?: () => void;
  onOpen?: () => void;
  onToggleSource?: () => void;
  onToggleDiff?: () => void;
  onToggleSidebar?: () => void;
  onToggleGitLog?: () => void;
  onToggleCheatsheet?: () => void;
  onFind?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const ref = useRef(handlers);
  useEffect(() => { ref.current = handlers; });

  useEffect(() => {
    const isEditable = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      return t.isContentEditable ||
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA';
    };

    const isFocusedControl = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      return t.getAttribute('role') === 'treeitem' ||
        t.getAttribute('role') === 'separator' ||
        t.getAttribute('role') === 'option' ||
        t.closest?.('.sidebar') !== null ||
        t.closest?.('.find-bar') !== null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key;
      const h = ref.current;

      // [ and ] toggle panels — no modifier needed, but only outside editable/focusable controls
      if (!mod && !e.shiftKey && !e.altKey && (key === '[' || key === ']')) {
        if (isEditable(e) || isFocusedControl(e)) return;
        e.preventDefault();
        if (key === '[') h.onToggleSidebar?.();
        else h.onToggleDiff?.();
        return;
      }

      if (!mod) return;

      const lower = key.toLowerCase();

      // When the command palette is open, only allow its toggle shortcut through
      if ((e.target as HTMLElement)?.closest?.('.palette') && lower !== 'k') return;

      switch (lower) {
        case 's':
          e.preventDefault();
          h.onSave?.();
          break;
        case 'o':
          e.preventDefault();
          h.onOpen?.();
          break;
        case '/':
          e.preventDefault();
          h.onToggleSource?.();
          break;
        case 'l':
          e.preventDefault();
          h.onToggleGitLog?.();
          break;
        case 'k':
          e.preventDefault();
          h.onToggleCheatsheet?.();
          break;
        case 'f':
          e.preventDefault();
          h.onFind?.();
          break;
        case '=':
        case '+':
          e.preventDefault();
          h.onZoomIn?.();
          break;
        case '-':
          e.preventDefault();
          h.onZoomOut?.();
          break;
        case '0':
          e.preventDefault();
          h.onZoomReset?.();
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
