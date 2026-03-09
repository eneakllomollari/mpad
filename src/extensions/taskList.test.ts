// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Markdown } from 'tiptap-markdown';

function createEditor(content: string = '') {
  return new Editor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown,
    ],
    content,
  });
}

function getMarkdown(editor: Editor): string {
  return (editor.storage as unknown as Record<string, { getMarkdown: () => string }>)
    .markdown.getMarkdown();
}

describe('TaskList', () => {
  it('parses task list markdown', () => {
    const editor = createEditor('- [ ] item\n- [x] done');
    const doc = editor.state.doc;
    const taskList = doc.firstChild!;

    expect(taskList.type.name).toBe('taskList');
    expect(taskList.childCount).toBe(2);

    const first = taskList.child(0);
    const second = taskList.child(1);
    expect(first.type.name).toBe('taskItem');
    expect(first.attrs.checked).toBe(false);
    expect(second.type.name).toBe('taskItem');
    expect(second.attrs.checked).toBe(true);

    editor.destroy();
  });

  it('toggles checked state', () => {
    const editor = createEditor('- [ ] todo');
    const doc = editor.state.doc;
    const taskItem = doc.firstChild!.firstChild!;
    expect(taskItem.attrs.checked).toBe(false);

    // Find the position of the task item and update its attrs
    let taskItemPos = 0;
    doc.descendants((node, pos) => {
      if (node.type.name === 'taskItem') {
        taskItemPos = pos;
        return false;
      }
    });

    editor.chain().focus().command(({ tr }) => {
      tr.setNodeMarkup(taskItemPos, undefined, { ...taskItem.attrs, checked: true });
      return true;
    }).run();

    const updated = editor.state.doc.firstChild!.firstChild!;
    expect(updated.attrs.checked).toBe(true);

    editor.destroy();
  });

  it('serializes back to markdown', () => {
    const editor = createEditor('- [ ] unchecked\n- [x] checked');
    const md = getMarkdown(editor);

    expect(md).toContain('[ ] unchecked');
    expect(md).toContain('[x] checked');

    editor.destroy();
  });

  it('handles nested task lists', () => {
    const input = '- [ ] parent\n    - [ ] child\n    - [x] done child';
    const editor = createEditor(input);
    const doc = editor.state.doc;
    const taskList = doc.firstChild!;

    expect(taskList.type.name).toBe('taskList');
    const parent = taskList.child(0);
    expect(parent.type.name).toBe('taskItem');
    expect(parent.attrs.checked).toBe(false);

    // The nested list should be inside the parent task item
    let hasNestedTaskList = false;
    parent.forEach((child) => {
      if (child.type.name === 'taskList') {
        hasNestedTaskList = true;
        expect(child.childCount).toBe(2);
        expect(child.child(0).attrs.checked).toBe(false);
        expect(child.child(1).attrs.checked).toBe(true);
      }
    });
    expect(hasNestedTaskList).toBe(true);

    // Verify round-trip serialization preserves nesting
    const md = getMarkdown(editor);
    expect(md).toContain('[ ] parent');
    expect(md).toContain('[ ] child');
    expect(md).toContain('[x] done child');

    editor.destroy();
  });
});
