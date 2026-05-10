import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'src-tauri', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['gray-matter'],
            message: 'gray-matter breaks on lone "---". Use the strict regex in contentProcessing.ts.',
          },
          {
            group: ['lodash', 'underscore', 'ramda'],
            message: 'Heavy utility libraries bloat the bundle. Use native JS methods.',
          },
          {
            group: ['moment', 'moment-timezone'],
            message: 'moment.js is 300kb+. Use Intl or date-fns/tiny if needed.',
          },
          {
            group: ['mermaid', 'mermaid/*'],
            message: 'mermaid is heavy (pulls in d3, cytoscape, katex, etc). Use dynamic import() inside MermaidNode.ts to keep it out of the main bundle.',
          },
          {
            group: ['dompurify', 'dompurify/*'],
            message: 'DOMPurify is only used in MermaidNode for SVG sanitization. Lazy-load it with mermaid via dynamic import().',
          },
          {
            group: ['framer-motion', 'framer-motion/*'],
            message: 'framer-motion is heavy. Use CSS transitions/animations (see panel-side and palette-pop-in patterns in editor.css).',
          },
        ],
        paths: [
          {
            name: '@tauri-apps/plugin-fs',
            importNames: ['readTextFile', 'readFile', 'writeTextFile', 'writeFile'],
            message: 'Use invoke("read_file")/invoke("write_file") Rust commands instead. FS plugin scope breaks on absolute paths.',
          },
          {
            name: '@tiptap/react',
            importNames: ['BubbleMenu'],
            message: 'Import BubbleMenu from "@tiptap/react/menus", not "@tiptap/react".',
          },
        ],
      }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error',
        {
          selector: 'CallExpression[callee.property.name="forEach"]',
          message: 'Use for...of or for loop instead of .forEach() — avoids closure allocation per iteration.',
        },
      ],
    },
  },
])
