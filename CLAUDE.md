# mdview

Tauri v2 desktop Markdown viewer/editor. WYSIWYG editing with TipTap, git-aware, optimized for agent skills files.

## Tech Stack

- **Runtime**: Tauri v2 (Rust backend + React/TypeScript/Vite frontend)
- **Package manager**: Bun
- **Editor**: TipTap + tiptap-markdown + CodeBlockLowlight (lowlight/common)
- **Git**: git2 crate with `vendored-libgit2` feature
- **Theme**: Warm editorial — terracotta `#c4603c`, Source Serif 4, DM Sans, JetBrains Mono

## Architecture

- **File I/O**: Custom Rust `read_file`/`write_file` commands — do NOT use Tauri FS plugin (scope issues with absolute paths)
- **CLI args**: `InitialFileState` managed state in Rust, fetched by frontend via `get_initial_file` command (avoids event race condition)
- **File watcher**: Content-based comparison against current editor state — do NOT use timestamp-based detection (causes false positives)
- **Frontmatter**: Strict regex `/^---\n([\s\S]*?)\n---(?:\n|$)/` — do NOT use gray-matter (breaks on lone `---`)
- **Editor storage**: Cast through `unknown` — `(ed.storage as unknown as Record<...>)` required for `tsc -b`
- **BubbleMenu**: Import from `@tiptap/react/menus`, NOT `@tiptap/react`
- **Code splitting**: `@tiptap/pm` cannot be in vite `manualChunks` (no main export)

## Build & Install

```bash
bun run check          # TypeScript + ESLint
bun run check:rust     # cargo check + cargo test (18 git tests)
bunx tauri build       # Full release build

# Install
cp -r src-tauri/target/release/bundle/macos/mdview.app /Applications/
ln -sf scripts/mdview /usr/local/bin/mdview
```

CLI wrapper uses `open -a "$TARGET" --args "$FILE_ARG"` — must use `--args`, not positional.

## Key Files

| File | Purpose |
|------|---------|
| `src/components/Editor.tsx` | TipTap editor, bubble menu, slash commands, heading cycle |
| `src/components/QuickOpen.tsx` | Cmd+P fuzzy file finder |
| `src/extensions/gfm.ts` | Table, TaskList, Link extensions |
| `src/extensions/LinkResolver.ts` | Click handler for .md links (new window) and URLs (system) |
| `src/hooks/useFileWatcher.ts` | Content-based external change detection |
| `src/hooks/useFileOperations.ts` | Read/write via Rust commands, debounced save |
| `src-tauri/src/git.rs` | git2 operations: status, diff, log, repo tree |
| `src-tauri/src/commands.rs` | Tauri command wrappers |
| `src-tauri/src/lib.rs` | App setup, plugins, InitialFileState |

## Shortcuts

`Cmd+S` save, `Cmd+O` open, `Cmd+P` quick open, `Cmd+/` source toggle, `Cmd+D` diff, `Cmd+B` sidebar, `Cmd+L` git log, `Cmd+Shift+Up/Down` heading cycle, `/` on empty line for slash commands

## Gotchas

- React 19: refs must update in `useEffect`, not during render
- git2 feature name is `vendored-libgit2` (not `vendored`)
- Pre-commit hook at `.hooks/pre-commit` runs tsc, eslint, cargo check, cargo test
