import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';

import { Editor } from './components/Editor';
import { GitStatusBar } from './components/GitStatusBar';
import { DiffView } from './components/DiffView';
import { Sidebar } from './components/Sidebar';
import { GitLog } from './components/GitLog';
import { QuickOpen } from './components/QuickOpen';

import { useFileOperations } from './hooks/useFileOperations';
import { useFileWatcher } from './hooks/useFileWatcher';
import { useTheme } from './hooks/useTheme';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

function App() {
  useTheme();

  const { readFile, save, saveImmediate } = useFileOperations();

  const [filePath, setFilePath] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [repoPath, setRepoPath] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showGitLog, setShowGitLog] = useState(false);
  const [showQuickOpen, setShowQuickOpen] = useState(false);
  const [diff, setDiff] = useState('');
  const [externalChange, setExternalChange] = useState(false);

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
        setExternalChange(false);
      } else {
        console.error('Failed to read file:', textResult.reason);
        return;
      }

      setRepoPath(repoResult.status === 'fulfilled' ? repoResult.value : null);
    },
    [readFile],
  );

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

  // Keep a ref to current content for the file watcher to compare against
  const contentRef = useRef(content);
  useEffect(() => { contentRef.current = content; });

  // External file change handler
  const handleExternalChange = useCallback(() => {
    setExternalChange(true);
  }, []);

  useFileWatcher(filePath, contentRef, handleExternalChange);

  // Reload file from disk
  const reloadFile = useCallback(async () => {
    if (filePath) {
      try {
        const text = await readFile(filePath);
        setContent(text);
        setExternalChange(false);
      } catch (err) {
        console.error('Failed to reload file:', err);
      }
    }
  }, [filePath, readFile]);

  // Editor update handler
  const handleEditorUpdate = useCallback(
    (md: string) => {
      setContent(md);
      if (filePath) {
        save(filePath, md);
      }
    },
    [filePath, save],
  );

  // Force save (Cmd+S) — write immediately, no debounce
  const handleSave = useCallback(() => {
    if (filePath) {
      saveImmediate(filePath, contentRef.current);
    }
  }, [filePath, saveImmediate]);

  // Open file dialog (Cmd+O)
  const handleOpen = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
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

  // Toggle diff
  const handleToggleDiff = useCallback(async () => {
    if (!showDiff && filePath && repoPath) {
      try {
        const d = await invoke<string>('git_file_diff', { repoPath, filePath });
        setDiff(d);
      } catch {
        setDiff('');
      }
    }
    setShowDiff((v) => !v);
  }, [showDiff, filePath, repoPath]);

  // Keyboard shortcuts
  const shortcutHandlers = useMemo(
    () => ({
      onSave: handleSave,
      onOpen: handleOpen,
      onQuickOpen: () => setShowQuickOpen((v) => !v),
      onToggleSource: () => setShowSource((v) => !v),
      onToggleDiff: handleToggleDiff,
      onToggleSidebar: () => setShowSidebar((v) => !v),
      onToggleGitLog: () => setShowGitLog((v) => !v),
    }),
    [handleSave, handleOpen, handleToggleDiff],
  );

  useKeyboardShortcuts(shortcutHandlers);

  return (
    <div className="app-layout">
      <Sidebar
        repoPath={repoPath}
        currentFile={filePath}
        onFileSelect={loadFile}
        visible={showSidebar}
      />

      <div className="app-main">
        {externalChange && (
          <div className="notification-bar">
            <span>File changed on disk</span>
            <div style={{ display: 'flex', gap: '0.5em' }}>
              <button onClick={reloadFile}>Reload</button>
              <button onClick={() => setExternalChange(false)}>Dismiss</button>
            </div>
          </div>
        )}

        <div className="editor-area" style={{ display: 'flex' }}>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {filePath ? (
              <Editor
                content={content}
                onUpdate={handleEditorUpdate}
                showSource={showSource}
                filePath={filePath}
              />
            ) : (
              <div className="empty-state">
                <span>
                  Open a file with{' '}
                  <kbd style={{ opacity: 0.7 }}>Cmd+O</kbd> or pass a path as
                  argument
                </span>
              </div>
            )}
          </div>

          <DiffView diff={diff} visible={showDiff} />
        </div>

        {showGitLog && (
          <GitLog
            repoPath={repoPath}
            filePath={filePath}
          />
        )}

        <GitStatusBar
          filePath={filePath}
          repoPath={repoPath}
        />
      </div>

      {showQuickOpen && (
        <QuickOpen
          repoPath={repoPath}
          onSelect={loadFile}
          onClose={() => setShowQuickOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
