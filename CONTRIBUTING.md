# Contributing

Thanks for your interest in contributing to mpad.

## Getting started

1. Fork and clone the repo
2. Install dependencies: `bun install`
3. Start dev server: `bun run dev`

## Before submitting a PR

Run the full check suite:

```bash
bun run check:all
```

This runs TypeScript type-checking, ESLint, and Rust checks + tests.

## Code style

- TypeScript/React for the frontend, Rust for the backend
- Keep changes minimal and focused
- Don't add features or refactors beyond what's needed for your change
- File I/O goes through the Rust commands (`read_file`/`write_file`), not the Tauri FS plugin

## Project structure

| Directory | Purpose |
| --- | --- |
| `src/` | React frontend |
| `src/components/` | UI components |
| `src/hooks/` | Custom React hooks |
| `src/extensions/` | TipTap extensions |
| `src/lib/` | Shared utilities |
| `src-tauri/src/` | Rust backend |
| `.claude/skills/` | Agent skills (Claude Code / Cursor) |

## Reporting issues

Open an issue with steps to reproduce. Screenshots help for UI bugs.
