// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor as TiptapEditor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import {
  cacheEditorSession,
  getCachedEditorSession,
  loadEditorDocument,
} from '../src/lib/editorSession';

function createEditor(content: string = '') {
  return new TiptapEditor({
    extensions: [
      StarterKit,
      Markdown.configure({
        html: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content,
  });
}

function getMarkdown(editor: TiptapEditor): string {
  return (editor.storage as unknown as Record<string, { getMarkdown: () => string }>)
    .markdown.getMarkdown();
}

describe('editor session cache', () => {
  let editor: TiptapEditor;

  afterEach(() => { editor?.destroy(); });

  it('programmatic document loads do not become undoable history', () => {
    editor = createEditor('First file');

    loadEditorDocument(editor, 'Second file');
    editor.commands.undo();

    expect(getMarkdown(editor)).toContain('Second file');
    expect(getMarkdown(editor)).not.toContain('First file');
  });

  it('restoring a cached editor state preserves undo history', () => {
    editor = createEditor('First file');
    editor.commands.setContent('First file changed');

    const cache = new Map();
    cacheEditorSession(cache, '/tmp/first.md', editor, getMarkdown(editor));

    loadEditorDocument(editor, 'Second file');

    const cached = getCachedEditorSession(cache, '/tmp/first.md', 'First file changed');
    expect(cached).not.toBeNull();

    editor.view.updateState(cached!.state);
    editor.commands.undo();

    expect(getMarkdown(editor)).toContain('First file');
    expect(getMarkdown(editor)).not.toContain('changed');
  });

  it('ignores stale cached state when disk content changed', () => {
    editor = createEditor('First file');

    const cache = new Map();
    cacheEditorSession(cache, '/tmp/first.md', editor, getMarkdown(editor));

    expect(getCachedEditorSession(cache, '/tmp/first.md', 'First file changed')).toBeNull();
  });
});
