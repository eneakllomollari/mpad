// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor as TiptapEditor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { shouldOpenSlashMenu } from '../src/lib/editorInteractions';

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

describe('slash menu trigger', () => {
  let editor: TiptapEditor;

  afterEach(() => { editor?.destroy(); });

  it('opens slash menu on an empty text block', () => {
    editor = createEditor('');
    const event = new KeyboardEvent('keydown', { key: '/' });

    expect(shouldOpenSlashMenu(editor.view, event)).toBe(true);
  });

  it('does not open slash menu in non-empty text or with modifiers', () => {
    editor = createEditor('Hello');

    expect(shouldOpenSlashMenu(editor.view, new KeyboardEvent('keydown', { key: '/' }))).toBe(false);
    expect(shouldOpenSlashMenu(editor.view, new KeyboardEvent('keydown', { key: '/', ctrlKey: true }))).toBe(false);
    expect(shouldOpenSlashMenu(editor.view, new KeyboardEvent('keydown', { key: '/', metaKey: true }))).toBe(false);
  });
});
