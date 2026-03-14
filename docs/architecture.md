# Architecture

## Overview

mpad is a Tauri v2 desktop app: Rust backend for file I/O and git operations, React/TypeScript frontend for the WYSIWYG editor.

```
┌─────────────────────────────────────────────┐
│ Frontend (React + TipTap)                   │
│  src/components/  UI components             │
│  src/hooks/       React hooks (file, watch) │
│  src/extensions/  TipTap extensions         │
│  src/lib/         Pure utilities            │
├─────────────────────────────────────────────┤
│ IPC (Tauri invoke)                          │
├─────────────────────────────────────────────┤
│ Backend (Rust)                              │
│  commands.rs      Tauri command wrappers    │
│  git.rs           git2 operations           │
│  window.rs        Window management         │
│  lib.rs           App setup, plugins, state │
└─────────────────────────────────────────────┘
```

## Data Flow

1. **CLI launch**: `mpad <file>` → Rust stores path in `InitialFileState` managed state
2. **Frontend boot**: React calls `get_initial_file` command → receives path (avoids event race)
3. **File read**: `invoke('read_file', { path })` → Rust `std::fs::read_to_string`
4. **File write**: `invoke('write_file', { path, content })` → Rust `std::fs::write`
5. **File watch**: Tauri FS plugin watch → content-based diff against editor state → reload prompt
6. **Git**: Frontend calls `git_*` commands → Rust `git2` crate operations

## Module Boundaries

### Frontend (`src/`)

| Directory | Responsibility | May import from |
|---|---|---|
| `src/components/` | UI rendering, user interaction | hooks, lib, extensions |
| `src/hooks/` | State management, Tauri IPC | lib only |
| `src/extensions/` | TipTap editor extensions | lib only |
| `src/lib/` | Pure functions, zero side effects | nothing in src/ |

### Backend (`src-tauri/src/`)

| File | Responsibility |
|---|---|
| `commands.rs` | Thin wrappers; delegates to `git.rs` / `window.rs` / stdlib |
| `git.rs` | All git2 operations (status, diff, log, tree) |
| `window.rs` | Window creation and management |
| `lib.rs` | Plugin registration, state init, app setup |

## Key Design Decisions

See [decisions/](decisions/) for full ADRs. Summary:

- **Custom file I/O over Tauri FS plugin**: Plugin scope doesn't support absolute paths reliably
- **Content-based file watching**: Timestamp-based detection causes false positives on save
- **Strict frontmatter regex**: `gray-matter` library breaks on lone `---` separators
- **git2 vendored**: `vendored-libgit2` feature avoids system libgit2 version issues
