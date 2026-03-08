// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createRoot } from 'react-dom/client';
import { TitleBar } from '../src/components/TitleBar';
import React from 'react';

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
