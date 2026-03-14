# Gotchas

Hard-won lessons. Violating these will break the build or cause subtle bugs.

## TipTap / Editor

- **`@tiptap/pm`** cannot be in Vite `manualChunks` — it has no main export, Vite will error
- **BubbleMenu** must be imported from `@tiptap/react/menus`, not `@tiptap/react`
- **Editor storage** must be cast through `unknown`: `(ed.storage as unknown as Record<...>)` — required for `tsc -b` to pass
- **Diff panel** must refresh when switching files — handle in `loadFile`, not via a separate effect (avoids setState-in-effect lint)

## React 19

- **Refs**: Cannot read/write during render — use `useEffect` for updates, callbacks for reads
- **setState in effects**: Avoid calling setState synchronously in effects; use callbacks or `.then()` chains
- **react-refresh/only-export-components**: Don't export non-component functions from component files; move shared logic to `src/lib/`

## Rust / Tauri

- git2 feature name is **`vendored-libgit2`** (not `vendored`)
- **File I/O**: Use custom Rust commands, not Tauri FS plugin (scope issues with absolute paths)
- **File watcher**: Content-based comparison, not timestamp-based (timestamps cause false positives after save)
- **Frontmatter regex**: `/^---\n([\s\S]*?)\n---(?:\n|$)/` — do NOT use gray-matter (breaks on lone `---`)
- **CLI args**: Frontend fetches via `get_initial_file` command (avoids event race condition with `InitialFileState`)

## UI

- **`Cmd+B`** is reserved for bold (TipTap built-in) — do not reassign
- Sidebar auto-expands `.claude/`, `.cursor/`, `.agents/` directories by default
- CLI wrapper uses `open -a "$TARGET" --args "$FILE_ARG"` — must use `--args`, not positional
