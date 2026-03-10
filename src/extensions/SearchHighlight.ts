import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface SearchHighlightStorage {
  query: string;
  activeIndex: number;
  totalMatches: number;
}

const searchPluginKey = new PluginKey('searchHighlight');

function findMatches(doc: ReturnType<typeof import('@tiptap/pm/state').EditorState.prototype.doc.nodeAt>, query: string): { from: number; to: number }[] {
  if (!query || !doc) return [];
  const results: { from: number; to: number }[] = [];
  const lowerQuery = query.toLowerCase();

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text.toLowerCase();
    let idx = text.indexOf(lowerQuery);
    while (idx !== -1) {
      results.push({ from: pos + idx, to: pos + idx + query.length });
      idx = text.indexOf(lowerQuery, idx + 1);
    }
  });

  return results;
}

export const SearchHighlight = Extension.create<Record<string, never>, SearchHighlightStorage>({
  name: 'searchHighlight',

  addStorage() {
    return {
      query: '',
      activeIndex: 0,
      totalMatches: 0,
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;

    return [
      new Plugin({
        key: searchPluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(_tr, _old, _oldState, newState) {
            const query = storage.query;
            if (!query) {
              storage.totalMatches = 0;
              return DecorationSet.empty;
            }

            const matches = findMatches(newState.doc, query);
            storage.totalMatches = matches.length;

            // Clamp activeIndex
            if (storage.activeIndex >= matches.length) {
              storage.activeIndex = 0;
            }

            const decorations = matches.map((m, i) =>
              Decoration.inline(m.from, m.to, {
                class: i === storage.activeIndex ? 'search-match-active' : 'search-match',
              }),
            );

            return DecorationSet.create(newState.doc, decorations);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
