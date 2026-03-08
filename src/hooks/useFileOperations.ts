import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface FileOperationsResult {
  readFile: (path: string) => Promise<string>;
  save: (path: string, content: string, onSaved?: () => void) => void;
  saveImmediate: (path: string, content: string) => Promise<void>;
}

export function useFileOperations(): FileOperationsResult {
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up pending debounce on unmount
  useEffect(() => () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
  }, []);

  const readFile = useCallback(async (path: string): Promise<string> => {
    return invoke<string>('read_file', { path });
  }, []);

  const doWrite = useCallback(async (path: string, content: string) => {
    try {
      await invoke('write_file', { path, content });
    } catch (err) {
      console.error('Failed to save file:', err);
    }
  }, []);

  const save = useCallback(
    (path: string, content: string, onSaved?: () => void) => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      debounceTimer.current = setTimeout(() => {
        doWrite(path, content).then(() => onSaved?.());
      }, 500);
    },
    [doWrite],
  );

  const saveImmediate = useCallback(
    (path: string, content: string): Promise<void> => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
      return doWrite(path, content);
    },
    [doWrite],
  );

  return { readFile, save, saveImmediate };
}
