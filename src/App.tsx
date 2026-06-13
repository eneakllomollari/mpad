import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { TitleBar } from './components/TitleBar';
import { CommandPalette } from './components/CommandPalette';
import { StatusBar } from './components/StatusBar';
import type { PaletteCommand } from './lib/fuzzyMatch';

const Editor = lazy(() => import('./components/Editor').then(m => ({ default: m.Editor })));
const DiffView = lazy(() => import('./components/DiffView').then(m => ({ default: m.DiffView })));
const Sidebar = lazy(() => import('./components/Sidebar').then(m => ({ default: m.Sidebar })));
const GitLog = lazy(() => import('./components/GitLog').then(m => ({ default: m.GitLog })));

import { useFileOperations } from './hooks/useFileOperations';
import { useFileWatcher } from './hooks/useFileWatcher';
import { useTheme } from './hooks/useTheme';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useResizable } from './hooks/useResizable';
import { useStickyTrue } from './hooks/useStickyTrue';

const modKey = navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl+';

function App() {
  useTheme();

  const { readFile, save, saveImmediate, saveStatus, resetSaveStatus } = useFileOperations();

  const [filePath, setFilePath] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [repoPath, setRepoPath] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showGitLog, setShowGitLog] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [paletteKey, setPaletteKey] = useState(0);
  const [diff, setDiff] = useState('');
  const [showFind, setShowFind] = useState(false);
  const [findRequestToken, setFindRequestToken] = useState(0);
  const [fileStatus, setFileStatus] = useState<{ branch: string; status: string } | null>(null);

  const [, setZoom] = useState(100);

  // Sticky "has been opened" flags so lazy panels mount once and stay
  // mounted for smooth open/close CSS transitions. Uses the React-documented
  // setState-during-render pattern for derived state, not useEffect.
  const sidebarMounted = useStickyTrue(showSidebar);
  const diffMounted = useStickyTrue(showDiff);
  const gitLogMounted = useStickyTrue(showGitLog);
  const sidebarVisible = showSidebar && Boolean(folderPath);

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
        resetSaveStatus();
        getCurrentWindow().setTitle('mpad').catch(() => {});
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
    [readFile, resetSaveStatus],
  );

  // Open a path — handles both files and directories from CLI, URL, or dialog
  const openPath = useCallback(
    async (path: string) => {
      const isDir = await invoke<boolean>('is_directory', { path }).catch(() => false);
      if (isDir) {
        setFolderPath(path);
        setShowSidebar(true);
        invoke<string | null>('git_find_repo', { path })
          .then(setRepoPath)
          .catch(() => setRepoPath(null));
      } else {
        loadFile(path);
      }
    },
    [loadFile],
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
  const openPathRef = useRef(openPath);
  useEffect(() => { openPathRef.current = openPath; });
  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return;
    const unlisten = listen<string>('open-file', (event) => {
      openPathRef.current(event.payload);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // On mount, determine the initial file to open:
  // 1. Dev-only: if Tauri is absent and ?file=demo, mount editor with sample content
  // 2. Check URL query params (used by multi-window / second instance)
  // 3. Ask the backend for the CLI arg (avoids race condition of emitting events in setup())
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlFile = params.get('file');

    if (!window.__TAURI_INTERNALS__ && urlFile === 'demo') {
      Promise.resolve().then(() => {
        setContent('# Welcome to mpad\n\nThis is a **demo** document for browser testing.\n\n- Item one\n- Item two\n- Item three\n\n> A blockquote for testing.\n\n```js\nconsole.log("hello");\n```\n');
        setFilePath('/demo.md');
      });
      return;
    }

    if (urlFile) {
      openPathRef.current(urlFile);
      return;
    }

    invoke<string | null>('get_initial_file')
      .then((path) => {
        if (path) {
          openPathRef.current(path);
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

  const refreshFileStatus = useCallback(() => {
    const filePathAtRequest = filePathRef.current;
    const repoPathAtRequest = repoPathRef.current;

    if (!filePathAtRequest || !repoPathAtRequest) {
      setFileStatus(null);
      return;
    }

    invoke<{ branch: string; status: string }>('git_file_status', {
      repoPath: repoPathAtRequest,
      filePath: filePathAtRequest,
    })
      .then((status) => {
        if (filePathRef.current === filePathAtRequest && repoPathRef.current === repoPathAtRequest) {
          setFileStatus(status);
        }
      })
      .catch(() => setFileStatus(null));
  }, []);

  useEffect(() => {
    if (!filePath || !repoPath) {
      Promise.resolve().then(() => setFileStatus(null));
      return;
    }

    let stale = false;
    invoke<{ branch: string; status: string }>('git_file_status', { repoPath, filePath })
      .then((status) => { if (!stale) setFileStatus(status); })
      .catch(() => { if (!stale) setFileStatus(null); });

    return () => { stale = true; };
  }, [filePath, repoPath]);

  // Editor update handler
  const handleEditorUpdate = useCallback(
    (md: string) => {
      setContent(md);
      if (filePath) {
        save(filePath, md, () => {
          refreshDiff();
          refreshFileStatus();
        });
      }
    },
    [filePath, save, refreshDiff, refreshFileStatus],
  );

  // Force save (Cmd+S) — write immediately, no debounce
  const handleSave = useCallback(() => {
    if (filePath) {
      saveImmediate(filePath, contentRef.current)
        .then(() => {
          refreshDiff();
          refreshFileStatus();
        })
        .catch(() => {});
    }
  }, [filePath, saveImmediate, refreshDiff, refreshFileStatus]);

  // Cmd+O — single native NSOpenPanel that lets the user pick either a file
  // or a folder. tauri_plugin_dialog's `open()` can only do one or the other,
  // so this routes through a custom Rust command that drives NSOpenPanel
  // directly with canChooseFiles + canChooseDirectories both true.
  const handleOpen = useCallback(async () => {
    try {
      const selected = await invoke<string | null>('pick_file_or_folder');
      if (selected) openPath(selected);
    } catch {
      // User cancelled or platform unsupported
    }
  }, [openPath]);

  // Toggle diff
  const handleToggleDiff = useCallback(async () => {
    if (!filePath || !repoPath) return;
    if (!showDiff && filePath && repoPath) {
      await fetchDiff(filePath, repoPath);
    }
    setShowDiff((v) => !v);
  }, [showDiff, filePath, repoPath, fetchDiff]);


  // Zoom handlers — apply via both CSS and Tauri webview API for cross-platform reliability
  const applyZoom = useCallback((level: number) => {
    document.documentElement.style.fontSize = `${level}%`;
    getCurrentWebview().setZoom(level / 100).catch(() => {});
  }, []);

  const adjustZoom = useCallback((delta: number) => {
    setZoom((z) => {
      const next = Math.min(Math.max(z + delta, 60), 200);
      applyZoom(next);
      return next;
    });
  }, [applyZoom]);

  const handleZoomIn = useCallback(() => adjustZoom(10), [adjustZoom]);
  const handleZoomOut = useCallback(() => adjustZoom(-10), [adjustZoom]);
  const handleZoomReset = useCallback(() => {
    setZoom(100);
    applyZoom(100);
  }, [applyZoom]);

  const openFind = useCallback(() => {
    if (!filePathRef.current) return;
    setShowFind(true);
    setFindRequestToken((token) => token + 1);
  }, []);

  const toggleSource = useCallback(() => {
    if (!filePathRef.current) return;
    setShowSource((v) => !v);
  }, []);

  const toggleGitLog = useCallback(() => {
    if (!filePathRef.current || !repoPathRef.current) return;
    setShowGitLog((v) => !v);
  }, []);

  const toggleSidebar = useCallback(() => {
    if (!folderPath) {
      handleOpen();
      return;
    }
    setShowSidebar((v) => !v);
  }, [folderPath, handleOpen]);

  // Palette commands
  const paletteCommands: PaletteCommand[] = useMemo(
    () => [
      {
        id: 'save',
        label: 'Save changes',
        shortcut: `${modKey}S`,
        action: handleSave,
        disabled: !filePath,
        disabledReason: 'No document selected',
      },
      { id: 'open', label: 'Open file or folder', shortcut: `${modKey}O`, action: handleOpen },
      {
        id: 'find',
        label: 'Find in document',
        shortcut: `${modKey}F`,
        action: openFind,
        disabled: !filePath,
        disabledReason: 'No document selected',
      },
      {
        id: 'source',
        label: showSource ? 'Return to rich text' : 'Edit Markdown source',
        shortcut: `${modKey}/`,
        action: toggleSource,
        disabled: !filePath,
        disabledReason: 'No document selected',
      },
      {
        id: 'sidebar',
        label: folderPath && showSidebar ? 'Hide files' : 'Browse files',
        shortcut: '[',
        action: toggleSidebar,
      },
      {
        id: 'diff',
        label: showDiff ? 'Hide changes' : 'Show changes',
        shortcut: ']',
        action: handleToggleDiff,
        disabled: !filePath || !repoPath,
        disabledReason: filePath ? 'No Git history here' : 'No document selected',
      },
      {
        id: 'gitlog',
        label: showGitLog ? 'Hide history' : 'Show history',
        shortcut: `${modKey}L`,
        action: toggleGitLog,
        disabled: !filePath || !repoPath,
        disabledReason: filePath ? 'No Git history here' : 'No document selected',
      },
      { id: 'zoomin', label: 'Zoom in', shortcut: `${modKey}+`, action: handleZoomIn },
      { id: 'zoomout', label: 'Zoom out', shortcut: `${modKey}-`, action: handleZoomOut },
      { id: 'zoomreset', label: 'Reset zoom', shortcut: `${modKey}0`, action: handleZoomReset },
    ],
    [filePath, repoPath, folderPath, showSource, showSidebar, showDiff, showGitLog, handleSave, handleOpen, openFind, toggleSource, toggleSidebar, handleToggleDiff, toggleGitLog, handleZoomIn, handleZoomOut, handleZoomReset],
  );

  // Keyboard shortcuts
  const shortcutHandlers = useMemo(
    () => ({
      onSave: handleSave,
      onOpen: handleOpen,
      onToggleSource: toggleSource,
      onToggleDiff: handleToggleDiff,
      onToggleSidebar: toggleSidebar,
      onToggleGitLog: toggleGitLog,
      onToggleCheatsheet: () => {
        setPaletteKey((k) => k + 1);
        setShowPalette((v) => !v);
      },
      onFind: openFind,
      onZoomIn: handleZoomIn,
      onZoomOut: handleZoomOut,
      onZoomReset: handleZoomReset,
    }),
    [handleSave, handleOpen, openFind, toggleSource, handleToggleDiff, toggleSidebar, toggleGitLog, handleZoomIn, handleZoomOut, handleZoomReset],
  );

  useKeyboardShortcuts(shortcutHandlers);

  return (
    <div className="app-layout">
      <TitleBar />
      <div className="app-content">
        <div
          className="panel-side panel-side--left"
          data-show={String(sidebarVisible)}
          style={{ width: sidebarVisible ? sidebar.size + 8 : 0 }}
          aria-hidden={!sidebarVisible}
        >
          {sidebarMounted && (
            <Suspense>
              <Sidebar
                folderPath={folderPath}
                repoPath={repoPath}
                currentFile={filePath}
                onFileSelect={loadFile}
                visible={sidebarVisible}
                style={{ width: sidebar.size }}
              />
              <div className="resize-handle resize-handle-h" onMouseDown={sidebar.onMouseDown} onKeyDown={sidebar.onKeyDown} {...sidebar.ariaProps} />
            </Suspense>
          )}
        </div>

        <main className="app-main">
          <div className="editor-area">
            <div className="editor-container">
              {filePath ? (
                <Suspense>
                  <Editor
                    content={content}
                    onUpdate={handleEditorUpdate}
                    showSource={showSource}
                    filePath={filePath}
                    showFind={showFind}
                    findRequestToken={findRequestToken}
                    onCloseFindBar={() => setShowFind(false)}
                  />
                </Suspense>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-actions">
                    <button type="button" className="empty-action" onClick={handleOpen}>
                      <kbd>{modKey}O</kbd>
                      <span>Open file or folder</span>
                    </button>
                    <button type="button" className="empty-action" onClick={() => { setPaletteKey((k) => k + 1); setShowPalette(true); }}>
                      <kbd>{modKey}K</kbd>
                      <span>Quick actions</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div
              className="panel-side panel-side--right"
              data-show={String(showDiff)}
              style={{ width: showDiff ? diffPanel.size + 8 : 0 }}
              aria-hidden={!showDiff}
            >
              {diffMounted && (
                <Suspense>
                  <div className="resize-handle resize-handle-h" onMouseDown={diffPanel.onMouseDown} onKeyDown={diffPanel.onKeyDown} {...diffPanel.ariaProps} />
                  <DiffView diff={diff} visible={showDiff} style={{ width: diffPanel.size }} />
                </Suspense>
              )}
            </div>
          </div>

          <div
            className="panel-bottom"
            data-show={String(showGitLog)}
            style={{ height: showGitLog ? gitLog.size + 8 : 0 }}
            aria-hidden={!showGitLog}
          >
            {gitLogMounted && (
              <Suspense>
                <div className="resize-handle resize-handle-v" onMouseDown={gitLog.onMouseDown} onKeyDown={gitLog.onKeyDown} {...gitLog.ariaProps} />
                <GitLog
                  repoPath={repoPath}
                  filePath={filePath}
                  style={{ height: gitLog.size }}
                />
              </Suspense>
            )}
          </div>
        </main>
      </div>

      <StatusBar
        filePath={filePath}
        repoPath={repoPath}
        fileStatus={fileStatus}
        saveStatus={saveStatus}
        showSource={showSource}
      />

      {showPalette && (
        <CommandPalette
          key={paletteKey}
          commands={paletteCommands}
          files={mdFiles}
          repoPath={folderPath}
          onFileSelect={loadFile}
          onClose={() => setShowPalette(false)}
        />
      )}
    </div>
  );
}

export default App;
