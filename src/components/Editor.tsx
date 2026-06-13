import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { Extension } from '@tiptap/core';
import { Markdown } from 'tiptap-markdown';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import { createLowlight } from 'lowlight';
import bash from 'highlight.js/lib/languages/bash';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import plaintext from 'highlight.js/lib/languages/plaintext';
import python from 'highlight.js/lib/languages/python';
import typescript from 'highlight.js/lib/languages/typescript';
import yaml from 'highlight.js/lib/languages/yaml';
import { gfmExtensions } from '../extensions/gfm';
import { FrontmatterNode } from '../extensions/FrontmatterNode';
import { XmlBlockNode } from '../extensions/XmlBlockNode';
import { MermaidNode } from '../extensions/MermaidNode';
import { LinkResolver } from '../extensions/LinkResolver';
import type { LinkResolverStorage } from '../extensions/LinkResolver';
import { preprocessContent, postprocessContent } from '../lib/contentProcessing';
import type { Processed } from '../lib/contentProcessing';
import { shouldOpenSlashMenu } from '../lib/editorInteractions';
import {
  cacheEditorSession,
  getCachedEditorSession,
  loadEditorDocument,
  type CachedEditorSession,
} from '../lib/editorSession';
import { SearchHighlight } from '../extensions/SearchHighlight';
import { TaskItemAutoRemove } from '../extensions/TaskItemAutoRemove';
import { FindBar } from './FindBar';

const lowlight = createLowlight({
  bash, javascript, json, markdown, plaintext, python, typescript, yaml,
});

// Defer the 18 less-common syntax grammars to a separate chunk loaded after mount.
// They register on idle, after which we re-dispatch a transaction to refresh
// existing code-block decorations.
let extraLanguagesPromise: Promise<void> | null = null;
function registerExtraLanguages(): Promise<void> {
  if (!extraLanguagesPromise) {
    extraLanguagesPromise = Promise.all([
      import('highlight.js/lib/languages/c'),
      import('highlight.js/lib/languages/cpp'),
      import('highlight.js/lib/languages/csharp'),
      import('highlight.js/lib/languages/css'),
      import('highlight.js/lib/languages/diff'),
      import('highlight.js/lib/languages/go'),
      import('highlight.js/lib/languages/graphql'),
      import('highlight.js/lib/languages/java'),
      import('highlight.js/lib/languages/kotlin'),
      import('highlight.js/lib/languages/makefile'),
      import('highlight.js/lib/languages/php'),
      import('highlight.js/lib/languages/ruby'),
      import('highlight.js/lib/languages/rust'),
      import('highlight.js/lib/languages/scss'),
      import('highlight.js/lib/languages/shell'),
      import('highlight.js/lib/languages/sql'),
      import('highlight.js/lib/languages/swift'),
      import('highlight.js/lib/languages/xml'),
    ]).then(([c, cpp, csharp, css, diff, go, graphql, java, kotlin, makefile, php, ruby, rust, scss, shell, sql, swift, xml]) => {
      lowlight.register({
        c: c.default, cpp: cpp.default, csharp: csharp.default, css: css.default,
        diff: diff.default, go: go.default, graphql: graphql.default, java: java.default,
        kotlin: kotlin.default, makefile: makefile.default, php: php.default,
        ruby: ruby.default, rust: rust.default, scss: scss.default, shell: shell.default,
        sql: sql.default, swift: swift.default, xml: xml.default,
      });
    });
  }
  return extraLanguagesPromise;
}

type Level = 1 | 2 | 3 | 4 | 5 | 6;

const HeadingCycle = Extension.create({
  name: 'headingCycle',
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-ArrowUp': ({ editor }) => {
        const node = editor.state.selection.$from.parent;
        if (!node) return false;
        if (node.type.name === 'heading') {
          const level = node.attrs.level as Level;
          if (level > 1) return editor.chain().focus().setHeading({ level: (level - 1) as Level }).run();
          return editor.chain().focus().setParagraph().run();
        }
        return editor.chain().focus().setHeading({ level: 6 }).run();
      },
      'Mod-Shift-ArrowDown': ({ editor }) => {
        const node = editor.state.selection.$from.parent;
        if (!node) return false;
        if (node.type.name === 'heading') {
          const level = node.attrs.level as Level;
          if (level < 6) return editor.chain().focus().setHeading({ level: (level + 1) as Level }).run();
          return editor.chain().focus().setParagraph().run();
        }
        return editor.chain().focus().setHeading({ level: 1 }).run();
      },
    };
  },
});

interface EditorProps {
  content: string;
  onUpdate: (md: string) => void;
  showSource: boolean;
  filePath: string | null;
  showFind: boolean;
  findRequestToken: number;
  onCloseFindBar: () => void;
}

// --- Slash command menu items ---
interface SlashItem {
  label: string;
  description: string;
  action: (editor: ReturnType<typeof useEditor>) => void;
}

const slashItems: SlashItem[] = [
  { label: 'Heading 1', description: 'Large heading', action: (e) => e?.chain().focus().setHeading({ level: 1 }).run() },
  { label: 'Heading 2', description: 'Medium heading', action: (e) => e?.chain().focus().setHeading({ level: 2 }).run() },
  { label: 'Heading 3', description: 'Small heading', action: (e) => e?.chain().focus().setHeading({ level: 3 }).run() },
  { label: 'Bullet List', description: 'Unordered list', action: (e) => e?.chain().focus().toggleBulletList().run() },
  { label: 'Numbered List', description: 'Ordered list', action: (e) => e?.chain().focus().toggleOrderedList().run() },
  { label: 'Task List', description: 'Checklist', action: (e) => e?.chain().focus().toggleTaskList().run() },
  { label: 'Code Block', description: 'Fenced code', action: (e) => e?.chain().focus().toggleCodeBlock().run() },
  { label: 'Blockquote', description: 'Quote block', action: (e) => e?.chain().focus().toggleBlockquote().run() },
  { label: 'Horizontal Rule', description: 'Divider', action: (e) => e?.chain().focus().setHorizontalRule().run() },
  {
    label: 'Mermaid Diagram',
    description: 'Diagram block',
    action: (e) => {
      if (!e) return;
      const code = 'graph TD\n    A[Start] --> B[End]';
      e.chain().focus().insertContent({
        type: 'mermaidBlock',
        attrs: { code, index: `new-${Date.now()}` },
      }).run();
    },
  },
];

function SlashMenu({ editor, onClose }: { editor: ReturnType<typeof useEditor>; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => slashItems.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())),
    [query],
  );

  const clampedSelected = Math.min(selected, Math.max(filtered.length - 1, 0));

  const queryRef = useRef(query);
  useEffect(() => { queryRef.current = query; });
  const filteredRef = useRef(filtered);
  useEffect(() => { filteredRef.current = filtered; });
  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // If focus moved to another field (find bar, command palette, link
      // popover, source textarea), close the menu and let the key through —
      // never steal keystrokes from inputs outside the editor.
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        onClose();
        return;
      }

      const selectedItem = filteredRef.current[selectedRef.current];

      switch (e.key) {
        case 'Escape':
          onClose();
          return;
        case 'ArrowDown':
          e.preventDefault();
          setSelected((s) => Math.min(s + 1, filteredRef.current.length - 1));
          return;
        case 'ArrowUp':
          e.preventDefault();
          setSelected((s) => Math.max(s - 1, 0));
          return;
        case 'Enter':
          if (selectedItem) {
            e.preventDefault();
            selectedItem.action(editor);
            onClose();
          }
          return;
        case 'Backspace':
          if (queryRef.current === '') {
            onClose();
            return;
          }
          setQuery((q) => q.slice(0, -1));
          e.preventDefault();
          return;
        default:
          if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
            setQuery((q) => q + e.key);
            e.preventDefault();
          }
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [editor, onClose]);

  // Dismiss on click-outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Position near cursor, clamped to viewport
  const pos = useMemo(() => {
    if (!editor) return null;
    const { from } = editor.state.selection;
    const coords = editor.view.coordsAtPos(from);
    const menuHeight = 320;
    const menuWidth = 220;
    let top = coords.bottom + 4;
    let left = coords.left;
    if (top + menuHeight > window.innerHeight) {
      top = coords.top - menuHeight - 4;
    }
    if (left + menuWidth > window.innerWidth) {
      left = window.innerWidth - menuWidth - 8;
    }
    return { top: Math.max(4, top), left: Math.max(4, left) };
  }, [editor]);

  if (!pos) return null;

  return (
    <div
      ref={menuRef}
      className="slash-menu"
      style={{ top: pos.top, left: pos.left }}
      role="listbox"
      aria-label="Insert block"
    >
      {query && <div className="slash-menu-query" aria-live="polite">/{query}</div>}
      {filtered.length === 0 && (
        <div className="slash-menu-empty" role="status">No matching block · Esc to dismiss</div>
      )}
      {filtered.map((item, i) => (
        <div
          key={item.label}
          role="option"
          aria-selected={i === clampedSelected}
          className={`slash-menu-item ${i === clampedSelected ? 'selected' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            item.action(editor);
            onClose();
          }}
          onMouseEnter={() => setSelected(i)}
        >
          <span className="slash-menu-label">{item.label}</span>
          <span className="slash-menu-desc">{item.description}</span>
        </div>
      ))}
    </div>
  );
}

const LinkIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

interface LinkDraft {
  from: number;
  to: number;
  href: string;
  top: number;
  left: number;
}

// Inline link editor. Replaces window.prompt (unreliable in Tauri's WKWebView)
// and lets you edit an existing link's URL instead of only removing it. The
// selection range is captured up front so applying still works after the input
// steals DOM focus from the editor.
function LinkPopover({
  editor,
  draft,
  onClose,
}: {
  editor: NonNullable<ReturnType<typeof useEditor>>;
  draft: LinkDraft;
  onClose: () => void;
}) {
  const [href, setHref] = useState(draft.href);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [onClose]);

  const range = { from: draft.from, to: draft.to };

  const apply = () => {
    const url = href.trim();
    const chain = editor.chain().focus().setTextSelection(range).extendMarkRange('link');
    if (url) chain.setLink({ href: url }).run();
    else chain.unsetLink().run();
    onClose();
  };

  const remove = () => {
    editor.chain().focus().setTextSelection(range).extendMarkRange('link').unsetLink().run();
    onClose();
  };

  const left = Math.max(8, Math.min(draft.left, window.innerWidth - 320));
  const top = Math.max(8, Math.min(draft.top, window.innerHeight - 80));

  return (
    <div
      ref={popoverRef}
      className="link-popover"
      style={{ top, left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="text"
        className="link-popover-input"
        placeholder="Paste or type a URL"
        value={href}
        spellCheck={false}
        autoComplete="off"
        aria-label="Link URL"
        onChange={(e) => setHref(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            apply();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <button type="button" className="link-popover-btn link-popover-apply" onMouseDown={(e) => { e.preventDefault(); apply(); }}>
        {draft.href ? 'Update' : 'Add'}
      </button>
      {draft.href && (
        <button type="button" className="link-popover-btn link-popover-remove" onMouseDown={(e) => { e.preventDefault(); remove(); }} aria-label="Remove link">
          Remove
        </button>
      )}
    </div>
  );
}

// --- Bubble menu button config ---
const bubbleItems: { mark: string; label: React.ReactNode; command: string; ariaLabel: string }[] = [
  { mark: 'bold', label: <strong>B</strong>, command: 'toggleBold', ariaLabel: 'Bold' },
  { mark: 'italic', label: <em>I</em>, command: 'toggleItalic', ariaLabel: 'Italic' },
  { mark: 'strike', label: <s>S</s>, command: 'toggleStrike', ariaLabel: 'Strikethrough' },
  { mark: 'code', label: <code>&lt;/&gt;</code>, command: 'toggleCode', ariaLabel: 'Inline code' },
  { mark: 'highlight', label: 'H', command: 'toggleHighlight', ariaLabel: 'Highlight' },
];

export function Editor({
  content,
  onUpdate,
  showSource,
  filePath,
  showFind,
  findRequestToken,
  onCloseFindBar,
}: EditorProps) {
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuFilePath, setSlashMenuFilePath] = useState<string | null>(null);
  const closeSlashMenu = useCallback(() => setShowSlashMenu(false), []);
  const [linkDraft, setLinkDraft] = useState<LinkDraft | null>(null);
  const closeLinkPopover = useCallback(() => setLinkDraft(null), []);
  const [sessionCache] = useState(() => new Map<string, CachedEditorSession>());
  const prevFilePathRef = useRef(filePath);

  // Compute the initial processed content once via lazy state init,
  // avoiding render-phase ref writes (banned per project conventions).
  const [initialProcessed] = useState(() => preprocessContent(content));
  const processedRef = useRef<Processed>(initialProcessed);

  // Extensions are stable — LinkResolver uses storage for filePath, not configure()
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        codeBlock: false,
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
        },
      }),
      CodeBlockLowlight.configure({
        lowlight,
        HTMLAttributes: { class: 'code-block' },
      }),
      Highlight.configure({ multicolor: false }),
      Image.configure({ inline: false, allowBase64: true }),
      Markdown.configure({
        html: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
      ...gfmExtensions,
      FrontmatterNode,
      XmlBlockNode,
      MermaidNode,
      LinkResolver,
      HeadingCycle,
      SearchHighlight,
      TaskItemAutoRemove,
    ],
    [],
  );

  const lastKnownContent = useRef(content);

  // Ref to always access the latest onUpdate without stale closures in editor callback
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => { onUpdateRef.current = onUpdate; });

  const handleUpdate = useCallback(
    (md: string) => {
      const full = postprocessContent(
        md,
        processedRef.current.frontmatter,
        processedRef.current.xmlBlocks,
        processedRef.current.mermaidBlocks,
      );
      lastKnownContent.current = full;
      onUpdateRef.current(full);
    },
    [],
  );

  const focusEditorAfterFileSwitch = useCallback((targetEditor: NonNullable<ReturnType<typeof useEditor>>) => {
    requestAnimationFrame(() => {
      if (!targetEditor.isDestroyed) {
        targetEditor.commands.focus();
      }
    });
  }, []);

  const editor = useEditor({
    extensions,
    content: initialProcessed.body,
    onUpdate: ({ editor: ed }) => {
      const storage = (ed.storage as unknown as Record<string, { getMarkdown?: () => string }>)?.markdown;
      if (!storage?.getMarkdown) return;
      const md = storage.getMarkdown();
      handleUpdate(md);
    },
    editorProps: {
      handleKeyDown: (view, event) => {
        if (shouldOpenSlashMenu(view, event)) {
          event.preventDefault();
          setSlashMenuFilePath(filePath);
          setShowSlashMenu(true);
          return true;
        }
        return false;
      },
    },
  });

  // Update LinkResolver storage when filePath changes (no editor rebuild needed)
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      (editor.storage as unknown as Record<string, LinkResolverStorage>).linkResolver.filePath = filePath;
    }
  }, [editor, filePath]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      prevFilePathRef.current = filePath;
      return;
    }

    if (showSource) {
      prevFilePathRef.current = filePath;
      return;
    }

    const previousFilePath = prevFilePathRef.current;
    const switchingFiles = previousFilePath !== filePath;
    const contentChanged = content !== lastKnownContent.current;

    if (!switchingFiles && !contentChanged) {
      prevFilePathRef.current = filePath;
      return;
    }

    const processedContent = preprocessContent(content);
    processedRef.current = processedContent;

    if (switchingFiles) {
      cacheEditorSession(sessionCache, previousFilePath, editor, lastKnownContent.current);
      const cachedSession = getCachedEditorSession(sessionCache, filePath, content);

      if (cachedSession) {
        editor.view.updateState(cachedSession.state);
        lastKnownContent.current = cachedSession.content;
        focusEditorAfterFileSwitch(editor);
        prevFilePathRef.current = filePath;
        return;
      }

      lastKnownContent.current = content;
      loadEditorDocument(editor, processedContent.body);
      focusEditorAfterFileSwitch(editor);
      prevFilePathRef.current = filePath;
      return;
    }

    if (contentChanged) {
      lastKnownContent.current = content;
      loadEditorDocument(editor, processedContent.body);
    }

    prevFilePathRef.current = filePath;
  }, [content, editor, filePath, focusEditorAfterFileSwitch, sessionCache, showSource]);

  // Lazy-load less-common syntax grammars on idle, then refresh decorations
  // so any code blocks already in the document pick up highlighting.
  useEffect(() => {
    if (!editor) return;
    type IdleWindow = Window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const w = window as IdleWindow;
    let cancelled = false;
    const run = () => {
      registerExtraLanguages().then(() => {
        if (cancelled || editor.isDestroyed) return;
        editor.view.dispatch(editor.state.tr);
      });
    };
    let idleId: number | null = null;
    let timerId: number | null = null;
    if (w.requestIdleCallback) {
      idleId = w.requestIdleCallback(run);
    } else {
      timerId = window.setTimeout(run, 0);
    }
    return () => {
      cancelled = true;
      if (idleId !== null && w.cancelIdleCallback) w.cancelIdleCallback(idleId);
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [editor]);

  const handleSourceChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onUpdate(e.target.value);
    },
    [onUpdate],
  );

  // When switching from source back to WYSIWYG, sync editor with current content
  const prevShowSourceRef = useRef(showSource);
  useEffect(() => {
    const wasSource = prevShowSourceRef.current;
    prevShowSourceRef.current = showSource;
    if (wasSource && !showSource && editor && !editor.isDestroyed) {
      const p = preprocessContent(content);
      processedRef.current = p;
      lastKnownContent.current = content;
      loadEditorDocument(editor, p.body);
    }
  // content and editor are intentionally excluded — only trigger on showSource transition
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSource]);

  if (showSource) {
    return (
      <textarea
        className="source-editor"
        value={content}
        onChange={handleSourceChange}
        spellCheck={false}
        aria-label="Markdown source editor"
      />
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      {editor && (
        <BubbleMenu editor={editor}>
          <div className="bubble-menu" role="toolbar" aria-label="Text formatting">
            {bubbleItems.map(({ mark, label, command, ariaLabel }) => (
              <button
                key={mark}
                type="button"
                aria-label={ariaLabel}
                aria-pressed={editor.isActive(mark)}
                className={editor.isActive(mark) ? 'active' : ''}
                onMouseDown={(e) => {
                  e.preventDefault();
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (editor.chain().focus() as any)[command]().run();
                }}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              aria-label={editor.isActive('link') ? 'Edit link' : 'Insert link'}
              aria-pressed={editor.isActive('link')}
              className={`bubble-icon ${editor.isActive('link') ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                const { from, to } = editor.state.selection;
                const anchor = editor.view.coordsAtPos(from);
                const end = editor.view.coordsAtPos(to);
                setLinkDraft({
                  from,
                  to,
                  href: (editor.getAttributes('link').href as string) ?? '',
                  top: end.bottom + 8,
                  left: anchor.left,
                });
              }}
            >
              {LinkIcon}
            </button>
          </div>
        </BubbleMenu>
      )}
      <FindBar
        editor={editor}
        visible={showFind}
        activationToken={findRequestToken}
        onClose={onCloseFindBar}
      />
      <EditorContent editor={editor} role="textbox" aria-label="Document editor" />
      {showSlashMenu && slashMenuFilePath === filePath && editor && (
        <SlashMenu editor={editor} onClose={closeSlashMenu} />
      )}
      {linkDraft && editor && (
        <LinkPopover editor={editor} draft={linkDraft} onClose={closeLinkPopover} />
      )}
    </div>
  );
}
