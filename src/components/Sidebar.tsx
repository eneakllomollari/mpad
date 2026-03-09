import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface SidebarProps {
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

function TreeItem({
  node,
  depth,
  currentFile,
  rootPath,
  onFileSelect,
}: {
  node: TreeNode;
  depth: number;
  currentFile: string | null;
  rootPath: string;
  onFileSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(() => {
    if (depth < 1) return true;
    // Auto-expand agent/skill directories
    const root = node.fullPath.split('/')[0];
    return root === '.claude' || root === '.cursor' || root === '.agents';
  });
  const paddingLeft = `${0.75 + depth * 0.75}em`;

  if (node.isDir) {
    return (
      <>
        <div
          className="tree-item tree-dir"
          style={{ paddingLeft }}
          onClick={() => setExpanded(!expanded)}
        >
          <span className="tree-dir-toggle">{expanded ? '\u25BE' : '\u25B8'}</span>
          {node.name}
        </div>
        {expanded &&
          node.children
            .map((child) => (
              <TreeItem
                key={child.fullPath}
                node={child}
                depth={depth + 1}
                currentFile={currentFile}
                rootPath={rootPath}
                onFileSelect={onFileSelect}
              />
            ))}
      </>
    );
  }

  const base = rootPath.endsWith('/') ? rootPath : `${rootPath}/`;
  const absolutePath = `${base}${node.fullPath}`;
  const isActive = currentFile === absolutePath;
  const dotColor = statusColor(node.status);

  return (
    <div
      className={`tree-item ${isActive ? 'active' : ''}`}
      style={{ paddingLeft }}
      onClick={() => onFileSelect(absolutePath)}
    >
      {dotColor && (
        <span
          className="status-dot"
          style={{ background: dotColor }}
        />
      )}
      {node.name}
    </div>
  );
}

export function Sidebar({
  repoPath,
  currentFile,
  onFileSelect,
  visible,
  style,
}: SidebarProps) {
  const [mdFiles, setMdFiles] = useState<string[]>([]);
  const [gitStatusMap, setGitStatusMap] = useState(() => new Map<string, string>());

  useEffect(() => {
    if (!repoPath) return;

    let stale = false;

    // Fetch markdown files and git status in parallel
    const mdPromise = invoke<string[]>('list_markdown_files', { root: repoPath });
    const gitPromise = invoke<GitEntry[]>('git_repo_tree', { repoPath }).catch(() => [] as GitEntry[]);

    Promise.all([mdPromise, gitPromise]).then(([files, gitEntries]) => {
      if (stale) return;
      setMdFiles(files);

      const statusMap = new Map<string, string>();
      for (const entry of gitEntries) {
        if (entry.status !== 'clean') {
          statusMap.set(entry.path, entry.status);
        }
      }
      setGitStatusMap(statusMap);
    }).catch(() => {
      if (!stale) {
        setMdFiles([]);
        setGitStatusMap(new Map());
      }
    });

    return () => { stale = true; };
  }, [repoPath]);

  const tree = useMemo(() => buildTree(mdFiles, gitStatusMap), [mdFiles, gitStatusMap]);

  if (!visible) return null;

  return (
    <div className="sidebar" style={style}>
      <div className="sidebar-header">{repoPath ? repoPath.split('/').filter(Boolean).pop() : 'Files'}</div>
      <div className="file-tree">
        {tree.length === 0 && !repoPath && (
          <div style={{ padding: '0.75em', color: 'var(--text-muted)' }}>
            No repo loaded
          </div>
        )}
        {tree
          .map((node) => (
            <TreeItem
              key={node.fullPath}
              node={node}
              depth={0}
              currentFile={currentFile}
              rootPath={repoPath ?? ''}
              onFileSelect={onFileSelect}
            />
          ))}
      </div>
    </div>
  );
}
