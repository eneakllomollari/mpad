import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { invoke } from '@tauri-apps/api/core';

export interface LinkResolverStorage {
  filePath: string | null;
}

/**
 * TipTap extension that intercepts link clicks:
 * - Cmd+Click (or Ctrl+Click) on a link opens it
 * - Relative .md links open in a new editor window
 * - External URLs and other file links open with the system default handler
 */
export const LinkResolver = Extension.create({
  name: 'linkResolver',

  addStorage(): LinkResolverStorage {
    return { filePath: null };
  },

  addProseMirrorPlugins() {
    const storage = this.storage as LinkResolverStorage;

    return [
      new Plugin({
        key: new PluginKey('linkResolver'),
        props: {
          handleDOMEvents: {
            click(view, event) {
              // Require Cmd/Ctrl+Click to follow links (standard editor behavior)
              if (!event.metaKey && !event.ctrlKey) return false;

              const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
              if (!pos) return false;

              const { doc } = view.state;
              const resolved = doc.resolve(pos.pos);
              const marks = resolved.marks();
              const linkMark = marks.find((m) => m.type.name === 'link');

              if (!linkMark) {
                // Also check the node before the position
                const node = resolved.nodeAfter ?? resolved.nodeBefore;
                if (!node) return false;
                const nodeLinkMark = node.marks.find((m) => m.type.name === 'link');
                if (!nodeLinkMark) return false;
                handleLinkClick(nodeLinkMark.attrs.href, storage.filePath);
                event.preventDefault();
                return true;
              }

              handleLinkClick(linkMark.attrs.href, storage.filePath);
              event.preventDefault();
              return true;
            },
          },
        },
      }),
    ];
  },
});

const EXTERNAL_URL_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const MARKDOWN_EXT_RE = /\.(md|markdown|mdown)$/i;

function handleLinkClick(href: string, currentFilePath: string | null): void {
  if (!href) return;

  // External URL (http, https, mailto, etc.)
  if (EXTERNAL_URL_RE.test(href)) {
    invoke('open_with_system', { target: href }).catch((err) =>
      console.error('Failed to open URL:', err),
    );
    return;
  }

  // Relative path - resolve against current file's directory
  const resolvedPath = resolvePath(href, currentFilePath);

  if (resolvedPath && MARKDOWN_EXT_RE.test(resolvedPath)) {
    invoke('open_md_in_window', { path: resolvedPath }).catch((err) =>
      console.error('Failed to open markdown file:', err),
    );
  } else if (resolvedPath) {
    invoke('open_with_system', { target: resolvedPath }).catch((err) =>
      console.error('Failed to open file:', err),
    );
  }
}

function resolvePath(
  relative: string,
  currentFilePath: string | null,
): string | null {
  if (!currentFilePath) return null;

  const pathOnly = relative.split('#')[0];
  if (!pathOnly) return null;

  const lastSlash = currentFilePath.lastIndexOf('/');
  const dir = lastSlash >= 0 ? currentFilePath.slice(0, lastSlash) : '.';

  const parts = `${dir}/${pathOnly}`.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      resolved.pop();
    } else if (part !== '.' && part !== '') {
      resolved.push(part);
    }
  }

  return '/' + resolved.join('/');
}
