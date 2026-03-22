// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { Editor } from '@tiptap/core';
import { FindBar } from '../src/components/FindBar';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function createEditorStub(): Editor {
  return {
    isDestroyed: false,
    storage: {
      searchHighlight: {
        query: 'needle',
        activeIndex: 0,
        totalMatches: 2,
      },
    },
    state: {
      tr: {},
    },
    view: {
      dispatch: vi.fn(),
      dom: document.createElement('div'),
    },
  } as unknown as Editor;
}

describe('FindBar activation', () => {
  let container: HTMLDivElement;
  let root: Root;
  let scrollIntoViewSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    scrollIntoViewSpy = vi.fn();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    HTMLElement.prototype.scrollIntoView = scrollIntoViewSpy;
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    document.body.removeChild(container);
    vi.unstubAllGlobals();
  });

  it('focuses and reveals the bar on every find request', async () => {
    const editor = createEditorStub();

    await act(async () => {
      root.render(<FindBar editor={editor} visible={true} activationToken={1} onClose={() => {}} />);
      await Promise.resolve();
    });

    const input = container.querySelector('.find-bar-input') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);

    input.blur();

    await act(async () => {
      root.render(<FindBar editor={editor} visible={true} activationToken={2} onClose={() => {}} />);
      await Promise.resolve();
    });

    expect(document.activeElement).toBe(input);
    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(2);
  });
});
