import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('save debounce behavior', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('debounced save only fires once within 500ms', () => {
    const doWrite = vi.fn().mockResolvedValue(undefined);
    let timer: ReturnType<typeof setTimeout> | null = null;

    const save = (content: string, onSaved?: () => void) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        doWrite(content).then(() => onSaved?.());
      }, 500);
    };

    save('version 1');
    save('version 2');
    save('version 3');

    expect(doWrite).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(doWrite).toHaveBeenCalledTimes(1);
    expect(doWrite).toHaveBeenCalledWith('version 3');
  });

  it('onSaved callback fires after write completes', async () => {
    const doWrite = vi.fn().mockResolvedValue(undefined);
    const onSaved = vi.fn();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const save = (content: string, cb?: () => void) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        doWrite(content).then(() => cb?.());
      }, 500);
    };

    save('content', onSaved);
    vi.advanceTimersByTime(500);

    await vi.runAllTimersAsync();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('saveImmediate cancels pending debounced save', () => {
    const doWrite = vi.fn().mockResolvedValue(undefined);
    let timer: ReturnType<typeof setTimeout> | null = null;

    const save = (content: string) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { doWrite(content); }, 500);
    };

    const saveImmediate = (content: string) => {
      if (timer) { clearTimeout(timer); timer = null; }
      return doWrite(content);
    };

    save('debounced content');
    saveImmediate('immediate content');

    vi.advanceTimersByTime(500);
    expect(doWrite).toHaveBeenCalledTimes(1);
    expect(doWrite).toHaveBeenCalledWith('immediate content');
  });

  it('diff should refresh after debounced save completes', async () => {
    vi.useFakeTimers();

    let diffRefreshed = false;
    const refreshDiff = () => { diffRefreshed = true; };
    const doWrite = vi.fn().mockResolvedValue(undefined);

    let timer: ReturnType<typeof setTimeout> | null = null;
    const save = (content: string, onSaved?: () => void) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        doWrite(content).then(() => onSaved?.());
      }, 500);
    };

    save('new content', refreshDiff);

    expect(diffRefreshed).toBe(false);
    vi.advanceTimersByTime(500);
    await vi.runAllTimersAsync();

    expect(doWrite).toHaveBeenCalled();
    expect(diffRefreshed).toBe(true);

    vi.useRealTimers();
  });
});
