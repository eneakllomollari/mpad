// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFileSaveCoordinator } from './fileSaveCoordinator';

describe('createFileSaveCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps debounced saves independent per file path', async () => {
    const writeFile = vi.fn<(...args: [string, string]) => Promise<void>>().mockResolvedValue(undefined);
    const coordinator = createFileSaveCoordinator(writeFile, 500);

    coordinator.save('/notes/a.md', 'A');
    coordinator.save('/notes/b.md', 'B');

    vi.advanceTimersByTime(500);
    await vi.runAllTimersAsync();

    expect(writeFile).toHaveBeenCalledTimes(2);
    expect(writeFile).toHaveBeenCalledWith('/notes/a.md', 'A');
    expect(writeFile).toHaveBeenCalledWith('/notes/b.md', 'B');
  });

  it('saveImmediate only cancels the pending save for the same file', async () => {
    const writeFile = vi.fn<(...args: [string, string]) => Promise<void>>().mockResolvedValue(undefined);
    const coordinator = createFileSaveCoordinator(writeFile, 500);

    coordinator.save('/notes/a.md', 'A1');
    coordinator.save('/notes/b.md', 'B1');
    await coordinator.saveImmediate('/notes/a.md', 'A2');

    vi.advanceTimersByTime(500);
    await vi.runAllTimersAsync();

    expect(writeFile).toHaveBeenCalledTimes(2);
    expect(writeFile).toHaveBeenNthCalledWith(1, '/notes/a.md', 'A2');
    expect(writeFile).toHaveBeenNthCalledWith(2, '/notes/b.md', 'B1');
  });

  it('does not fire onSaved when the write fails', async () => {
    const onSaved = vi.fn();
    const onError = vi.fn();
    const writeFile = vi
      .fn<(...args: [string, string]) => Promise<void>>()
      .mockRejectedValue(new Error('disk full'));
    const coordinator = createFileSaveCoordinator(writeFile, 500, onError);

    coordinator.save('/notes/a.md', 'A', onSaved);

    vi.advanceTimersByTime(500);
    await vi.runAllTimersAsync();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('propagates immediate save failures', async () => {
    const coordinator = createFileSaveCoordinator(
      vi.fn<(...args: [string, string]) => Promise<void>>().mockRejectedValue(new Error('readonly')),
      500,
    );

    await expect(coordinator.saveImmediate('/notes/a.md', 'A')).rejects.toThrow('readonly');
  });
});
