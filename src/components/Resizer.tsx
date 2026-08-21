import { useEffect, useCallback, type PointerEvent as ReactPointerEvent } from 'react';

interface ResizerProps {
  /** Current size in px */
  size: number;
  /** Called on every drag move with the proposed new size */
  onResize: (size: number) => void;
  /** 'left' = drag the right edge of a left-side panel (e.g. sidebar) */
  /** 'right' = drag the left edge of a right-side panel (e.g. outline) */
  side: 'left' | 'right';
  /** Min/max bounds in px */
  min?: number;
  max?: number;
}

/**
 * Thin vertical drag handle placed between two flex columns.
 * - side="left"   → dragging right increases size
 * - side="right"  → dragging left  increases size
 */
export const Resizer = ({ size, onResize, side, min = 160, max = 600 }: ResizerProps) => {
  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const dx = e.movementX;
      if (dx === 0) return;
      const delta = side === 'left' ? dx : -dx;
      const next = Math.min(max, Math.max(min, size + delta));
      onResize(next);
    },
    [onResize, side, size, min, max]
  );

  const onPointerUp = useCallback(() => {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [onPointerMove]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    },
    [onPointerMove, onPointerUp]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [onPointerMove, onPointerUp]);

  return (
    <div
      className={`resizer resizer-${side}`}
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={size}
      aria-valuemin={min}
      aria-valuemax={max}
    />
  );
};