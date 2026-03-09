# mpad

A desktop Markdown editor built with Tauri, React, and Rust. WYSIWYG editing powered by TipTap, with built-in git integration and a warm editorial aesthetic.

![MIT License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **WYSIWYG editing** — TipTap-based with slash commands, bubble menu, heading cycling
- **Git integration** — status overlay, inline diff, commit log
- **Command palette** — unified `Cmd+K` for files and commands with fuzzy matching
- **File sidebar** — recursive markdown tree with git status indicators
- **Find & replace** — in-editor search with highlighting
- **Code highlighting** — syntax highlighting via lowlight
- **Keyboard-driven** — extensive shortcuts, no mouse required
- **Agent-friendly** — ships with Claude Code / Cursor skills for QA, code review, and React best practices

## Install

### Build from source

Requires [Bun](https://bun.sh) and [Rust](https://rustup.rs).

```bash
bun install
bunx tauri build
```

### macOS

```bash
cp -r src-tauri/target/release/bundle/macos/mpad.app /Applications/
```

Optional CLI wrapper:

```bash
ln -sf "$(pwd)/scripts/mpad" /usr/local/bin/mpad
```

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Cmd+K` | Command palette (files + commands) |
| `Cmd+S` | Save |
| `Cmd+O` | Open file |
| `Cmd+/` | Toggle source view |
| `Cmd+D` | Toggle diff |
| `Cmd+B` | Toggle sidebar |
| `Cmd+L` | Git log |
| `Cmd+Shift+Up/Down` | Cycle heading level |
| `/` | Slash commands (on empty line) |

## Development

```bash
bun install
bun run dev           # Start dev server + Tauri
bun run check         # TypeScript + ESLint
bun run test          # Vitest
bun run check:rust    # cargo check + cargo test
bun run check:all     # All checks
```

## Tech stack

- **Runtime**: Tauri v2 (Rust + React/TypeScript/Vite)
- **Editor**: TipTap + tiptap-markdown + CodeBlockLowlight
- **Git**: git2 crate with vendored libgit2
- **Package manager**: Bun
- **Theme**: Warm editorial — terracotta `#c4603c`, Source Serif 4, DM Sans, JetBrains Mono
