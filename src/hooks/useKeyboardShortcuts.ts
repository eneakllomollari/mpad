import { useEffect } from 'react';

export interface ShortcutHandlers {
  onSave?: () => void;
  onOpen?: () => void;
  onQuickOpen?: () => void;
  onToggleSource?: () => void;
  onToggleDiff?: () => void;
  onToggleSidebar?: () => void;
  onToggleGitLog?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      switch (e.key.toLowerCase()) {
        case 's':
          e.preventDefault();
          handlers.onSave?.();
          break;
        case 'o':
          e.preventDefault();
          handlers.onOpen?.();
          break;
        case 'p':
          e.preventDefault();
          handlers.onQuickOpen?.();
          break;
        case '/':
          e.preventDefault();
          handlers.onToggleSource?.();
          break;
        case 'd':
          e.preventDefault();
          handlers.onToggleDiff?.();
          break;
        case 'b':
          e.preventDefault();
          handlers.onToggleSidebar?.();
          break;
        case 'l':
          e.preventDefault();
          handlers.onToggleGitLog?.();
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlers]);
}
