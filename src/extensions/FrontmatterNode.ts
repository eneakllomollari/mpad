import { Node } from '@tiptap/react';

export const FrontmatterNode = Node.create({
  name: 'frontmatter',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      content: {
        default: '',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="frontmatter"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      {
        'data-type': 'frontmatter',
        class: 'frontmatter-block',
        ...HTMLAttributes,
      },
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.classList.add('frontmatter-block');
      dom.setAttribute('data-type', 'frontmatter');
      dom.setAttribute('role', 'button');
      dom.setAttribute('tabindex', '0');
      dom.setAttribute('aria-label', 'Frontmatter block');

      let expanded = false;

      const render = () => {
        dom.setAttribute('aria-expanded', String(expanded));
        if (expanded) {
          dom.innerHTML = '';
          const content = document.createElement('div');
          content.className = 'frontmatter-expanded';
          content.textContent = node.attrs.content;
          dom.appendChild(content);
        } else {
          dom.innerHTML = '';
          const collapsed = document.createElement('div');
          collapsed.className = 'frontmatter-collapsed';
          collapsed.textContent = '--- frontmatter ---';
          dom.appendChild(collapsed);
        }
      };

      const toggle = () => {
        expanded = !expanded;
        render();
      };

      dom.addEventListener('click', toggle);
      dom.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });

      render();

      return { dom };
    };
  },
});
