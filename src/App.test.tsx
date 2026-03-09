// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type OpenFileEvent = { payload: string };
type ShortcutHandlers = { onToggleCheatsheet?: () => void };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const testState = vi.hoisted(() => {
  let openFileListener: ((event: OpenFileEvent) => void) | null = null;
  let shortcutHandlers: ShortcutHandlers | null = null;
  let closePalette: (() => void) | null = null;

  return {
    invokeMock: vi.fn(),
    openMock: vi.fn(),
    reset() {
      openFileListener = null;
      shortcutHandlers = null;
      closePalette = null;
      this.invokeMock.mockReset();
      this.openMock.mockReset();
    },
    setOpenFileListener(listener: (event: OpenFileEvent) => void) {
      openFileListener = listener;
    },
    getOpenFileListener() {
      return openFileListener;
    },
    setShortcutHandlers(handlers: ShortcutHandlers) {
      shortcutHandlers = handlers;
    },
    getShortcutHandlers() {
      return shortcutHandlers;
    },
    setClosePalette(handler: () => void) {
      closePalette = handler;
    },
    getClosePalette() {
      return closePalette;
    },
  };
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: testState.invokeMock,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_eventName: string, callback: (event: OpenFileEvent) => void) => {
    testState.setOpenFileListener(callback);
    return () => {};
  }),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: testState.openMock,
}));

vi.mock('./components/Editor', () => ({
  Editor: ({ content, filePath }: { content: string; filePath: string | null }) => (
    <div data-testid="editor-state">{`${filePath ?? 'none'}|${content}`}</div>
  ),
}));

vi.mock('./components/GitStatusBar', () => ({
  GitStatusBar: () => <div data-testid="status-bar" />,
}));

vi.mock('./components/Sidebar', () => ({
  Sidebar: ({ repoPath }: { repoPath: string | null }) => <div data-testid="sidebar">{repoPath ?? 'no-repo'}</div>,
}));

vi.mock('./components/DiffView', () => ({
  DiffView: () => <div data-testid="diff-view" />,
}));

vi.mock('./components/GitLog', () => ({
  GitLog: () => <div data-testid="git-log" />,
}));

vi.mock('./components/CommandPalette', () => ({
  CommandPalette: ({ files, onClose }: { files: string[]; onClose: () => void }) => {
    testState.setClosePalette(onClose);
    return (
    <div data-testid="palette-files">{files.length === 0 ? 'empty' : files.join('|')}</div>
    );
  },
}));

vi.mock('./hooks/useTheme', () => ({
  useTheme: () => {},
}));

vi.mock('./hooks/useFileWatcher', () => ({
  useFileWatcher: () => {},
}));

vi.mock('./hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: (handlers: ShortcutHandlers) => {
    testState.setShortcutHandlers(handlers);
  },
}));

vi.mock('./hooks/useResizable', () => ({
  useResizable: () => ({ size: 240, onMouseDown: () => {} }),
}));

import App from './App';

describe('App', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    testState.reset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('keeps the newest file when older loads resolve late', async () => {
    const firstRead = deferred<string>();
    const secondRead = deferred<string>();
    const firstRepo = deferred<string | null>();
    const secondRepo = deferred<string | null>();

    testState.invokeMock.mockImplementation((command: string, args?: { path?: string; root?: string }) => {
      switch (command) {
        case 'get_initial_file':
          return Promise.resolve(null);
        case 'read_file':
          return args?.path === '/notes/a.md' ? firstRead.promise : secondRead.promise;
        case 'git_find_repo':
          return args?.path === '/notes/a.md' ? firstRepo.promise : secondRepo.promise;
        case 'list_markdown_files':
          return Promise.resolve([]);
        default:
          return Promise.resolve(null);
      }
    });

    await act(async () => {
      root.render(<App />);
    });

    const openFile = testState.getOpenFileListener();
    expect(openFile).toBeTruthy();

    await act(async () => {
      openFile?.({ payload: '/notes/a.md' });
      openFile?.({ payload: '/notes/b.md' });
    });

    await act(async () => {
      secondRead.resolve('B body');
      secondRepo.resolve('/repo-b');
      await Promise.resolve();
    });

    expect(container.textContent).toContain('/notes/b.md|B body');

    await act(async () => {
      firstRead.resolve('A body');
      firstRepo.resolve('/repo-a');
      await Promise.resolve();
    });

    expect(container.textContent).toContain('/notes/b.md|B body');
    expect(container.textContent).not.toContain('/notes/a.md|A body');
  });

  it('hides stale repo files in the palette after switching to a non-repo file', async () => {
    testState.invokeMock.mockImplementation((command: string, args?: { path?: string; root?: string }) => {
      switch (command) {
        case 'get_initial_file':
          return Promise.resolve(null);
        case 'read_file':
          return Promise.resolve(args?.path === '/repo/docs/guide.md' ? '# guide' : '# loose');
        case 'git_find_repo':
          return Promise.resolve(args?.path === '/repo/docs/guide.md' ? '/repo' : null);
        case 'list_markdown_files':
          return Promise.resolve(args?.root === '/repo' ? ['docs/guide.md'] : []);
        default:
          return Promise.resolve(null);
      }
    });

    await act(async () => {
      root.render(<App />);
    });

    const openFile = testState.getOpenFileListener();
    expect(openFile).toBeTruthy();

    await act(async () => {
      openFile?.({ payload: '/repo/docs/guide.md' });
      await Promise.resolve();
    });

    await act(async () => {
      testState.getShortcutHandlers()?.onToggleCheatsheet?.();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.dynamicImportSettled();
    });

    expect(container.textContent).toContain('docs/guide.md');

    await act(async () => {
      testState.getClosePalette()?.();
      await Promise.resolve();
    });

    await act(async () => {
      openFile?.({ payload: '/outside.md' });
      await Promise.resolve();
    });

    await act(async () => {
      testState.getShortcutHandlers()?.onToggleCheatsheet?.();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.dynamicImportSettled();
    });

    expect(container.textContent).toContain('empty');
    expect(container.textContent).not.toContain('docs/guide.md');
  });
});
