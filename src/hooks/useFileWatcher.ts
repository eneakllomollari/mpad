import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { watch } from '@tauri-apps/plugin-fs';

const DEBOUNCE_MS = 500;

export function useFileWatcher(
  filePath: string | null,
  currentContent: React.RefObject<string>,
  onExternalChange: () => void,
) {
  const callbackRef = useRef(onExternalChange);
  useEffect(() => { callbackRef.current = onExternalChange; });

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!filePath) return;

    let stopWatcher: (() => void) | null = null;
    let cancelled = false;
    const watchedPath = filePath;

    const setup = async () => {
      try {
        const unwatch = await watch(watchedPath, () => {
          if (cancelled) return;

          // Debounce rapid FS events
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = setTimeout(async () => {
            if (cancelled) return;

            // Content-based check: read the file and compare to what we have
            try {
              const diskContent = await invoke<string>('read_file', { path: watchedPath });
              if (cancelled) return;
              if (diskContent !== currentContent.current) {
                callbackRef.current();
              }
            } catch {
              // File might be temporarily unavailable during write — ignore
            }
          }, DEBOUNCE_MS);
        });

        if (cancelled) {
          unwatch();
        } else {
          stopWatcher = unwatch;
        }
      } catch (err) {
        console.error('Failed to watch file:', err);
      }
    };

    setup();

    return () => {
      cancelled = true;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (stopWatcher) stopWatcher();
    };
  }, [filePath, currentContent]);
}
