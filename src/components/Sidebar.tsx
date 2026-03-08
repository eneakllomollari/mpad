import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface SidebarProps {
  repoPath: string | null;
  currentFile: string | null;
  onFileSelect: (path: string) => void;
  visible: boolean;
}

interface FileEntry {
  path: string;
  status: string; // "clean" | "modified" | "untracked" | "deleted" | "new"
}

interface TreeNode {
  name: string;
  fullPath: string;
  isDir: boolean;
  status: string;
  children: TreeNode[];
}

function buildTree(files: FileEntry[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join('/');

      let existing = current.find((n) => n.name === name);
      if (!existing) {
        existing = {
          name,
          fullPath,
          isDir: !isLast,
          status: isLast ? file.status : '',
          children: [],
        };
        current.push(existing);
      }
      current = existing.children;
    }
  }

  return root;
}

function sortNodes(a: TreeNode, b: TreeNode): number {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  return a.name.localeCompare(b.name);
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
  repoPath,
  onFileSelect,
}: {
  node: TreeNode;
  depth: number;
  currentFile: string | null;
  repoPath: string;
  onFileSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
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
            .slice().sort(sortNodes)
            .map((child) => (
              <TreeItem
                key={child.fullPath}
                node={child}
                depth={depth + 1}
                currentFile={currentFile}
                repoPath={repoPath}
                onFileSelect={onFileSelect}
              />
            ))}
      </>
    );
  }

  const isMarkdown = /\.(md|markdown|mdown)$/i.test(node.name);
  // repoPath from git2 workdir() may already end with '/', avoid double slash
  const base = repoPath.endsWith('/') ? repoPath : `${repoPath}/`;
  const absolutePath = `${base}${node.fullPath}`;
  const isActive = currentFile === absolutePath;

  return (
    <div
      className={`tree-item ${isActive ? 'active' : ''}`}
      style={{ paddingLeft, opacity: isMarkdown ? 1 : 0.5 }}
      onClick={() => {
        if (isMarkdown) onFileSelect(absolutePath);
      }}
    >
      {node.status && (
        <span
          className="status-dot"
          style={{ background: statusColor(node.status) }}
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
}: SidebarProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);

  useEffect(() => {
    if (!repoPath) return;

    let stale = false;
    invoke<FileEntry[]>('git_repo_tree', { repoPath })
      .then((entries) => { if (!stale) setFiles(entries); })
      .catch(() => { if (!stale) setFiles([]); });

    return () => { stale = true; };
  }, [repoPath]);

  const tree = useMemo(() => buildTree(files), [files]);

  if (!visible) return null;

  return (
    <div className="sidebar">
      <div className="sidebar-header">Files</div>
      <div className="file-tree">
        {tree.length === 0 && !repoPath && (
          <div style={{ padding: '0.75em', color: 'var(--text-muted)' }}>
            No repo loaded
          </div>
        )}
        {tree
          .slice().sort(sortNodes)
          .map((node) => (
            <TreeItem
              key={node.fullPath}
              node={node}
              depth={0}
              currentFile={currentFile}
              repoPath={repoPath ?? ''}
              onFileSelect={onFileSelect}
            />
          ))}
      </div>
    </div>
  );
}
