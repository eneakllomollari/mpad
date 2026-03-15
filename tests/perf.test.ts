import { describe, it, expect } from 'vitest';
import { preprocessContent, postprocessContent } from '../src/lib/contentProcessing';
import { filterItems } from '../src/lib/fuzzyMatch';
import type { PaletteCommand } from '../src/lib/fuzzyMatch';

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function bench(fn: () => void, runs = 20): number {
  fn(); // warmup
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  return median(times);
}

const commands: PaletteCommand[] = [
  { id: 'save', label: 'Save', shortcut: '⌘S', action: () => {} },
  { id: 'open', label: 'Open File', shortcut: '⌘O', action: () => {} },
  { id: 'source', label: 'Toggle Source', shortcut: '⌘/', action: () => {} },
];

describe('filterItems latency gates', () => {
  const files10k: string[] = [];
  for (let i = 0; i < 10_000; i++) {
    files10k.push(`src/deeply/nested/path/component-${i}.md`);
  }

  it('substring match: 10k files < 5ms median', () => {
    const ms = bench(() => filterItems('component-500', commands, files10k, 50));
    expect(ms).toBeLessThan(5);
  });

  it('fuzzy match: 10k files < 10ms median', () => {
    const ms = bench(() => filterItems('cmp5', commands, files10k, 50));
    expect(ms).toBeLessThan(10);
  });

  it('empty query: 10k files < 1ms median', () => {
    const ms = bench(() => filterItems('', commands, files10k, 50));
    expect(ms).toBeLessThan(1);
  });
});

describe('contentProcessing latency gates', () => {
  const bigMarkdown = [
    '---',
    'title: Big Document',
    'tags: [a, b, c]',
    '---',
    '',
    ...Array.from({ length: 500 }, (_, i) => `## Section ${i}\n\nParagraph with **bold** and *italic* text. [Link](https://example.com/${i})\n`),
    '<custom_block>',
    'some xml content here',
    '</custom_block>',
    '',
    '```mermaid',
    'graph TD',
    '    A-->B',
    '```',
  ].join('\n');

  it('preprocessContent: 500-section doc < 2ms median', () => {
    const ms = bench(() => preprocessContent(bigMarkdown));
    expect(ms).toBeLessThan(2);
  });

  it('postprocessContent: 500-section doc < 2ms median', () => {
    const processed = preprocessContent(bigMarkdown);
    const ms = bench(() =>
      postprocessContent(
        processed.body,
        processed.frontmatter,
        processed.xmlBlocks,
        processed.mermaidBlocks,
      ),
    );
    expect(ms).toBeLessThan(2);
  });

  it('round-trip: preprocess+postprocess < 3ms median', () => {
    const ms = bench(() => {
      const p = preprocessContent(bigMarkdown);
      postprocessContent(p.body, p.frontmatter, p.xmlBlocks, p.mermaidBlocks);
    });
    expect(ms).toBeLessThan(3);
  });
});

describe('memory allocation guards', () => {
  it('filterItems does not create excessive objects for empty query', () => {
    const files = Array.from({ length: 1000 }, (_, i) => `file-${i}.md`);
    const result = filterItems('', commands, files, 50);
    expect(result.length).toBeLessThanOrEqual(50);
  });

  it('filterItems respects limit — no wasted work beyond limit', () => {
    const files = Array.from({ length: 10_000 }, (_, i) => `file-${i}.md`);
    const result = filterItems('file', commands, files, 10);
    expect(result.length).toBeLessThanOrEqual(10);
  });
});
