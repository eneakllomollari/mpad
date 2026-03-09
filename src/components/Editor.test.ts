// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { Editor as TiptapEditor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Markdown } from 'tiptap-markdown';
import { preprocessContent, postprocessContent } from '../lib/contentProcessing';

function createEditor(content: string = '') {
  return new TiptapEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
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

describe('TipTap content round-trip', () => {
  let editor: TiptapEditor;

  afterEach(() => { editor?.destroy(); });

  it('setContent then getMarkdown preserves simple content', () => {
    editor = createEditor('Hello world');
    expect(getMarkdown(editor)).toContain('Hello world');
  });

  it('setContent then getMarkdown preserves headings', () => {
    editor = createEditor('# Heading 1\n\n## Heading 2');
    const md = getMarkdown(editor);
    expect(md).toContain('# Heading 1');
    expect(md).toContain('## Heading 2');
  });

  it('setContent then getMarkdown preserves lists', () => {
    editor = createEditor('- item 1\n- item 2\n- item 3');
    const md = getMarkdown(editor);
    expect(md).toContain('item 1');
    expect(md).toContain('item 2');
  });

  it('setContent with identical content does NOT trigger onUpdate', () => {
    editor = createEditor('Hello');
    let updateCount = 0;
    editor.on('update', () => { updateCount++; });

    editor.commands.setContent('Hello');
    expect(updateCount).toBe(0);
  });

  it('setContent with DIFFERENT content triggers onUpdate', () => {
    editor = createEditor('Hello');
    let updateCount = 0;
    editor.on('update', () => { updateCount++; });

    editor.commands.setContent('Goodbye');
    expect(updateCount).toBeGreaterThan(0);
  });

  it('external content change should update editor', () => {
    editor = createEditor('Version 1');
    let lastKnownContent = 'Version 1';
    const updates: string[] = [];

    editor.on('update', () => { updates.push(getMarkdown(editor)); });

    const externalContent = 'Version 2\n\nNew paragraph';
    const { body } = preprocessContent(externalContent);

    if (externalContent !== lastKnownContent) {
      editor.commands.setContent(body);
      lastKnownContent = externalContent;
    }

    expect(updates.length).toBeGreaterThan(0);
    expect(getMarkdown(editor)).toContain('Version 2');
  });
});

describe('source toggle content transition', () => {
  let editor: TiptapEditor;

  afterEach(() => { editor?.destroy(); });

  it('WYSIWYG → source preserves content via getMarkdown', () => {
    editor = createEditor('# Hello\n\nWorld');
    const md = getMarkdown(editor);
    expect(md).toContain('# Hello');
    expect(md).toContain('World');
  });

  it('source → WYSIWYG restores content via setContent', () => {
    editor = createEditor('Initial');
    const edited = '# Edited heading\n\nNew paragraph';
    const { body } = preprocessContent(edited);
    editor.commands.setContent(body);
    const result = getMarkdown(editor);
    expect(result).toContain('# Edited heading');
    expect(result).toContain('New paragraph');
  });

  it('rapid toggling does not corrupt content', () => {
    const original = '# Heading\n\nParagraph with **bold**';
    editor = createEditor(original);
    const md1 = getMarkdown(editor);
    const { body } = preprocessContent(md1);
    editor.commands.setContent(body);
    const md2 = getMarkdown(editor);
    expect(md2).toContain('# Heading');
    expect(md2).toContain('**bold**');
  });

  it('source edits with frontmatter preserve frontmatter on toggle back', () => {
    const raw = '---\ntitle: Test\n---\n# Body';
    const { frontmatter, body, xmlBlocks } = preprocessContent(raw);

    editor = createEditor(body);
    const editedRaw = '---\ntitle: Test\n---\n# Changed Body';
    const editedProcessed = preprocessContent(editedRaw);

    editor.commands.setContent(editedProcessed.body);
    const md = getMarkdown(editor);

    const restored = postprocessContent(md, frontmatter, xmlBlocks);
    expect(restored).toContain('---\ntitle: Test\n---');
    expect(restored).toContain('Changed Body');
  });

  it('content sync should not fire during source mode', () => {
    editor = createEditor('Start');
    let setContentCallCount = 0;

    const originalSetContent = editor.commands.setContent.bind(editor.commands);
    editor.commands.setContent = (...args: Parameters<typeof editor.commands.setContent>) => {
      setContentCallCount++;
      return originalSetContent(...args);
    };

    const showSource = true;
    const newContent = 'Start\n\nNew line';
    const lastKnownContent = 'Start';

    if (!showSource && newContent !== lastKnownContent) {
      editor.commands.setContent(preprocessContent(newContent).body);
    }

    expect(setContentCallCount).toBe(0);
  });
});
