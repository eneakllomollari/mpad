import { describe, it, expect } from 'vitest';
import { filterItems } from '../src/lib/fuzzyMatch';
import type { PaletteCommand } from '../src/lib/fuzzyMatch';

const commands: PaletteCommand[] = [
  { id: 'save', label: 'Save', shortcut: '⌘S', action: () => {} },
  { id: 'open', label: 'Open File', shortcut: '⌘O', action: () => {} },
  { id: 'source', label: 'Toggle Source', shortcut: '⌘/', action: () => {} },
];

const bigFiles: string[] = [];
for (let i = 0; i < 10_000; i++) {
  bigFiles.push(`src/deeply/nested/path/component-${i}.md`);
}

describe('filterItems performance', () => {
  it('filters 10,000 files in under 5ms', () => {
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
    filterItems('cmp5', commands, bigFiles, 50);

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
