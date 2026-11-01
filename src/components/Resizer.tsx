import { useEffect, useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';

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
  // 拖拽期间监听器里不能用 React state：pointerdown 挂上去的监听器捕获的是
  // 当时的闭包，state 每帧更新后监听器还拿着旧 size，宽度就会卡在原地
  // （"看得见分隔条但拖不动"）。改记起点坐标，全程用 clientX 差值算，零依赖 state。
  const dragStartRef = useRef<{ x: number; size: number } | null>(null);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const delta = side === 'left' ? dx : -dx;
      const next = Math.min(max, Math.max(min, start.size + delta));
      onResize(next);
    },
    [onResize, side, min, max]
  );

  const onPointerUp = useCallback(() => {
    dragStartRef.current = null;
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [onPointerMove]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragStartRef.current = { x: e.clientX, size };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    },
    [onPointerMove, onPointerUp, size]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      dragStartRef.current = null;
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
