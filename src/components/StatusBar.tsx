import type { SaveStatus } from '../hooks/useFileOperations';

interface FileStatus {
  branch: string;
  status: string;
}

interface StatusBarProps {
  filePath: string | null;
  repoPath: string | null;
  fileStatus: FileStatus | null;
  saveStatus: SaveStatus;
  showSource: boolean;
}

function basename(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
}

function saveLabel(saveStatus: SaveStatus, hasFile: boolean): string {
  if (!hasFile) return '';
  switch (saveStatus) {
    case 'pending':
      return 'Unsaved changes';
    case 'saving':
      return 'Saving...';
    case 'saved':
      return 'All changes saved';
    case 'error':
      return "Couldn't save";
    case 'idle':
      return 'No changes yet';
  }
}

function gitStatusLabel(status: string): string {
  switch (status) {
    case 'clean':
      return 'Clean';
    case 'modified':
      return 'Edited';
    case 'untracked':
      return 'New file';
    case 'deleted':
      return 'Deleted';
    case 'renamed':
      return 'Renamed';
    case 'typechange':
      return 'Changed';
    default:
      return status;
  }
}

export function StatusBar({ filePath, repoPath, fileStatus, saveStatus, showSource }: StatusBarProps) {
  const hasFile = Boolean(filePath);
  const fileLabel = filePath ? basename(filePath) : 'No file selected';
  const modeLabel = showSource ? 'Markdown source' : 'Rich text';
  const repoLabel = repoPath ? basename(repoPath) : 'Local file';
  const gitLabel = fileStatus ? `${fileStatus.branch} · ${gitStatusLabel(fileStatus.status)}` : repoLabel;

  return (
    <footer className="status-bar" aria-label="Document status">
      <div className="status-bar-left">
        <span className="status-bar-filename" title={filePath ?? undefined}>{fileLabel}</span>
        {hasFile && <span>{modeLabel}</span>}
      </div>
      {hasFile && (
        <div className="status-bar-right">
          <span className={`save-status save-status--${saveStatus}`}>{saveLabel(saveStatus, hasFile)}</span>
          <span className="git-branch" title={repoPath ?? undefined}>{gitLabel}</span>
        </div>
      )}
    </footer>
  );
}
