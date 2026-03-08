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

      let expanded = false;

      const render = () => {
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

      dom.addEventListener('click', () => {
        expanded = !expanded;
        render();
      });

      render();

      return { dom };
    };
  },
});
