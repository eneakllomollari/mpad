# Dogfood Report: mpad

| Field | Value |
|-------|-------|
| **Date** | 2025-03-09 |
| **App** | mpad (Tauri v2 desktop Markdown editor) |
| **Scope** | Full app — editor, sidebar, command palette, shortcuts, git integration |

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 1 |
| Medium | 0 |
| Low | 0 |
| **Total open** | **1** |

*ISSUE-001, ISSUE-003 fixed in main (2025-03-09).*

## Issues

### ~~ISSUE-001: Page title says "mdview" instead of "mpad"~~ ✅ FIXED

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Status** | **Fixed** — main now has `<title>mpad</title>` |

---

### ISSUE-002: Rust build fails on Cargo 1.82 (edition2024)

| Field | Value |
|-------|-------|
| **Severity** | high |
| **Category** | functional |
| **Location** | `npm run check:rust` / `cargo build` |

**Description**

Build fails with: `feature 'edition2024' is required` (from transitive `time-core` crate). Cargo 1.82 does not support edition2024. Blocks development and CI on older Rust toolchains.

**Repro**

1. Use Rust/Cargo 1.82 (e.g. default on some Linux distros)
2. Run `npm run check:rust` or `cd src-tauri && cargo build`
3. **Observe:** Build fails parsing time-core manifest

**Output**

```
error: failed to parse manifest at `.../time-core-0.1.8/Cargo.toml`
  feature `edition2024` is required
  ... not stabilized in this version of Cargo (1.82.0)
```

---

### ~~ISSUE-003: Shortcut hint uses Mac-only ⌘ on all platforms~~ ✅ FIXED

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Status** | **Fixed** — empty state now shows "Ctrl+K" on non-Mac |

---

## Exploration Notes

- **Frontend:** Vite dev server runs; React app loads with no console errors.
- **Tests:** 55 Vitest tests pass (fuzzyMatch, taskList, Editor).
- **Tauri:** Full native app could not be launched in this environment (Rust build blocked).
- **Browser-only:** App handles missing Tauri backend gracefully — shows empty state, no JS crashes.

---

## Re-run after merge from main (2025-03-09)

| Check | Result |
|-------|--------|
| Page title | `mpad` ✅ |
| Empty state shortcut | `Ctrl+K` ✅ |
| check | Pass |
| test | 55 passed |
| check:rust | Still fails (edition2024) |
