import { Node } from '@tiptap/react';
import mermaid from 'mermaid';

let lastTheme: string | null = null;

const THEME_VARS = {
  dark: {
    primaryColor: '#3a2e28', primaryTextColor: '#d4d0ca', primaryBorderColor: '#5c4a3e',
    secondaryColor: '#2e2a22', secondaryTextColor: '#d4d0ca', secondaryBorderColor: '#4a3e34',
    tertiaryColor: '#342e26', tertiaryTextColor: '#d4d0ca', tertiaryBorderColor: '#5c4a3e',
    lineColor: '#6b5d52', textColor: '#d4d0ca', mainBkg: '#3a2e28', nodeBorder: '#5c4a3e',
    clusterBkg: '#2e2a22', clusterBorder: '#4a3e34', titleColor: '#ece8e2',
    edgeLabelBackground: '#242320', nodeTextColor: '#d4d0ca', background: '#1c1b19',
    fontFamily: 'Instrument Sans Variable, Instrument Sans, DM Sans, -apple-system, sans-serif', fontSize: '14px',
  },
  light: {
    primaryColor: '#f5ebe4', primaryTextColor: '#2c2825', primaryBorderColor: '#c4a48c',
    secondaryColor: '#faf2ec', secondaryTextColor: '#2c2825', secondaryBorderColor: '#d4bca8',
    tertiaryColor: '#f0e6dc', tertiaryTextColor: '#2c2825', tertiaryBorderColor: '#c4a48c',
    lineColor: '#a09080', textColor: '#2c2825', mainBkg: '#f5ebe4', nodeBorder: '#c4a48c',
    clusterBkg: '#faf5f0', clusterBorder: '#d4bca8', titleColor: '#1a1715',
    edgeLabelBackground: '#faf8f5', nodeTextColor: '#2c2825', background: '#faf8f5',
    fontFamily: 'Instrument Sans Variable, Instrument Sans, DM Sans, -apple-system, sans-serif', fontSize: '14px',
  },
};

function ensureMermaidInit(dark: boolean) {
  const key = dark ? 'dark' : 'light';
  if (lastTheme === key) return;
  lastTheme = key;

  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    suppressErrorRendering: true,
    themeVariables: THEME_VARS[key],
  });
}

export const MermaidNode = Node.create({
  name: 'mermaidBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      code: { default: '' },
      index: { default: '' },
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write: (s: string) => void; closeBlock: (n: unknown) => void },
          node: { attrs: { index: string } },
        ) {
          state.write(`%%MERMAID:${node.attrs.index}%%`);
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="mermaidBlock"]',
        getAttrs: (dom: HTMLElement) => {
          const raw = dom.getAttribute('data-code') || '';
          const code = raw
            .replace(/&#10;/g, '\n')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&');
          return {
            code,
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
        'data-type': 'mermaidBlock',
        class: 'mermaid-block',
        ...HTMLAttributes,
      },
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.className = 'mermaid-block';
      dom.setAttribute('data-type', 'mermaidBlock');

      let showSource = false;
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      ensureMermaidInit(isDark);

      const render = async () => {
        dom.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'mermaid-header';

        const label = document.createElement('span');
        label.className = 'mermaid-label';
        label.textContent = 'mermaid';

        const toggle = document.createElement('span');
        toggle.className = 'mermaid-toggle';
        toggle.textContent = showSource ? 'diagram' : 'source';
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          showSource = !showSource;
          render();
        });

        header.appendChild(label);
        header.appendChild(toggle);
        dom.appendChild(header);

        if (showSource) {
          const pre = document.createElement('pre');
          pre.className = 'mermaid-source';
          const code = document.createElement('code');
          code.textContent = node.attrs.code;
          pre.appendChild(code);
          dom.appendChild(pre);
        } else {
          const container = document.createElement('div');
          container.className = 'mermaid-diagram';
          try {
            const id = `mermaid-${node.attrs.index}-${Date.now()}`;
            const { svg } = await mermaid.render(id, node.attrs.code);
            container.innerHTML = svg;
          } catch {
            container.classList.add('mermaid-error');
            container.textContent = 'Failed to render diagram';
          }
          dom.appendChild(container);
        }
      };

      render();

      return { dom };
    };
  },
});
