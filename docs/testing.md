# Testing

## Running Tests

```bash
bun run test          # Vitest (frontend)
bun run check:rust    # cargo check + cargo test (backend)
bun run check:all     # Full suite: typecheck + lint + test + rust
```

## Frontend Tests (Vitest)

Tests live in `tests/` at the project root.

| File | Scope |
|---|---|
| `fuzzyMatch.test.ts` | Fuzzy matching correctness + performance (<5ms median gate) |
| `contentProcessing.test.ts` | Frontmatter parsing, content transforms |
| `editor.test.ts` | Editor initialization, state management (jsdom) |
| `edgeCase.test.ts` | Edge cases across components (jsdom) |
| `fileOperations.test.ts` | Save debounce, timer behavior |
| `linkResolver.test.ts` | Heading slug generation, path resolution |
| `taskList.test.ts` | GFM task list rendering (jsdom) |

### Writing Frontend Tests

- Place tests in `tests/<module>.test.ts`
- For DOM tests: add `// @vitest-environment jsdom` at top of file
- Pure logic tests don't need jsdom
- Performance-sensitive code: add a perf gate (see fuzzyMatch.test.ts for example)
- Mock Tauri APIs with `vi.mock('@tauri-apps/api/...')`

## Rust Tests (cargo test)

18 unit tests in `src-tauri/src/git.rs` covering:

- `find_repo`: repo discovery, non-repo paths, nonexistent paths
- `file_status`: clean, modified, new, invalid repo
- `repo_tree`: entry listing, committed file presence
- `format_epoch_iso8601`: UTC, positive/negative offsets, epoch
- `days_to_date`: known date conversion

### Writing Rust Tests

- Add `#[cfg(test)] mod tests` in the relevant module
- Use `make_temp_repo()` / `cleanup_temp_repo()` helpers for git tests
- Test error paths, not just happy paths

## What Needs Tests

- All new public functions/components
- Bug fixes (add a regression test reproducing the bug)
- Performance-sensitive paths (add perf gates)
- Tauri commands in `commands.rs` (currently untested — gap)
