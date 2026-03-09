import { describe, it, expect } from 'vitest';
import { fuzzyMatch, filterItems } from './fuzzyMatch';
import type { PaletteCommand } from './fuzzyMatch';

// --- fuzzyMatch ---

describe('fuzzyMatch', () => {
  it('matches exact substring', () => {
    const r = fuzzyMatch('save', 'Toggle Save');
    expect(r.match).toBe(true);
    expect(r.score).toBeGreaterThan(0);
  });

  it('matches fuzzy characters', () => {
    const r = fuzzyMatch('clmd', '.claude/CLAUDE.md');
    expect(r.match).toBe(true);
  });

  it('does not match when chars missing', () => {
    const r = fuzzyMatch('xyz', 'CLAUDE.md');
    expect(r.match).toBe(false);
  });

  it('scores filename matches higher than path matches', () => {
    const filename = fuzzyMatch('README', 'README.md');
    const deep = fuzzyMatch('README', '.claude/deep/README.md');
    expect(filename.score).toBeGreaterThan(deep.score);
  });

  it('scores consecutive matches higher', () => {
    const consecutive = fuzzyMatch('abc', 'abc_xyz');
    const scattered = fuzzyMatch('abc', 'a_b_c_xyz');
    expect(consecutive.score).toBeGreaterThan(scattered.score);
  });
});

// --- filterItems ---

const commands: PaletteCommand[] = [
  { id: 'save', label: 'Save', shortcut: '⌘S', action: () => {} },
  { id: 'open', label: 'Open File', shortcut: '⌘O', action: () => {} },
  { id: 'source', label: 'Toggle Source', shortcut: '⌘/', action: () => {} },
  { id: 'diff', label: 'Toggle Diff', shortcut: '⌘D', action: () => {} },
  { id: 'sidebar', label: 'Toggle Sidebar', shortcut: '⌘B', action: () => {} },
  { id: 'gitlog', label: 'Toggle Git Log', shortcut: '⌘L', action: () => {} },
];

const files = [
  'README.md',
  'CLAUDE.md',
  '.claude/CLAUDE.md',
  '.claude/skills/brainstorming.md',
  '.claude/skills/debugging.md',
  'docs/guide.md',
  'docs/api.md',
];

describe('filterItems', () => {
  it('returns all commands for empty query', () => {
    const results = filterItems('', commands, files, 50);
    expect(results).toHaveLength(commands.length);
    expect(results.every((r) => r.type === 'command')).toBe(true);
  });

  it('returns all commands for whitespace query', () => {
    const results = filterItems('   ', commands, files, 50);
    expect(results).toHaveLength(commands.length);
    expect(results.every((r) => r.type === 'command')).toBe(true);
  });

  it('empty query commands include shortcuts as hints', () => {
    const results = filterItems('', commands, files, 50);
    const save = results.find((r) => r.id === 'save');
    expect(save).toBeDefined();
    expect(save!.hint).toBe('⌘S');
  });

  it('empty query respects limit', () => {
    const results = filterItems('', commands, files, 2);
    expect(results).toHaveLength(2);
  });

  it('matches commands', () => {
    const results = filterItems('save', commands, files, 50);
    expect(results.some((r) => r.type === 'command' && r.id === 'save')).toBe(true);
  });

  it('matches files', () => {
    const results = filterItems('claude', commands, files, 50);
    expect(results.some((r) => r.type === 'file' && r.id === 'CLAUDE.md')).toBe(true);
  });

  it('ranks commands above files', () => {
    const results = filterItems('tog', commands, files, 50);
    const firstFile = results.findIndex((r) => r.type === 'file');
    const lastCommand = results.reduce((acc, r, i) => (r.type === 'command' ? i : acc), -1);
    if (firstFile !== -1 && lastCommand !== -1) {
      expect(lastCommand).toBeLessThan(firstFile);
    }
  });

  it('respects limit', () => {
    const results = filterItems('md', commands, files, 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('returns files with correct label (filename only)', () => {
    const results = filterItems('brainstorming', commands, files, 50);
    const match = results.find((r) => r.id === '.claude/skills/brainstorming.md');
    expect(match).toBeDefined();
    expect(match!.label).toBe('brainstorming.md');
    expect(match!.hint).toBe('.claude/skills');
  });
});

// --- Performance ---

describe('filterItems performance', () => {
  const bigFiles: string[] = [];
  for (let i = 0; i < 10_000; i++) {
    bigFiles.push(`src/deeply/nested/path/component-${i}.md`);
  }

  it('filters 10,000 files in under 5ms', () => {
    // Warm up
    filterItems('component-500', commands, bigFiles, 50);

    const runs = 10;
    const times: number[] = [];

    for (let r = 0; r < runs; r++) {
      const start = performance.now();
      filterItems('component-500', commands, bigFiles, 50);
      times.push(performance.now() - start);
    }

    const median = times.sort((a, b) => a - b)[Math.floor(runs / 2)];
    expect(median).toBeLessThan(5);
  });

  it('handles fuzzy queries across 10,000 files in under 10ms', () => {
    // Fuzzy is slower than substring — allow 10ms
    filterItems('cmp5', commands, bigFiles, 50); // warm up

    const runs = 10;
    const times: number[] = [];

    for (let r = 0; r < runs; r++) {
      const start = performance.now();
      filterItems('cmp5', commands, bigFiles, 50);
      times.push(performance.now() - start);
    }

    const median = times.sort((a, b) => a - b)[Math.floor(runs / 2)];
    expect(median).toBeLessThan(10);
  });
});
