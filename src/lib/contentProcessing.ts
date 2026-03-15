const XML_BLOCK_RE =
  /^<([a-zA-Z][a-zA-Z0-9_-]*)>\s*\n([\s\S]*?)\n<\/\1>\s*$/gm;

const MERMAID_BLOCK_RE = /^```mermaid\n([\s\S]*?)```$/gm;

export interface XmlBlock {
  placeholder: string;
  tagName: string;
  content: string;
}

export interface MermaidBlock {
  placeholder: string;
  code: string;
}

export interface Processed {
  frontmatter: string | null;
  body: string;
  xmlBlocks: XmlBlock[];
  mermaidBlocks: MermaidBlock[];
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---(?:\n|$)/;

export function preprocessContent(raw: string): Processed {
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
    const placeholder = `%%XMLBLOCK:${idx}%%`;
    xmlBlocks.push({ placeholder, tagName, content });
    const i = idx++;
    // Encode content for safe embedding in an HTML attribute
    const safeContent = content
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '&#10;');
    return `<div data-type="xmlBlock" data-tag-name="${tagName}" data-content="${safeContent}" data-index="${i}"></div>`;
  });

  const mermaidBlocks: MermaidBlock[] = [];
  let mIdx = 0;

  body = body.replace(MERMAID_BLOCK_RE, (_match, code: string) => {
    const placeholder = `%%MERMAID:${mIdx}%%`;
    mermaidBlocks.push({ placeholder, code: code.trimEnd() });
    const i = mIdx++;
    const safeCode = code
      .trimEnd()
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '&#10;');
    return `<div data-type="mermaidBlock" data-code="${safeCode}" data-index="${i}"></div>`;
  });

  return { frontmatter, body, xmlBlocks, mermaidBlocks };
}

/**
 * Undo overzealous escaping/entity-encoding produced by prosemirror-markdown
 * and tiptap-markdown during the TipTap → Markdown serialization round-trip.
 *
 * prosemirror-markdown escapes brackets: [ ] → \[ \]
 * tiptap-markdown escapeHTML converts: < → &lt;  > → &gt;
 *
 * We restore these outside fenced code blocks so the user's original markdown
 * is preserved faithfully.
 */
function unescapeMarkdown(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (line.startsWith('```')) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    out.push(
      line
        .replace(/\\([[\]#>+\-*])/g, '$1')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&'),
    );
  }
  return out.join('\n');
}

/**
 * Remove blank lines between consecutive task list items that tiptap-markdown
 * inserts (tight → loose conversion). Preserves blank lines between regular
 * list items and non-list content.
 */
function tightenTaskLists(md: string): string {
  let prev = md;
  for (;;) {
    const next = prev.replace(/^(- \[[ x]\] .*)(?:\n\n)(- \[[ x]\] )/gm, '$1\n$2');
    if (next === prev) break;
    prev = next;
  }
  return prev;
}

export function postprocessContent(
  md: string,
  frontmatter: string | null,
  xmlBlocks: XmlBlock[],
  mermaidBlocks: MermaidBlock[] = [],
): string {
  let result = unescapeMarkdown(md);
  result = tightenTaskLists(result);

  for (let i = 0; i < xmlBlocks.length; i++) {
    const block = xmlBlocks[i];
    const xmlOutput = `<${block.tagName}>\n${block.content}\n</${block.tagName}>`;
    // Replace the text placeholder (output by XmlBlockNode markdown serializer)
    result = result.replace(block.placeholder, xmlOutput);
    // Also replace the HTML div placeholder (if body didn't go through TipTap)
    const divRe = new RegExp(
      `<div data-type="xmlBlock" data-tag-name="${block.tagName}"[^>]*data-index="${i}"[^>]*></div>`,
    );
    result = result.replace(divRe, xmlOutput);
  }

  for (let i = 0; i < mermaidBlocks.length; i++) {
    const block = mermaidBlocks[i];
    const mermaidOutput = `\`\`\`mermaid\n${block.code}\n\`\`\``;
    result = result.replace(block.placeholder, mermaidOutput);
    const divRe = new RegExp(
      `<div data-type="mermaidBlock"[^>]*data-index="${i}"[^>]*></div>`,
    );
    result = result.replace(divRe, mermaidOutput);
  }

  if (frontmatter) {
    // TipTap may strip the leading newline from the body, so always
    // ensure a blank line separates the closing --- from the content
    const body = result.startsWith('\n') ? result : `\n${result}`;
    result = `---\n${frontmatter}\n---\n${body}`;
  }

  if (!result.endsWith('\n')) {
    result += '\n';
  }

  return result;
}
