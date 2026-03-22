import type { EditorView } from '@tiptap/pm/view';

export function shouldOpenSlashMenu(view: EditorView, event: KeyboardEvent): boolean {
  if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }

  const { empty, $from } = view.state.selection;

  return empty && $from.parent.isTextblock && $from.parent.textContent === '';
}
