import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface FileOperationsResult {
  readFile: (path: string) => Promise<string>;
  save: (path: string, content: string, onSaved?: () => void) => void;
  saveImmediate: (path: string, content: string) => Promise<void>;
  saveStatus: SaveStatus;
  resetSaveStatus: () => void;
}

export function useFileOperations(): FileOperationsResult {
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  // Clean up pending debounce on unmount
  useEffect(() => () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
  }, []);

  const readFile = useCallback(async (path: string): Promise<string> => {
    return invoke<string>('read_file', { path });
  }, []);

  const resetSaveStatus = useCallback(() => setSaveStatus('idle'), []);

  const doWrite = useCallback(async (path: string, content: string) => {
    if (!window.__TAURI_INTERNALS__) return;
    try {
      await invoke('write_file', { path, content });
    } catch (err) {
      console.error('Failed to save file:', err);
      throw err;
    }
  }, []);

  const save = useCallback(
    (path: string, content: string, onSaved?: () => void) => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      setSaveStatus('pending');
      debounceTimer.current = setTimeout(() => {
        setSaveStatus('saving');
        doWrite(path, content)
          .then(() => {
            setSaveStatus('saved');
            onSaved?.();
          })
          .catch(() => setSaveStatus('error'));
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
      setSaveStatus('saving');
      return doWrite(path, content)
        .then(() => {
          setSaveStatus('saved');
        })
        .catch((err: unknown) => {
          setSaveStatus('error');
          throw err;
        });
    },
    [doWrite],
  );

  return { readFile, save, saveImmediate, saveStatus, resetSaveStatus };
}
