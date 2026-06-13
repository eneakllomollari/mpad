// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { TitleBar } from '../src/components/TitleBar';
import { StatusBar } from '../src/components/StatusBar';
import { CommandPalette } from '../src/components/CommandPalette';
import React from 'react';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('TitleBar component', () => {
  it('renders with data-tauri-drag-region attribute', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    
    const root = createRoot(container);
    root.render(<TitleBar />);
    
    // Wait for React to render
    await new Promise((resolve) => setTimeout(resolve, 0));
    
    const titlebar = container.querySelector('.titlebar');
    expect(titlebar).not.toBeNull();
    expect(titlebar?.hasAttribute('data-tauri-drag-region')).toBe(true);
    
    root.unmount();
    document.body.removeChild(container);
  });
});

describe('CommandPalette component', () => {
  it('does not execute or close disabled commands', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const root = createRoot(container);
    const action = vi.fn();
    const onClose = vi.fn();
    HTMLElement.prototype.scrollIntoView = vi.fn();

    await act(async () => {
      root.render(
        <CommandPalette
          commands={[
            {
              id: 'save',
              label: 'Save changes',
              shortcut: '⌘S',
              action,
              disabled: true,
              disabledReason: 'No document selected',
            },
          ]}
          files={[]}
          repoPath={null}
          onFileSelect={() => {}}
          onClose={onClose}
        />,
      );
      await Promise.resolve();
    });

    const input = container.querySelector('input') as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setValue?.call(input, 'save');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });

    const option = container.querySelector('[role="option"]') as HTMLElement;
    expect(option.getAttribute('aria-disabled')).toBe('true');

    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(action).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    document.body.removeChild(container);
  });
});

describe('StatusBar component', () => {
  it('renders file, mode, save, and git context', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <StatusBar
          filePath="/tmp/notes/demo.md"
          repoPath="/tmp/notes"
          fileStatus={{ branch: 'main', status: 'modified' }}
          saveStatus="pending"
          showSource={true}
        />,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain('demo.md');
    expect(container.textContent).toContain('Markdown source');
    expect(container.textContent).toContain('Unsaved changes');
    expect(container.textContent).toContain('main · Edited');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    document.body.removeChild(container);
  });
});
