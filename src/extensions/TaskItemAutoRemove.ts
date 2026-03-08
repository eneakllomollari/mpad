import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

const key = new PluginKey('taskItemAutoRemove');

/**
 * Removes checked task items from the document after a short delay,
 * giving the user visual feedback (strikethrough + dim) before removal.
 * Only triggers on user-initiated checks, not pre-existing checked items.
 */
export const TaskItemAutoRemove = Extension.create({
  name: 'taskItemAutoRemove',

  addProseMirrorPlugins() {
    const editor = this.editor;
    let pendingTimeout: ReturnType<typeof setTimeout> | null = null;

    return [
      new Plugin({
        key,
        view() {
          return {
            update(view, prevState) {
              if (view.state.doc.eq(prevState.doc)) return;

              // Cancel any pending removal on every doc change (prevents
              // stale timeouts from firing after a file switch via setContent)
              if (pendingTimeout) {
                clearTimeout(pendingTimeout);
                pendingTimeout = null;
              }

              const newlyCheckedTexts: string[] = [];
              view.state.doc.descendants((node, pos) => {
                if (node.type.name !== 'taskItem' || !node.attrs.checked) return;
                try {
                  const prevNode = prevState.doc.nodeAt(pos);
                  if (prevNode?.type.name === 'taskItem' && !prevNode.attrs.checked) {
                    newlyCheckedTexts.push(node.textContent);
                  }
                } catch { /* position shifted */ }
              });

              if (newlyCheckedTexts.length === 0) return;

              // Only remove items whose text matches what was just checked,
              // leaving pre-existing checked items untouched
              const textsToRemove = new Set(newlyCheckedTexts);

              pendingTimeout = setTimeout(() => {
                if (editor.isDestroyed) return;

                editor.chain().command(({ tr, state }) => {
                  const positions: { pos: number; size: number }[] = [];
                  state.doc.descendants((n, p) => {
                    if (n.type.name === 'taskItem' && n.attrs.checked && textsToRemove.has(n.textContent)) {
                      positions.push({ pos: p, size: n.nodeSize });
                    }
                  });

                  if (positions.length === 0) return false;

                  for (let i = positions.length - 1; i >= 0; i--) {
                    tr.delete(positions[i].pos, positions[i].pos + positions[i].size);
                  }
                  return true;
                }).run();
              }, 800);
            },

            destroy() {
              if (pendingTimeout) clearTimeout(pendingTimeout);
            },
          };
        },
      }),
    ];
  },
});
