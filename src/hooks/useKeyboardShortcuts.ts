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
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const h = ref.current;

      // When the command palette is open, only allow its toggle shortcut through
      const key = e.key.toLowerCase();
      if ((e.target as HTMLElement)?.closest?.('.palette') && key !== 'k') return;

      switch (key) {
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
        case 'd':
          e.preventDefault();
          h.onToggleDiff?.();
          break;
        case '\\':
          e.preventDefault();
          h.onToggleSidebar?.();
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
