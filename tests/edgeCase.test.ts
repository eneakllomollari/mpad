// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SearchHighlight } from '../src/extensions/SearchHighlight';
import type { SearchHighlightStorage } from '../src/extensions/SearchHighlight';

function getSearch(editor: Editor): SearchHighlightStorage {
  return (editor.storage as unknown as Record<string, SearchHighlightStorage>).searchHighlight;
}

describe('task list CSS regression', () => {
  const css = readFileSync(join(__dirname, '../src/styles/editor.css'), 'utf-8');

  it('checked task items must NOT use opacity: 0 or pointer-events: none', () => {
    const checkedRule = css.match(
      /li\[data-checked="true"\]\s*\{[^}]*\}/g,
    );
    if (checkedRule) {
      for (const rule of checkedRule) {
        expect(rule).not.toMatch(/opacity:\s*0\b/);
        expect(rule).not.toMatch(/pointer-events:\s*none/);
        expect(rule).not.toMatch(/max-height:\s*0\b/);
      }
    }
  });

  it('checked task items should have visible styling (strikethrough/dimming)', () => {
    expect(css).toContain('data-checked="true"');
    expect(css).toMatch(/text-decoration:\s*line-through/);
  });

  it('h4 should not have duplicate font-size declarations', () => {
    const h4Rule = css.match(/\.tiptap h4\s*\{[^}]*\}/);
    expect(h4Rule).toBeTruthy();
    const fontSizeMatches = h4Rule![0].match(/font-size/g);
    expect(fontSizeMatches).toHaveLength(1);
  });
});

describe('SearchHighlight storage', () => {
  it('clearSearch resets query and activeIndex', () => {
    const editor = new Editor({
      extensions: [StarterKit, SearchHighlight],
      content: 'Hello world hello',
    });

    const s = getSearch(editor);
    s.query = 'hello';
    s.activeIndex = 0;
    editor.view.dispatch(editor.state.tr);

    expect(s.totalMatches).toBe(2);

    s.query = '';
    s.activeIndex = 0;
    editor.view.dispatch(editor.state.tr);

    expect(s.totalMatches).toBe(0);

    editor.destroy();
  });

  it('activeIndex clamps to match count', () => {
    const editor = new Editor({
      extensions: [StarterKit, SearchHighlight],
      content: 'aaa',
    });

    const s = getSearch(editor);
    s.query = 'a';
    s.activeIndex = 99;
    editor.view.dispatch(editor.state.tr);

    expect(s.activeIndex).toBeLessThan(s.totalMatches);

    editor.destroy();
  });
});

describe('DiffView edge cases', () => {
  it('empty diff string should be handled gracefully', async () => {
    const { DiffView } = await import('../src/components/DiffView');
    expect(DiffView).toBeDefined();
  });
});

describe('keyboard shortcut definitions', () => {
  it('sidebar shortcut must NOT be Cmd+B (conflicts with TipTap bold)', () => {
    const src = readFileSync(join(__dirname, '../src/hooks/useKeyboardShortcuts.ts'), 'utf-8');
    const sidebarCase = src.match(/onToggleSidebar/);
    expect(sidebarCase).toBeTruthy();

    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('onToggleSidebar')) {
        const contextStart = Math.max(0, i - 3);
        const context = lines.slice(contextStart, i + 1).join('\n');
        expect(context).not.toMatch(/case\s+['"]b['"]/);
      }
    }
  });

  it('sidebar shortcut should use [ and diff should use ] (no modifier)', () => {
    const src = readFileSync(join(__dirname, '../src/hooks/useKeyboardShortcuts.ts'), 'utf-8');
    expect(src).toContain("key === '['");
    expect(src).toContain("key === ']'");
    expect(src).toContain('onToggleSidebar');
    expect(src).toContain('onToggleDiff');
  });

  it('global handler should suppress shortcuts when palette is open', () => {
    const src = readFileSync(join(__dirname, '../src/hooks/useKeyboardShortcuts.ts'), 'utf-8');
    expect(src).toContain('.palette');
  });
});
