const XML_BLOCK_RE =
  /^<([a-zA-Z][a-zA-Z0-9_-]*)>\s*\n([\s\S]*?)\n<\/\1>\s*$/gm;

export interface XmlBlock {
  placeholder: string;
  tagName: string;
  content: string;
}

export interface Processed {
  frontmatter: string | null;
  body: string;
  xmlBlocks: XmlBlock[];
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
    const placeholder = `<!--xmlblock:${idx}-->`;
    xmlBlocks.push({ placeholder, tagName, content });
    idx++;
    return placeholder;
  });

  return { frontmatter, body, xmlBlocks };
}

export function postprocessContent(
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
