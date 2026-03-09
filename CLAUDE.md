# mpad

Tauri v2 desktop Markdown viewer/editor. WYSIWYG editing with TipTap, git-aware, optimized for agent skills files.

## Tech Stack

- **Runtime**: Tauri v2 (Rust backend + React/TypeScript/Vite frontend)
- **Package manager**: Bun
- **Editor**: TipTap + tiptap-markdown + CodeBlockLowlight (lowlight/common)
- **Git**: git2 crate with `vendored-libgit2` feature
- **Tests**: Vitest (frontend), cargo test (Rust — 18 git tests)

###### **Theme**: Warm editorial — terracotta `#c4603c`, Source Serif 4, DM Sans, JetBrains Mono

## Architecture

- **File I/O**: Custom Rust `read_file`/`write_file` commands — do NOT use Tauri FS plugin (scope issues with absolute paths)
- **CLI args**: `InitialFileState` managed state in Rust, fetched by frontend via `get_initial_file` command (avoids event race condition)
- **File watcher**: Content-based comparison against current editor state — do NOT use timestamp-based detection (causes false positives)
- **Frontmatter**: Strict regex `/^---\n([\s\S]*?)\n---(?:\n|$)/` — do NOT use gray-matter (breaks on lone `---`)
- **Editor storage**: Cast through `unknown` — `(ed.storage as unknown as Record<...>)` required for `tsc -b`
- **BubbleMenu**: Import from `@tiptap/react/menus`, NOT `@tiptap/react`
- **Code splitting**: `@tiptap/pm` cannot be in vite `manualChunks` (no main export)
- **Sidebar**: `list_markdown_files` Rust command walks filesystem recursively (includes dotdirs like `.claude/`), filtered to `.md`/`.markdown`/`.mdown` only. Skips `node_modules`, `target`, `.git`, `dist`, `build`, `__pycache__`, `.venv`, `.env`, `.pytest_cache`. Git status overlaid from `git_repo_tree`.
- **Command palette**: Unified `Cmd+K` palette combining file search and commands. Logic in `src/lib/fuzzyMatch.ts` (exported for testing). Empty query shows all commands; typing filters both files and commands. Commands rank above files (+2000 score boost).

## Build & Test

```bash
bun run check          # TypeScript + ESLint
bun run test           # Vitest (fuzzy match correctness + performance)
bun run check:rust     # cargo check + cargo test (18 git tests)
bun run check:all      # All of the above
bunx tauri build       # Full release build

# Install
cp -r src-tauri/target/release/bundle/macos/mpad.app /Applications/
ln -sf scripts/mpad /usr/local/bin/mpad
```

CLI wrapper uses `open -a "$TARGET" --args "$FILE_ARG"` — must use `--args`, not positional.

## Key Files

| File | Purpose |
| --- | --- |
| `src/components/Editor.tsx` | TipTap editor, bubble menu, slash commands, heading cycle |
| `src/components/CommandPalette.tsx` | Unified Cmd+K palette (files + commands) |
| `src/components/Sidebar.tsx` | Markdown-only file tree with git status overlay |
| `src/lib/fuzzyMatch.ts` | Fuzzy matching + filterItems logic (tested, perf-gated) |
| `src/extensions/gfm.ts` | Table, TaskList, Link extensions |
| `src/extensions/LinkResolver.ts` | Click handler for .md links (new window) and URLs (system) |
| `src/hooks/useFileWatcher.ts` | Content-based external change detection |
| `src/hooks/useFileOperations.ts` | Read/write via Rust commands, debounced save |
| `src/hooks/useKeyboardShortcuts.ts` | Global keyboard shortcut handler |
| `src-tauri/src/git.rs` | git2 operations: status, diff, log, repo tree |
| `src-tauri/src/commands.rs` | Tauri command wrappers (includes `list_markdown_files`) |
| `src-tauri/src/lib.rs` | App setup, plugins, InitialFileState |

## Shortcuts

`Cmd+K` command palette (files + commands), `Cmd+S` save, `Cmd+O` open, `Cmd+/` source toggle, `Cmd+D` diff, `Cmd+B` sidebar, `Cmd+L` git log, `Cmd+Shift+Up/Down` heading cycle, `/` on empty line for slash commands

## Gotchas

- React 19: refs cannot be read/written during render — use `useEffect` for updates, callbacks for reads
- React 19: `set-state-in-effect` lint rule — avoid calling setState synchronously in effects; use callbacks or fetch in `.then()` chains instead
- React 19: `react-refresh/only-export-components` — don't export non-component functions from component files; extract shared logic to `src/lib/`
- git2 feature name is `vendored-libgit2` (not `vendored`)
- Pre-commit hook at `.hooks/pre-commit` runs tsc, eslint, cargo check, cargo test
- Diff panel must refresh when switching files — handle in `loadFile`, not via a separate effect (avoids setState-in-effect lint)
- Sidebar auto-expands `.claude/`, `.cursor/`, `.agents/` directories by default
