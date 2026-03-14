# mpad — Agent Instructions

Tauri v2 desktop Markdown editor. React/TypeScript frontend + Rust backend.

## Quick Start

```bash
bun install          # install deps
bun run dev          # vite dev server (localhost:5173)
bun run check:all    # full validation suite (MUST pass before PR)
```

## Validation Suite

| Command | What it checks |
|---|---|
| `bun run typecheck` | TypeScript strict mode |
| `bun run lint` | ESLint |
| `bun run oxlint` | OxLint (deny warnings) |
| `bun run knip` | Dead code / unused exports |
| `bun run test` | Vitest (74 frontend tests) |
| `cd src-tauri && cargo check` | Rust compilation |
| `cd src-tauri && cargo test` | Rust tests (18 git tests) |

**All of the above run in CI on every PR.** Do not merge if any fail.

## Architecture (→ [docs/architecture.md](docs/architecture.md))

- **File I/O**: Use Rust commands `read_file`/`write_file` — NOT `@tauri-apps/plugin-fs`
- **File watcher**: Content-based comparison — NOT timestamp-based
- **Frontmatter**: Strict regex — NOT `gray-matter`
- **BubbleMenu**: Import from `@tiptap/react/menus` — NOT `@tiptap/react`
- **Editor storage**: Cast through `unknown` for `tsc -b`

These constraints are enforced via ESLint `no-restricted-imports`. See [docs/conventions.md](docs/conventions.md).

## Key Files (→ [docs/architecture.md](docs/architecture.md))

| File | Purpose |
|---|---|
| `src/components/Editor.tsx` | TipTap editor, bubble menu, slash commands |
| `src/components/CommandPalette.tsx` | Cmd+K palette (files + commands) |
| `src/components/Sidebar.tsx` | File tree with git status |
| `src/lib/fuzzyMatch.ts` | Fuzzy matching (tested, perf-gated) |
| `src/hooks/useFileOperations.ts` | Read/write via Rust commands |
| `src-tauri/src/git.rs` | git2 status, diff, log, tree |
| `src-tauri/src/commands.rs` | Tauri command wrappers |

## Testing (→ [docs/testing.md](docs/testing.md))

- Frontend: `bun run test` — Vitest, tests in `tests/`
- Rust: `cd src-tauri && cargo test` — 18 tests in `git.rs`
- New code MUST have tests. Performance-sensitive code needs perf gates.

## Conventions (→ [docs/conventions.md](docs/conventions.md))

- TypeScript strict mode, no unused locals/params
- React 19: no refs during render, no setState in effects
- Rust: `Result<T, String>` for Tauri commands with `.map_err()`
- Export shared logic to `src/lib/`, not from component files

## Gotchas (→ [docs/gotchas.md](docs/gotchas.md))

- `@tiptap/pm` cannot be in Vite `manualChunks` (no main export)
- git2 feature: `vendored-libgit2` (not `vendored`)
- `Cmd+B` is reserved for bold — do not reassign
- Sidebar auto-expands `.claude/`, `.cursor/`, `.agents/` dirs
