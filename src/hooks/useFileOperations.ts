import { useCallback, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { createFileSaveCoordinator } from '../lib/fileSaveCoordinator';

interface FileOperationsResult {
  readFile: (path: string) => Promise<string>;
  save: (path: string, content: string, onSaved?: () => void) => void;
  saveImmediate: (path: string, content: string) => Promise<void>;
}

export function useFileOperations(): FileOperationsResult {
  const doWrite = useCallback(async (path: string, content: string) => {
    await invoke('write_file', { path, content });
  }, []);

  const saveCoordinator = useMemo(
    () => createFileSaveCoordinator(doWrite, 500, (err) => {
      console.error('Failed to save file:', err);
    }),
    [doWrite],
  );

  // Clean up pending debounced saves on unmount.
  useEffect(() => () => {
    saveCoordinator.clearAll();
  }, [saveCoordinator]);

  const readFile = useCallback(async (path: string): Promise<string> => {
    return invoke<string>('read_file', { path });
  }, []);

  const save = useCallback(
    (path: string, content: string, onSaved?: () => void) => {
      saveCoordinator.save(path, content, onSaved);
    },
    [saveCoordinator],
  );

  const saveImmediate = useCallback(
    (path: string, content: string): Promise<void> => {
      return saveCoordinator.saveImmediate(path, content);
    },
    [saveCoordinator],
  );

  return { readFile, save, saveImmediate };
}
