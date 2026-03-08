import { useEffect, useState } from 'react';
import { getCurrentWindow, type Theme } from '@tauri-apps/api/window';

type AppTheme = 'light' | 'dark';

export function useTheme(): AppTheme {
  const [theme, setTheme] = useState<AppTheme>('light');

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setup = async () => {
      try {
        const appWindow = getCurrentWindow();
        const systemTheme = await appWindow.theme();
        applyTheme(systemTheme ?? 'light');

        unlisten = await appWindow.onThemeChanged(({ payload }) => {
          applyTheme(payload);
        });
      } catch {
        // Fallback for browser dev mode: check prefers-color-scheme
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        applyTheme(mq.matches ? 'dark' : 'light');
        const handler = (e: MediaQueryListEvent) =>
          applyTheme(e.matches ? 'dark' : 'light');
        mq.addEventListener('change', handler);
        unlisten = () => mq.removeEventListener('change', handler);
      }
    };

    function applyTheme(t: Theme | AppTheme) {
      const resolved: AppTheme = t === 'dark' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', resolved);
      setTheme(resolved);
    }

    setup();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  return theme;
}
