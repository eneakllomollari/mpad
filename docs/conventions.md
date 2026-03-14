# Conventions

## TypeScript

- Strict mode: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
- Export shared logic to `src/lib/` — never export non-component functions from component files
- Use `type` imports for type-only references: `import type { Foo } from '...'`
- Error handling: `.catch()` with meaningful fallback, `console.error` for diagnostics

## React 19

- **No refs during render**: Use `useEffect` for updates, callbacks for reads
- **No setState in effects**: Use callbacks or `.then()` chains
- **react-refresh**: Don't export non-component functions from component files

## Rust

- Tauri commands return `Result<T, String>` with `.map_err(|e| e.to_string())`
- Error messages must include context: `format!("Failed to read {}: {}", path, e)`
- Use `#[serde(rename_all = "camelCase")]` for IPC structs
- Feature: `vendored-libgit2` (not `vendored`)

## Banned Imports (enforced via ESLint)

| Banned | Use instead | Why |
|---|---|---|
| `@tauri-apps/plugin-fs` read/write | `invoke('read_file')` / `invoke('write_file')` | FS plugin scope breaks on absolute paths |
| `gray-matter` | Strict regex in `contentProcessing.ts` | Breaks on lone `---` |
| `BubbleMenu` from `@tiptap/react` | `BubbleMenu` from `@tiptap/react/menus` | Correct subpath export |

## Git

- Commit messages: imperative mood, concise (`Add fuzzy match perf gate`)
- PRs must pass `bun run check:all` before merge
- Pre-commit hook runs full suite — install with `bun install` (auto-configured)

## File Organization

- Components → `src/components/`
- Hooks → `src/hooks/`
- TipTap extensions → `src/extensions/`
- Pure utilities → `src/lib/`
- Tests → `tests/`
- Rust backend → `src-tauri/src/`
