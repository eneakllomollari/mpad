# Harness Engineering Readiness Assessment

Assessment of `mpad` against the [OpenAI harness engineering](https://openai.com/index/harness-engineering/) framework — the discipline of designing environments, constraints, and feedback loops that enable AI coding agents to work reliably.

## Scoring (Minimum Viable Harness Checklist)

| Dimension | Status | Score |
|---|---|---|
| **1. Small AGENTS.md entrypoint** | Missing — CLAUDE.md exists but no universal `AGENTS.md` | 2/10 |
| **2. Progressive disclosure / docs directory** | No `docs/` directory; architecture knowledge lives only in CLAUDE.md | 2/10 |
| **3. Mechanical invariants in CI** | CI only builds + releases; no test/lint/typecheck jobs | 1/10 |
| **4. Evaluation gates** | Pre-commit hook exists locally but is not enforced in CI or PRs | 3/10 |
| **5. Safety rails** | Rolling `latest` tag; no versioned releases; FS commands bypass scope | 3/10 |
| **6. Agent legibility hooks** | `console.error`/`eprintln!` only; no structured logging or tracing | 2/10 |
| **7. Reproducible dev environment** | `bun install` works; no devcontainer/Dockerfile for agent sandboxes | 3/10 |
| **8. Test coverage & observability** | 74 Vitest + 18 cargo tests; no coverage reporting or thresholds | 4/10 |
| **9. Architecture boundary enforcement** | Gotchas documented but not mechanically enforced via linters/tests | 3/10 |
| **10. Continuous entropy reduction** | Knip + ESLint + OxLint — decent but no automated enforcement in CI | 5/10 |

**Overall: 2.8/10** — The codebase is well-structured and has good local tooling, but almost none of it is mechanically enforced in CI. An agent can merge broken code today.

---

## What's Already Good

- Clean separation: Rust backend, React/TS frontend, clear module boundaries
- 7 Vitest test files (74 tests) + 18 Rust unit tests — all passing
- Pre-commit hook runs full suite (tsc, ESLint, OxLint, Knip, Vitest, cargo check, cargo test)
- CLAUDE.md has solid architecture documentation with explicit anti-patterns ("do NOT use...")
- Strict TypeScript (`strict`, `noUnusedLocals`, `noUnusedParameters`)
- Multiple lint layers (ESLint + OxLint + Knip)
- Performance-gated tests (fuzzyMatch median < 5ms)

---

## Prioritised Task List

### P0 — Critical (agent cannot self-validate without these)

#### 1. Create `AGENTS.md` as universal agent entrypoint
**Why**: Harness engineering requires a ~100-line table of contents that all agent systems (Codex, Cursor, Claude Code, Copilot Workspace) can consume. CLAUDE.md is vendor-specific and too monolithic.

**Tasks**:
- Create `AGENTS.md` (~80-100 lines) as a concise TOC
- Reference `docs/architecture.md`, `docs/testing.md`, `docs/conventions.md` for deeper context
- Move vendor-specific gotchas from CLAUDE.md into structured `docs/` files
- Keep CLAUDE.md as a thin shim that points to AGENTS.md

#### 2. Add CI test/lint/typecheck workflow
**Why**: The single most important harness engineering principle — mechanical invariants must run in CI, not just locally. Today, an agent can push code that fails typecheck and it will be built and released.

**Tasks**:
- Create `.github/workflows/ci.yml` that runs on PRs and pushes:
  - `bun run typecheck`
  - `bun run lint`
  - `bun run oxlint`
  - `bun run knip`
  - `bun run test`
  - `cargo check && cargo test` (in src-tauri)
- Make release workflow depend on CI passing
- Add branch protection rules requiring CI to pass before merge

#### 3. Create `docs/` directory with progressive disclosure
**Why**: Agents need structured, layered documentation. A monolithic CLAUDE.md causes context overload and crowds out task-specific information.

**Tasks**:
- `docs/architecture.md` — layer diagram, data flow, module boundaries
- `docs/testing.md` — how to run tests, how to add tests, coverage expectations
- `docs/conventions.md` — coding standards, naming, error handling patterns
- `docs/gotchas.md` — the current "Gotchas" section from CLAUDE.md, expanded

---

### P1 — High (agents can work but produce lower-quality output)

#### 4. Add test coverage reporting with thresholds
**Why**: Agents need a mechanical signal that their changes maintain or improve test coverage. Without coverage gates, agents can add untested code.

**Tasks**:
- Add `@vitest/coverage-v8` for frontend coverage
- Add `cargo-tarpaulin` or `cargo-llvm-cov` for Rust coverage
- Set minimum coverage thresholds (e.g., 60% lines for new code)
- Report coverage in CI (comment on PRs)

#### 5. Add architectural boundary lint rules
**Why**: CLAUDE.md documents "do NOT use Tauri FS plugin" and "do NOT use gray-matter", but agents will violate these unless mechanically enforced.

**Tasks**:
- Add ESLint `no-restricted-imports` rules:
  - Ban `@tauri-apps/plugin-fs` direct read/write imports (enforce Rust command usage)
  - Ban `gray-matter` import
  - Ban `@tiptap/react` BubbleMenu import (must use `@tiptap/react/menus`)
- Add a structural test that scans for these violations
- Consider a custom ESLint rule or an `eslint-plugin-local` approach

#### 6. Add PR template with evaluation checklist
**Why**: Evaluation gates need clear "done" criteria that agents can interpret and self-check against.

**Tasks**:
- Create `.github/PULL_REQUEST_TEMPLATE.md` with:
  - [ ] `bun run check:all` passes
  - [ ] New functionality has tests
  - [ ] No new lint warnings
  - [ ] Architecture constraints respected (see docs/conventions.md)
  - [ ] AGENTS.md / docs updated if behavior changed

#### 7. Reproducible dev environment (devcontainer)
**Why**: Agent sandboxes need one-command boot and per-worktree isolation. Currently requires manual Bun + Rust + system deps setup.

**Tasks**:
- Create `.devcontainer/devcontainer.json` with:
  - Bun, Rust toolchain, system deps for Tauri (webkit2gtk, etc.)
  - Post-create: `bun install`
- Create `Dockerfile` or use `mcr.microsoft.com/devcontainers/rust` base
- Document in AGENTS.md: "Run `devcontainer up` for full environment"

---

### P2 — Medium (improves agent autonomy and self-healing)

#### 8. Add structured logging for agent self-validation
**Why**: Agents need queryable logs to self-validate their work. `console.error` is invisible to agents in CI.

**Tasks**:
- Frontend: Add a lightweight structured logger (tagged messages, severity levels)
- Rust: Add `tracing` crate with `tracing-subscriber` for structured output
- Ensure error paths produce actionable messages agents can parse

#### 9. Add versioned releases with rollback capability
**Why**: Safety rails require fast detection + cheap rollback. The current rolling `latest` tag has no rollback path.

**Tasks**:
- Implement semantic versioning or date-based tags
- Keep last N releases for rollback
- Add `scripts/rollback.sh` that installs a specific version
- Tag releases in CI based on version in `package.json` or `Cargo.toml`

#### 10. Add snapshot / visual regression tests
**Why**: For a GUI app, agents cannot self-validate UI changes without visual baselines.

**Tasks**:
- Add Playwright or similar for headless Tauri testing
- Create baseline screenshots for key views (editor, sidebar, diff, command palette)
- Run visual regression in CI
- Note: Tauri's `tauri-driver` supports WebDriver for E2E

#### 11. Enforce pre-commit hook installation
**Why**: The pre-commit hook in `.hooks/` is optional and easily skipped. Agents running locally won't benefit from it.

**Tasks**:
- Add `prepare` script in package.json: `git config core.hooksPath .hooks`
- Or adopt `husky` / `lefthook` for automatic hook management
- Document in AGENTS.md

---

### P3 — Low (polish and advanced harness features)

#### 12. Add dependency update automation
**Why**: Continuous entropy reduction includes keeping deps current to prevent drift.

**Tasks**:
- Add Dependabot or Renovate config
- Set automerge for patch updates with passing CI

#### 13. Add architecture decision records (ADRs)
**Why**: Agents benefit from understanding _why_ decisions were made, not just what to do.

**Tasks**:
- Create `docs/decisions/` with ADRs for key choices:
  - Why custom Rust file I/O over Tauri FS plugin
  - Why content-based file watching over timestamps
  - Why strict frontmatter regex over gray-matter

#### 14. Add code ownership / CODEOWNERS
**Why**: Helps agents understand which areas are sensitive and who to tag for review.

**Tasks**:
- Create `.github/CODEOWNERS`
- Map `src-tauri/` → Rust reviewers, `src/` → frontend reviewers

#### 15. Add integration test harness for Tauri commands
**Why**: Current Rust tests only cover git operations. Tauri commands (read_file, write_file, list_markdown_files) have no tests.

**Tasks**:
- Add integration tests for `commands.rs` functions
- Test edge cases: non-existent files, permission errors, large files, Unicode paths

---

## Recommended Implementation Order

```
Week 1:  #2 (CI workflow)  →  #1 (AGENTS.md)  →  #3 (docs/)
Week 2:  #5 (lint rules)   →  #6 (PR template) →  #4 (coverage)
Week 3:  #7 (devcontainer)  →  #11 (hooks)      →  #8 (logging)
Week 4:  #9 (versioning)   →  #15 (integration) →  #10 (visual)
Ongoing: #12 (deps), #13 (ADRs), #14 (CODEOWNERS)
```

## Key Insight

The repo's biggest gap is the **CI/mechanical enforcement** layer. All the right local tooling exists (tsc, ESLint, OxLint, Knip, Vitest, cargo test) and all checks pass — but none of it runs in CI. This means an agent can currently push code that fails any of these checks and it will be automatically built and released. Closing this single gap (task #2) would move the harness readiness score from ~3/10 to ~5/10 overnight.
