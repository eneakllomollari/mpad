import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { invoke } from '@tauri-apps/api/core';

export interface LinkResolverStorage {
  filePath: string | null;
}

/**
 * TipTap extension that intercepts link clicks:
 * - Relative .md links open in a new editor window
 * - External URLs and other file links open with the system default handler
 *
 * Uses editor storage for filePath so the extensions array stays stable
 * across file switches (avoids destroying/rebuilding the TipTap editor).
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
          handleClick(_view, _pos, event) {
            const anchor = (event.target as HTMLElement).closest('a');
            if (!anchor) return false;

            const href = anchor.getAttribute('href');
            if (!href) return false;

            event.preventDefault();

            handleLinkClick(href, storage.filePath);
            return true;
          },
        },
      }),
    ];
  },
});

function handleLinkClick(href: string, currentFilePath: string | null): void {
  // External URL (http, https, mailto, etc.)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href)) {
    invoke('open_with_system', { target: href }).catch((err) =>
      console.error('Failed to open URL:', err),
    );
    return;
  }

  // Relative path - resolve against current file's directory
  const resolvedPath = resolvePath(href, currentFilePath);

  if (resolvedPath && /\.(md|markdown|mdown)$/i.test(resolvedPath)) {
    invoke('open_md_in_window', { path: resolvedPath }).catch((err) =>
      console.error('Failed to open markdown file:', err),
    );
  } else if (resolvedPath) {
    invoke('open_with_system', { target: resolvedPath }).catch((err) =>
      console.error('Failed to open file:', err),
    );
  }
}

/**
 * Resolve a relative path against the directory of the current file.
 * Returns null if there's no current file to resolve against.
 */
function resolvePath(
  relative: string,
  currentFilePath: string | null,
): string | null {
  if (!currentFilePath) return null;

  // Strip any fragment/anchor from the relative path
  const pathOnly = relative.split('#')[0];
  if (!pathOnly) return null;

  // Get directory of the current file
  const lastSlash = currentFilePath.lastIndexOf('/');
  const dir = lastSlash >= 0 ? currentFilePath.slice(0, lastSlash) : '.';

  // Simple path resolution: join dir + relative, then normalize
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
