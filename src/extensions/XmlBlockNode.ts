import { Node } from '@tiptap/react';

const TAG_COLORS: Record<string, string> = {
  'system-reminder': 'xml-blue',
  'system-prompt': 'xml-blue',
  'user-prompt': 'xml-green',
  'user-message': 'xml-green',
  'assistant-response': 'xml-green',
};

function getColorClass(tagName: string): string {
  return TAG_COLORS[tagName] ?? 'xml-default';
}

export const XmlBlockNode = Node.create({
  name: 'xmlBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      tagName: { default: '' },
      content: { default: '' },
      index: { default: '' },
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: { write: (s: string) => void; closeBlock: (n: unknown) => void }, node: { attrs: { index: string } }) {
          state.write(`%%XMLBLOCK:${node.attrs.index}%%`);
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="xmlBlock"]',
        getAttrs: (dom: HTMLElement) => {
          const raw = dom.getAttribute('data-content') || '';
          const content = raw
            .replace(/&#10;/g, '\n')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&');
          return {
            tagName: dom.getAttribute('data-tag-name') || '',
            content,
            index: dom.getAttribute('data-index') || '',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      {
        'data-type': 'xmlBlock',
        class: 'xml-block',
        ...HTMLAttributes,
      },
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      const colorClass = getColorClass(node.attrs.tagName);
      dom.className = `xml-block ${colorClass}`;
      dom.setAttribute('data-type', 'xmlBlock');

      let expanded = false;

      const render = () => {
        dom.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'xml-header';
        header.textContent = expanded
          ? `<${node.attrs.tagName}>`
          : `<${node.attrs.tagName}>...</${node.attrs.tagName}>`;
        dom.appendChild(header);

        if (expanded) {
          const content = document.createElement('div');
          content.className = 'xml-content';
          content.textContent = node.attrs.content;
          dom.appendChild(content);
        }
      };

      dom.addEventListener('click', () => {
        expanded = !expanded;
        render();
      });

      render();

      return { dom };
    };
  },
});
