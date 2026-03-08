import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { Extension } from '@tiptap/core';
import { Markdown } from 'tiptap-markdown';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Highlight from '@tiptap/extension-highlight';
import { common, createLowlight } from 'lowlight';
import { gfmExtensions } from '../extensions/gfm';
import { FrontmatterNode } from '../extensions/FrontmatterNode';
import { XmlBlockNode } from '../extensions/XmlBlockNode';
import { LinkResolver } from '../extensions/LinkResolver';
import type { LinkResolverStorage } from '../extensions/LinkResolver';

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
}

const XML_BLOCK_RE =
  /^<([a-zA-Z][a-zA-Z0-9_-]*)>\s*\n([\s\S]*?)\n<\/\1>\s*$/gm;

interface XmlBlock {
  placeholder: string;
  tagName: string;
  content: string;
}

interface Processed {
  frontmatter: string | null;
  body: string;
  xmlBlocks: XmlBlock[];
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---(?:\n|$)/;

function preprocessContent(raw: string): Processed {
  let frontmatter: string | null = null;
  let body = raw;

  const fmMatch = raw.match(FRONTMATTER_RE);
  if (fmMatch && fmMatch[1].trim()) {
    frontmatter = fmMatch[1];
    body = raw.slice(fmMatch[0].length);
  }

  const xmlBlocks: XmlBlock[] = [];
  let idx = 0;

  body = body.replace(XML_BLOCK_RE, (_match, tagName: string, content: string) => {
    const placeholder = `<!--xmlblock:${idx}-->`;
    xmlBlocks.push({ placeholder, tagName, content });
    idx++;
    return placeholder;
  });

  return { frontmatter, body, xmlBlocks };
}

function postprocessContent(
  md: string,
  frontmatter: string | null,
  xmlBlocks: XmlBlock[],
): string {
  let result = md;

  for (const block of xmlBlocks) {
    result = result.replace(
      block.placeholder,
      `<${block.tagName}>\n${block.content}\n</${block.tagName}>`,
    );
  }

  if (frontmatter) {
    result = `---\n${frontmatter}\n---\n${result}`;
  }

  return result;
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
];

function SlashMenu({ editor, onClose }: { editor: ReturnType<typeof useEditor>; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);

  const filtered = useMemo(
    () => slashItems.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())),
    [query],
  );

  // Clamp selection to valid range when filtered results change
  const clampedSelected = Math.min(selected, Math.max(filtered.length - 1, 0));

  // Use refs for values that change frequently to avoid re-registering the listener
  const queryRef = useRef(query);
  useEffect(() => { queryRef.current = query; });
  const filteredRef = useRef(filtered);
  useEffect(() => { filteredRef.current = filtered; });
  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, filteredRef.current.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); return; }
      if (e.key === 'Enter' && filteredRef.current[selectedRef.current]) {
        e.preventDefault();
        filteredRef.current[selectedRef.current].action(editor);
        onClose();
        return;
      }
      if (e.key === 'Backspace' && queryRef.current === '') { onClose(); return; }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
        setQuery((q) => q + e.key);
        e.preventDefault();
        return;
      }
      if (e.key === 'Backspace') {
        setQuery((q) => q.slice(0, -1));
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [editor, onClose]);

  // Position near cursor — computed once on mount
  const pos = useMemo(() => {
    if (!editor) return null;
    const { from } = editor.state.selection;
    const coords = editor.view.coordsAtPos(from);
    return { top: coords.bottom + 4, left: coords.left };
  }, [editor]);

  if (!pos || filtered.length === 0) return null;

  return (
    <div
      className="slash-menu"
      style={{ top: pos.top, left: pos.left }}
    >
      {query && <div className="slash-menu-query">/{query}</div>}
      {filtered.map((item, i) => (
        <div
          key={item.label}
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
const bubbleItems: { mark: string; label: React.ReactNode; command: string }[] = [
  { mark: 'bold', label: <strong>B</strong>, command: 'toggleBold' },
  { mark: 'italic', label: <em>I</em>, command: 'toggleItalic' },
  { mark: 'strike', label: <s>S</s>, command: 'toggleStrike' },
  { mark: 'code', label: <code>&lt;/&gt;</code>, command: 'toggleCode' },
  { mark: 'highlight', label: 'H', command: 'toggleHighlight' },
];

export function Editor({ content, onUpdate, showSource, filePath }: EditorProps) {
  const processedRef = useRef<Processed>({
    frontmatter: null,
    body: '',
    xmlBlocks: [],
  });

  const [showSlashMenu, setShowSlashMenu] = useState(false);

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
      Markdown.configure({
        html: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
      ...gfmExtensions,
      FrontmatterNode,
      XmlBlockNode,
      LinkResolver,
      HeadingCycle,
    ],
    [],
  );

  const lastKnownContent = useRef(content);

  const handleUpdate = useCallback(
    (md: string) => {
      const full = postprocessContent(
        md,
        processedRef.current.frontmatter,
        processedRef.current.xmlBlocks,
      );
      lastKnownContent.current = full;
      onUpdate(full);
    },
    [onUpdate],
  );

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
      handleKeyDown: (_view, event) => {
        if (event.key === '/' && !event.metaKey && !event.ctrlKey) {
          if (editor) {
            const { $from } = editor.state.selection;
            if ($from.parent.textContent === '') {
              setShowSlashMenu(true);
              return true;
            }
          }
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
    if (content !== lastKnownContent.current && editor && !editor.isDestroyed) {
      lastKnownContent.current = content;
      const p = preprocessContent(content);
      processedRef.current = p;
      editor.commands.setContent(p.body);
    }
  }, [content, editor]);

  const handleSourceChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      lastKnownContent.current = e.target.value;
      onUpdate(e.target.value);
    },
    [onUpdate],
  );

  if (showSource) {
    return (
      <textarea
        className="source-editor"
        value={content}
        onChange={handleSourceChange}
        spellCheck={false}
      />
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      {editor && (
        <BubbleMenu editor={editor}>
          <div className="bubble-menu">
            {bubbleItems.map(({ mark, label, command }) => (
              <button
                key={mark}
                type="button"
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
      <EditorContent editor={editor} />
      {showSlashMenu && editor && (
        <SlashMenu editor={editor} onClose={() => setShowSlashMenu(false)} />
      )}
    </div>
  );
}
