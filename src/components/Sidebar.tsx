import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface SidebarProps {
  folderPath: string | null;
  repoPath: string | null;
  currentFile: string | null;
  onFileSelect: (path: string) => void;
  visible: boolean;
  style?: React.CSSProperties;
}

interface GitEntry {
  path: string;
  status: string;
}

interface TreeNode {
  name: string;
  fullPath: string;
  isDir: boolean;
  status: string;
  children: TreeNode[];
}

function sortNodes(a: TreeNode, b: TreeNode): number {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function buildTree(mdFiles: string[], gitStatusMap: Map<string, string>): TreeNode[] {
  const root: TreeNode[] = [];
  const lookup = new Map<string, { children: TreeNode[]; childMap: Map<string, number> }>();

  // Root-level lookup
  const rootChildMap = new Map<string, number>();
  lookup.set('', { children: root, childMap: rootChildMap });

  for (const filePath of mdFiles) {
    const parts = filePath.split('/');
    let parentKey = '';
    let parent = lookup.get('')!;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      const fullPath = i === 0 ? name : `${parentKey}/${name}`;

      const existingIdx = parent.childMap.get(name);
      if (existingIdx == null) {
        const node: TreeNode = {
          name,
          fullPath,
          isDir: !isLast,
          status: isLast ? (gitStatusMap.get(filePath) ?? '') : '',
          children: [],
        };
        parent.childMap.set(name, parent.children.length);
        parent.children.push(node);

        if (!isLast) {
          const childMap = new Map<string, number>();
          lookup.set(fullPath, { children: node.children, childMap });
        }
        parent = { children: node.children, childMap: lookup.get(fullPath)?.childMap ?? new Map() };
      } else {
        const existing = parent.children[existingIdx];
        const cached = lookup.get(fullPath);
        parent = cached ?? { children: existing.children, childMap: new Map() };
      }
      parentKey = fullPath;
    }
  }

  // Sort all levels in-place
  const sortAll = (nodes: TreeNode[]) => {
    nodes.sort(sortNodes);
    for (const n of nodes) {
      if (n.isDir && n.children.length > 0) sortAll(n.children);
    }
  };
  sortAll(root);

  return root;
}

function statusColor(status: string): string | undefined {
  switch (status) {
    case 'modified':
      return 'var(--git-modified)';
    case 'untracked':
    case 'new':
      return 'var(--git-added)';
    case 'deleted':
      return 'var(--git-deleted)';
    default:
      return undefined;
  }
}

function statusLabel(status: string): string | undefined {
  switch (status) {
    case 'modified': return 'modified';
    case 'untracked':
    case 'new': return 'new file';
    case 'deleted': return 'deleted';
    default: return undefined;
  }
}

function TreeItem({
  node,
  depth,
  currentFile,
  rootPath,
  onFileSelect,
  firstFilePath,
}: {
  node: TreeNode;
  depth: number;
  currentFile: string | null;
  rootPath: string;
  onFileSelect: (path: string) => void;
  firstFilePath: string | null;
}) {
  const [expanded, setExpanded] = useState(() => {
    if (depth < 1) return true;
    const root = node.fullPath.split('/')[0];
    return root === '.claude' || root === '.cursor' || root === '.agents';
  });
  const paddingLeft = `${0.75 + depth * 0.75}em`;

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  };

  if (node.isDir) {
    return (
      <>
        <div
          className="tree-item tree-dir"
          style={{ paddingLeft }}
          role="treeitem"
          aria-expanded={expanded}
          tabIndex={-1}
          onClick={() => setExpanded(!expanded)}
          onKeyDown={(e) => handleKeyDown(e, () => setExpanded(!expanded))}
        >
          <span className="tree-dir-toggle" aria-hidden="true">{expanded ? '\u25BE' : '\u25B8'}</span>
          {node.name}
        </div>
        {expanded && (
          <div role="group">
            {node.children.map((child) => (
              <TreeItem
                key={child.fullPath}
                node={child}
                depth={depth + 1}
                currentFile={currentFile}
                rootPath={rootPath}
                onFileSelect={onFileSelect}
                firstFilePath={firstFilePath}
              />
            ))}
          </div>
        )}
      </>
    );
  }

  const base = rootPath.endsWith('/') ? rootPath : `${rootPath}/`;
  const absolutePath = `${base}${node.fullPath}`;
  const isActive = currentFile === absolutePath;
  const isFirstFallback = !currentFile && absolutePath === firstFilePath;
  const dotColor = statusColor(node.status);
  const gitLabel = statusLabel(node.status);

  return (
    <div
      className={`tree-item ${isActive ? 'active' : ''}`}
      style={{ paddingLeft }}
      role="treeitem"
      tabIndex={isActive || isFirstFallback ? 0 : -1}
      aria-current={isActive ? 'page' : undefined}
      aria-label={gitLabel ? `${node.name} (${gitLabel})` : node.name}
      onClick={() => onFileSelect(absolutePath)}
      onKeyDown={(e) => handleKeyDown(e, () => onFileSelect(absolutePath))}
    >
      {dotColor && (
        <span
          className="status-dot"
          style={{ background: dotColor }}
          aria-hidden="true"
        />
      )}
      {node.name}
    </div>
  );
}

export function Sidebar({
  folderPath,
  repoPath,
  currentFile,
  onFileSelect,
  visible,
  style,
}: SidebarProps) {
  const [mdFiles, setMdFiles] = useState<string[]>([]);
  const [gitStatusMap, setGitStatusMap] = useState(() => new Map<string, string>());

  // Fetch markdown files from folder root
  useEffect(() => {
    if (!folderPath) return;
    let stale = false;
    invoke<string[]>('list_markdown_files', { root: folderPath })
      .then((files) => { if (!stale) setMdFiles(files); })
      .catch(() => { if (!stale) setMdFiles([]); });
    return () => { stale = true; };
  }, [folderPath]);

  // Fetch git status overlay (separate from file listing)
  useEffect(() => {
    let stale = false;
    if (!repoPath) {
      // Clear via microtask to avoid synchronous setState in effect
      Promise.resolve().then(() => { if (!stale) setGitStatusMap(new Map()); });
      return () => { stale = true; };
    }
    invoke<GitEntry[]>('git_repo_tree', { repoPath })
      .then((gitEntries) => {
        if (stale) return;
        const statusMap = new Map<string, string>();
        for (const entry of gitEntries) {
          if (entry.status !== 'clean') {
            statusMap.set(entry.path, entry.status);
          }
        }
        setGitStatusMap(statusMap);
      })
      .catch(() => { if (!stale) setGitStatusMap(new Map()); });
    return () => { stale = true; };
  }, [repoPath]);

  const tree = useMemo(() => buildTree(mdFiles, gitStatusMap), [mdFiles, gitStatusMap]);

  const firstFilePath = useMemo(() => {
    const findFirst = (nodes: TreeNode[]): string | null => {
      for (const n of nodes) {
        if (!n.isDir) {
          const base = (folderPath ?? '').endsWith('/') ? folderPath ?? '' : `${folderPath ?? ''}/`;
          return `${base}${n.fullPath}`;
        }
        const found = findFirst(n.children);
        if (found) return found;
      }
      return null;
    };
    return findFirst(tree);
  }, [tree, folderPath]);

  if (!visible) return null;

  return (
    <nav className="sidebar" style={style} aria-label="File explorer">
      <div className="sidebar-header">{folderPath ? folderPath.split('/').filter(Boolean).pop() : 'Files'}</div>
      <div className="file-tree" role="tree" aria-label="Files">
        {tree.length === 0 && !folderPath && (
          <div style={{ padding: '0.75em', color: 'var(--text-muted)' }}>
            Open a folder with {'\u2318'}Shift+O
          </div>
        )}
        {tree
          .map((node) => (
            <TreeItem
              key={node.fullPath}
              node={node}
              depth={0}
              currentFile={currentFile}
              rootPath={folderPath ?? ''}
              onFileSelect={onFileSelect}
              firstFilePath={firstFilePath}
            />
          ))}
      </div>
    </nav>
  );
}
