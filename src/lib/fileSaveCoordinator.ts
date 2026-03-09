export interface FileSaveCoordinator {
  save: (path: string, content: string, onSaved?: () => void) => void;
  saveImmediate: (path: string, content: string) => Promise<void>;
  clearAll: () => void;
}

export type WriteFileFn = (path: string, content: string) => Promise<void>;
export type SaveErrorHandler = (error: unknown) => void;

export function createFileSaveCoordinator(
  writeFile: WriteFileFn,
  debounceMs: number,
  onError?: SaveErrorHandler,
): FileSaveCoordinator {
  const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const clearPending = (path: string) => {
    const timer = pendingTimers.get(path);
    if (!timer) return;
    clearTimeout(timer);
    pendingTimers.delete(path);
  };

  return {
    save(path, content, onSaved) {
      clearPending(path);
      const timer = setTimeout(async () => {
        pendingTimers.delete(path);
        try {
          await writeFile(path, content);
          onSaved?.();
        } catch (error) {
          onError?.(error);
        }
      }, debounceMs);
      pendingTimers.set(path, timer);
    },

    async saveImmediate(path, content) {
      clearPending(path);
      await writeFile(path, content);
    },

    clearAll() {
      for (const timer of pendingTimers.values()) {
        clearTimeout(timer);
      }
      pendingTimers.clear();
    },
  };
}
