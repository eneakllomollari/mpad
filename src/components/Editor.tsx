import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { Extension } from '@tiptap/core';
import { Markdown } from 'tiptap-markdown';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import { common, createLowlight } from 'lowlight';
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

const lowlight = createLowlight(common);

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

  if (!pos || filtered.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="slash-menu"
      style={{ top: pos.top, left: pos.left }}
      role="listbox"
      aria-label="Insert block"
    >
      {query && <div className="slash-menu-query" aria-live="polite">/{query}</div>}
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
  const processedRef = useRef<Processed>({
    frontmatter: null,
    body: '',
    xmlBlocks: [],
    mermaidBlocks: [],
  });

  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const sessionCacheRef = useRef<Map<string, CachedEditorSession>>(new Map());
  const prevFilePathRef = useRef(filePath);

  const processed = useMemo(() => {
    const p = preprocessContent(content);
    processedRef.current = p;
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Extensions are stable — LinkResolver uses storage for filePath, not configure()
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        codeBlock: false,
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
    content: processed.body,
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
    const processedContent = preprocessContent(content);

    processedRef.current = processedContent;

    if (switchingFiles) {
      cacheEditorSession(sessionCacheRef.current, previousFilePath, editor, lastKnownContent.current);
      setShowSlashMenu(false);

      const cachedSession = getCachedEditorSession(sessionCacheRef.current, filePath, content);

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

    if (content !== lastKnownContent.current) {
      lastKnownContent.current = content;
      loadEditorDocument(editor, processedContent.body);
    }

    prevFilePathRef.current = filePath;
  }, [content, editor, filePath, focusEditorAfterFileSwitch, showSource]);

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
              aria-label="Insert link"
              aria-pressed={editor.isActive('link')}
              className={editor.isActive('link') ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                if (editor.isActive('link')) {
                  editor.chain().focus().unsetLink().run();
                } else {
                  const url = window.prompt('URL');
                  if (url) editor.chain().focus().setLink({ href: url }).run();
                }
              }}
            >
              🔗
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
      <EditorContent editor={editor} />
      {showSlashMenu && editor && (
        <SlashMenu editor={editor} onClose={() => setShowSlashMenu(false)} />
      )}
    </div>
  );
}
