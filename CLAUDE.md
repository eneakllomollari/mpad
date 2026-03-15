# mpad

Tauri v2 desktop Markdown viewer/editor. WYSIWYG editing with TipTap, git-aware, optimized for agent skills files.

> `AGENTS.md` is a symlink to this file. One source of truth for all agent systems.

## Tech Stack

- **Runtime**: Tauri v2 (Rust backend + React/TypeScript/Vite frontend)
- **Package manager**: Bun
- **Editor**: TipTap + tiptap-markdown + CodeBlockLowlight (lowlight/common)
- **Git**: git2 crate with `vendored-libgit2` feature
- **Tests**: Vitest (frontend), cargo test (Rust — 18 git tests)

###### **Theme**: Warm editorial — terracotta `#c4603c`, Source Serif 4, DM Sans, JetBrains Mono

## Build & Test

```bash
bun run check          # TypeScript + ESLint + OxLint + Knip
bun run test           # Vitest (correctness tests)
bun run test:coverage  # Vitest + coverage thresholds
bun run test:perf      # Performance gates (latency budgets)
bun run check:rust     # cargo check + cargo test + cargo clippy
bun run check:all      # All of the above — mirrors CI exactly
bunx tauri build       # Full release build
```

`bun run check:all` is the single command that mirrors CI. If it passes locally, CI will pass. Do NOT merge if any check fails.

CLI wrapper uses `open -a "$TARGET" --args "$FILE_ARG"` — must use `--args`, not positional.

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

These constraints are mechanically enforced — see `eslint.config.js` `no-restricted-imports` and `tests/` perf gates. Run `bun run check:all` to verify.

## How to Learn the Codebase (for agents)

Do NOT rely on static documentation — it goes stale. Instead, discover conventions from the code itself:

1. **Lint rules are law**: `eslint.config.js` has `no-restricted-imports` that ban dangerous patterns (FS plugin direct read/write, gray-matter, wrong BubbleMenu import). Violating these fails CI. Read the rule messages for rationale.
2. **Tests are specs**: `tests/` contains the source-of-truth behavioral contracts. Read test files before modifying any module — they document expected behavior better than prose.
3. **Perf gates are enforced**: `tests/fuzzyMatch.test.ts` has median-latency gates. `tests/perf.test.ts` enforces bundle/import budgets. New perf-sensitive code must have perf gates.
4. **Pre-commit runs everything**: `.hooks/pre-commit` is the canonical check sequence. Auto-installed via `bun install` (`prepare` script).
5. **CI is the gatekeeper**: `.github/workflows/ci.yml` — if it's not checked in CI, it's not enforced. Read this file to understand what gates exist.
6. **Rust tests tell the git story**: `src-tauri/src/git.rs` `#[cfg(test)]` module — 18 tests covering all git operations with temp repos.

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

`Cmd+K` command palette (files + commands), `Cmd+S` save, `Cmd+O` open, `Cmd+F` find, `Cmd+/` source toggle, `Cmd+D` diff, `Cmd+\` sidebar, `Cmd+L` git log, `Cmd+Shift+Up/Down` heading cycle, `/` on empty line for slash commands. `Cmd+B` is reserved for bold (TipTap built-in) — do NOT reassign it.

## Gotchas

- React 19: refs cannot be read/written during render — use `useEffect` for updates, callbacks for reads
- React 19: `set-state-in-effect` lint rule — avoid calling setState synchronously in effects; use callbacks or fetch in `.then()` chains instead
- React 19: `react-refresh/only-export-components` — don't export non-component functions from component files; extract shared logic to `src/lib/`
- git2 feature name is `vendored-libgit2` (not `vendored`)
- Pre-commit hook at `.hooks/pre-commit` mirrors CI (tsc, eslint, oxlint, knip, vitest, cargo check/test/clippy) — auto-installed via `bun install`
- Diff panel must refresh when switching files — handle in `loadFile`, not via a separate effect (avoids setState-in-effect lint)
- Sidebar auto-expands `.claude/`, `.cursor/`, `.agents/` directories by default

## Performance Rules

All perf-sensitive code must have mechanical enforcement. See `tests/perf.test.ts` for active gates:

- **Fuzzy match**: substring < 5ms, fuzzy < 10ms, empty < 1ms (10k files)
- **Content processing**: preprocess < 2ms, postprocess < 2ms, round-trip < 3ms (500-section doc)
- **Memory**: filterItems respects limit — no wasted allocation beyond requested count
- ESLint bans `.forEach()` in `src/` (closure allocation), lodash/moment/ramda (bundle bloat)
- Clippy enforces `clippy::perf`, `large_enum_variant`, `needless_collect`
- New perf-sensitive functions: add a benchmark gate in `tests/perf.test.ts`
