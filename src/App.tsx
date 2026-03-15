import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';

import { Editor } from './components/Editor';
import { GitStatusBar } from './components/GitStatusBar';
import type { PaletteCommand } from './lib/fuzzyMatch';

const DiffView = lazy(() => import('./components/DiffView').then(m => ({ default: m.DiffView })));
const Sidebar = lazy(() => import('./components/Sidebar').then(m => ({ default: m.Sidebar })));
const GitLog = lazy(() => import('./components/GitLog').then(m => ({ default: m.GitLog })));
const CommandPalette = lazy(() => import('./components/CommandPalette').then(m => ({ default: m.CommandPalette })));

import { useFileOperations } from './hooks/useFileOperations';
import { useFileWatcher } from './hooks/useFileWatcher';
import { useTheme } from './hooks/useTheme';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useResizable } from './hooks/useResizable';

const modKey = navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl+';

function App() {
  useTheme();

  const { readFile, save, saveImmediate } = useFileOperations();

  const [filePath, setFilePath] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [repoPath, setRepoPath] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showGitLog, setShowGitLog] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [diff, setDiff] = useState('');
  const [showFind, setShowFind] = useState(false);
  const [gitStatusKey, setGitStatusKey] = useState(0);

  const [, setZoom] = useState(100);

  // Cached markdown file list for command palette
  const [mdFiles, setMdFiles] = useState<string[]>([]);

  // Resizable panels
  const sidebar = useResizable({ direction: 'horizontal', initialSize: 240, minSize: 160, maxSize: 500, side: 'left' });
  const diffPanel = useResizable({ direction: 'horizontal', initialSize: 380, minSize: 200, maxSize: 700, side: 'right' });
  const gitLog = useResizable({ direction: 'vertical', initialSize: 220, minSize: 100, maxSize: 500, side: 'bottom' });

  // Refs for values needed in callbacks without stale closures
  const showDiffRef = useRef(showDiff);
  const filePathRef = useRef(filePath);
  const repoPathRef = useRef(repoPath);
  useEffect(() => { showDiffRef.current = showDiff; });
  useEffect(() => { filePathRef.current = filePath; });
  useEffect(() => { repoPathRef.current = repoPath; });

  // Load file content and find git repo (parallel)
  const loadFile = useCallback(
    async (path: string) => {
      const [textResult, repoResult] = await Promise.allSettled([
        readFile(path),
        invoke<string | null>('git_find_repo', { path }),
      ]);

      if (textResult.status === 'fulfilled') {
        setContent(textResult.value);
        setFilePath(path);
        const fileName = path.split('/').pop() || 'mpad';
        getCurrentWindow().setTitle(fileName).catch(() => {});
      } else {
        console.error('Failed to read file:', textResult.reason);
        return;
      }

      const rp = repoResult.status === 'fulfilled' ? repoResult.value : null;
      setRepoPath(rp);
      // Set folder root: prefer git repo root, fall back to file's parent dir
      setFolderPath((prev) => prev ?? (rp || path.replace(/\/[^/]+$/, '')));

      // Refresh diff if panel is open (use ref for fresh showDiff value)
      if (showDiffRef.current && rp) {
        invoke<string>('git_file_diff', { repoPath: rp, filePath: path })
          .then(setDiff)
          .catch(() => setDiff(''));
      }
    },
    [readFile],
  );

  // Fetch markdown files when folder changes (cached for palette)
  useEffect(() => {
    if (!folderPath) return;
    let stale = false;
    invoke<string[]>('list_markdown_files', { root: folderPath })
      .then((files) => { if (!stale) setMdFiles(files); })
      .catch(() => { if (!stale) setMdFiles([]); });
    return () => { stale = true; };
  }, [folderPath]);

  // Listen for open-file events from Rust backend (used for multi-window / second instance)
  const loadFileRef = useRef(loadFile);
  useEffect(() => { loadFileRef.current = loadFile; });
  useEffect(() => {
    const unlisten = listen<string>('open-file', (event) => {
      loadFileRef.current(event.payload);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // On mount, determine the initial file to open:
  // 1. Check URL query params (used by multi-window / second instance)
  // 2. Ask the backend for the CLI arg (avoids race condition of emitting events in setup())
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlFile = params.get('file');
    if (urlFile) {
      loadFileRef.current(urlFile);
      return;
    }

    invoke<string | null>('get_initial_file')
      .then((path) => {
        if (path) {
          loadFileRef.current(path);
        }
      })
      .catch(() => {
        // get_initial_file unavailable
      });
  }, []);

  // Keep refs for values needed in effects without causing re-runs
  const contentRef = useRef(content);
  useEffect(() => { contentRef.current = content; });


  // Auto-reload on external file changes
  const handleExternalReload = useCallback((diskContent: string) => {
    setContent(diskContent);
  }, []);

  useFileWatcher(filePath, contentRef, handleExternalReload);

  // Fetch diff for current file
  const fetchDiff = useCallback(async (fp: string, rp: string) => {
    try {
      const d = await invoke<string>('git_file_diff', { repoPath: rp, filePath: fp });
      setDiff(d);
    } catch {
      setDiff('');
    }
  }, []);

  // Refresh diff if panel is open (reads refs for fresh values)
  const refreshDiff = useCallback(() => {
    if (showDiffRef.current && filePathRef.current && repoPathRef.current) {
      fetchDiff(filePathRef.current, repoPathRef.current);
    }
  }, [fetchDiff]);

  const refreshAfterSave = useCallback(() => {
    refreshDiff();
    setGitStatusKey((k) => k + 1);
  }, [refreshDiff]);

  // Editor update handler
  const handleEditorUpdate = useCallback(
    (md: string) => {
      setContent(md);
      if (filePath) {
        save(filePath, md, refreshAfterSave);
      }
    },
    [filePath, save, refreshAfterSave],
  );

  // Force save (Cmd+S) — write immediately, no debounce
  const handleSave = useCallback(() => {
    if (filePath) {
      saveImmediate(filePath, contentRef.current).then(refreshAfterSave);
    }
  }, [filePath, saveImmediate, refreshAfterSave]);

  // Open file dialog (Cmd+O)
  const handleOpen = useCallback(async () => {
    try {
      const dir = filePathRef.current?.replace(/\/[^/]+$/, '') ?? undefined;
      const selected = await open({
        multiple: false,
        defaultPath: dir,
        filters: [
          { name: 'Markdown', extensions: ['md', 'markdown', 'mdown'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (selected && typeof selected === 'string') {
        loadFile(selected);
      }
    } catch {
      // Dialog cancelled or unavailable
    }
  }, [loadFile]);

  // New file dialog (Cmd+N)
  const handleNewFile = useCallback(async () => {
    try {
      const dir = filePathRef.current?.replace(/\/[^/]+$/, '') ?? folderPath ?? undefined;
      const selected = await saveDialog({
        defaultPath: dir,
        filters: [
          { name: 'Markdown', extensions: ['md', 'markdown', 'mdown'] },
        ],
      });
      if (selected && typeof selected === 'string') {
        let path = selected;
        if (!/\.(md|markdown|mdown)$/i.test(path)) path += '.md';
        await invoke('write_file', { path, content: '' });
        loadFile(path);
      }
    } catch {
      // Dialog cancelled or unavailable
    }
  }, [folderPath, loadFile]);

  // Open folder dialog (Cmd+Shift+O)
  const handleOpenFolder = useCallback(async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        setFolderPath(selected);
        setShowSidebar(true);
        // Detect git repo for status overlay
        invoke<string | null>('git_find_repo', { path: selected })
          .then(setRepoPath)
          .catch(() => setRepoPath(null));
      }
    } catch {
      // Dialog cancelled or unavailable
    }
  }, []);

  // Toggle diff
  const handleToggleDiff = useCallback(async () => {
    if (!showDiff && filePath && repoPath) {
      await fetchDiff(filePath, repoPath);
    }
    setShowDiff((v) => !v);
  }, [showDiff, filePath, repoPath, fetchDiff]);


  // Zoom handlers — apply via both CSS and Tauri webview API for cross-platform reliability
  const applyZoom = useCallback((level: number) => {
    const factor = level / 100;
    document.documentElement.style.fontSize = `${level}%`;
    getCurrentWebview().setZoom(factor).catch(() => {});
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => {
      const next = Math.min(z + 10, 200);
      applyZoom(next);
      return next;
    });
  }, [applyZoom]);
  const handleZoomOut = useCallback(() => {
    setZoom((z) => {
      const next = Math.max(z - 10, 60);
      applyZoom(next);
      return next;
    });
  }, [applyZoom]);
  const handleZoomReset = useCallback(() => {
    setZoom(100);
    applyZoom(100);
  }, [applyZoom]);

  // Palette commands
  const paletteCommands: PaletteCommand[] = useMemo(
    () => [
      { id: 'save', label: 'Save', shortcut: `${modKey}S`, action: handleSave },
      { id: 'new', label: 'New File', shortcut: `${modKey}N`, action: handleNewFile },
      { id: 'open', label: 'Open File', shortcut: `${modKey}O`, action: handleOpen },
      { id: 'open-folder', label: 'Open Folder', shortcut: `${modKey}Shift+O`, action: handleOpenFolder },
      { id: 'find', label: 'Find', shortcut: `${modKey}F`, action: () => setShowFind((v) => !v) },
      { id: 'source', label: 'Toggle Source', shortcut: `${modKey}/`, action: () => setShowSource((v) => !v) },
      { id: 'diff', label: 'Toggle Diff', shortcut: `${modKey}D`, action: handleToggleDiff },
      { id: 'sidebar', label: 'Toggle Sidebar', shortcut: `${modKey}\\`, action: () => setShowSidebar((v) => !v) },
      { id: 'gitlog', label: 'Toggle Git Log', shortcut: `${modKey}L`, action: () => setShowGitLog((v) => !v) },
      { id: 'zoomin', label: 'Zoom In', shortcut: `${modKey}+`, action: handleZoomIn },
      { id: 'zoomout', label: 'Zoom Out', shortcut: `${modKey}-`, action: handleZoomOut },
      { id: 'zoomreset', label: 'Zoom Reset', shortcut: `${modKey}0`, action: handleZoomReset },
    ],
    [handleSave, handleNewFile, handleOpen, handleOpenFolder, handleToggleDiff, handleZoomIn, handleZoomOut, handleZoomReset],
  );

  // Keyboard shortcuts
  const shortcutHandlers = useMemo(
    () => ({
      onSave: handleSave,
      onNewFile: handleNewFile,
      onOpen: handleOpen,
      onOpenFolder: handleOpenFolder,
      onToggleSource: () => setShowSource((v) => !v),
      onToggleDiff: handleToggleDiff,
      onToggleSidebar: () => setShowSidebar((v) => !v),
      onToggleGitLog: () => setShowGitLog((v) => !v),
      onToggleCheatsheet: () => setShowPalette((v) => !v),
      onFind: () => setShowFind((v) => !v),
      onZoomIn: handleZoomIn,
      onZoomOut: handleZoomOut,
      onZoomReset: handleZoomReset,
    }),
    [handleSave, handleNewFile, handleOpen, handleOpenFolder, handleToggleDiff, handleZoomIn, handleZoomOut, handleZoomReset],
  );

  useKeyboardShortcuts(shortcutHandlers);

  return (
    <div className="app-layout">
      {showSidebar && (
        <Suspense>
          <Sidebar
            folderPath={folderPath}
            repoPath={repoPath}
            currentFile={filePath}
            onFileSelect={loadFile}
            visible={showSidebar}
            style={{ width: sidebar.size }}
          />
          <div className="resize-handle resize-handle-h" onMouseDown={sidebar.onMouseDown} />
        </Suspense>
      )}

      <div className="app-main">
        <div className="editor-area" style={{ display: 'flex' }}>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {filePath ? (
              <Editor
                content={content}
                onUpdate={handleEditorUpdate}
                showSource={showSource}
                filePath={filePath}
                showFind={showFind}
                onCloseFindBar={() => setShowFind(false)}
              />
            ) : (
              <div className="empty-state">
                <span>
                  Open a file with{' '}
                  <kbd style={{ opacity: 0.7 }}>{modKey}K</kbd> or pass a path as
                  argument
                </span>
              </div>
            )}
          </div>

          {showDiff && (
            <Suspense>
              <div className="resize-handle resize-handle-h" onMouseDown={diffPanel.onMouseDown} />
              <DiffView diff={diff} visible={showDiff} style={{ width: diffPanel.size }} />
            </Suspense>
          )}
        </div>

        {showGitLog && (
          <Suspense>
            <div className="resize-handle resize-handle-v" onMouseDown={gitLog.onMouseDown} />
            <GitLog
              repoPath={repoPath}
              filePath={filePath}
              style={{ height: gitLog.size }}
            />
          </Suspense>
        )}

        <GitStatusBar
          filePath={filePath}
          repoPath={repoPath}
          refreshKey={gitStatusKey}
        />
      </div>

      {showPalette && (
        <Suspense>
          <CommandPalette
            commands={paletteCommands}
            files={mdFiles}
            repoPath={folderPath}
            onFileSelect={loadFile}
            onClose={() => setShowPalette(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;
