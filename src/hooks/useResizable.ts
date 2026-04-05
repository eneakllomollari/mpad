import { useCallback, useEffect, useRef, useState } from 'react';

type Direction = 'horizontal' | 'vertical';

interface UseResizableOptions {
  direction: Direction;
  initialSize: number;
  minSize?: number;
  maxSize?: number;
  /** For horizontal: 'left' means drag on right edge, 'right' means drag on left edge */
  side?: 'left' | 'right' | 'top' | 'bottom';
}

const KEYBOARD_STEP = 20;

export function useResizable({
  direction,
  initialSize,
  minSize = 120,
  maxSize = 800,
  side = 'left',
}: UseResizableOptions) {
  const [size, setSize] = useState(initialSize);
  const dragging = useRef(false);
  const startPos = useRef(0);
  const startSize = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
      startSize.current = size;
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    },
    [direction, size],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const invert = side === 'right' || side === 'bottom';
      let delta = 0;

      if (direction === 'horizontal') {
        if (e.key === 'ArrowLeft') delta = -KEYBOARD_STEP;
        else if (e.key === 'ArrowRight') delta = KEYBOARD_STEP;
      } else {
        if (e.key === 'ArrowUp') delta = -KEYBOARD_STEP;
        else if (e.key === 'ArrowDown') delta = KEYBOARD_STEP;
      }

      if (delta === 0) return;
      e.preventDefault();
      const adjusted = invert ? -delta : delta;
      setSize((s) => Math.max(minSize, Math.min(maxSize, s + adjusted)));
    },
    [direction, minSize, maxSize, side],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const pos = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = pos - startPos.current;
      const invert = side === 'right' || side === 'bottom';
      const newSize = startSize.current + (invert ? -delta : delta);
      setSize(Math.max(minSize, Math.min(maxSize, newSize)));
    };

    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [direction, minSize, maxSize, side]);

  const ariaProps = {
    role: 'separator' as const,
    'aria-orientation': (direction === 'horizontal' ? 'vertical' : 'horizontal') as 'vertical' | 'horizontal',
    'aria-valuenow': size,
    'aria-valuemin': minSize,
    'aria-valuemax': maxSize,
    'aria-label': `Resize ${direction === 'horizontal' ? 'panel width' : 'panel height'}`,
    tabIndex: 0,
  };

  return { size, onMouseDown, onKeyDown, ariaProps };
}
