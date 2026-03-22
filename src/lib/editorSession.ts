import { createDocument, type Editor } from '@tiptap/core';
import { TextSelection, type EditorState } from '@tiptap/pm/state';

export interface CachedEditorSession {
  state: EditorState;
  content: string;
}

export function cacheEditorSession(
  cache: Map<string, CachedEditorSession>,
  filePath: string | null,
  editor: Editor | null,
  content: string,
): void {
  if (!filePath || !editor || editor.isDestroyed) {
    return;
  }

  cache.set(filePath, { state: editor.view.state, content });
}

export function getCachedEditorSession(
  cache: Map<string, CachedEditorSession>,
  filePath: string | null,
  content: string,
): CachedEditorSession | null {
  if (!filePath) {
    return null;
  }

  const cached = cache.get(filePath);

  if (!cached || cached.content !== content) {
    return null;
  }

  return cached;
}

export function loadEditorDocument(editor: Editor, content: string): void {
  const document = createDocument(content, editor.schema);
  const tr = editor.state.tr.replaceWith(0, editor.state.doc.content.size, document);

  tr.setMeta('preventUpdate', true);
  tr.setMeta('addToHistory', false);
  tr.setSelection(TextSelection.atStart(tr.doc));

  editor.view.dispatch(tr);
}
