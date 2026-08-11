import { useEffect, useState, useRef, useCallback } from 'react';
import type { Editor } from '@tiptap/react';

interface MinimapProps {
  editor: Editor | null;
  scrollContainer: HTMLDivElement | null;
}

// 右侧缩略图：镜像整篇笔记纯文本，点击跳转，高亮当前视口
export const Minimap = ({ editor, scrollContainer }: MinimapProps) => {
  const [text, setText] = useState<string>('');
  const [viewport, setViewport] = useState<{ top: number; height: number }>({ top: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const minimapRef = useRef<HTMLDivElement>(null);
  const rafId = useRef<number | null>(null);
  const textTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 计算 viewport 高亮位置（top + height）
  const recomputeViewport = useCallback(() => {
    if (!scrollContainer || !minimapRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
    const minimapHeight = minimapRef.current.clientHeight;
    if (scrollHeight <= clientHeight) {
      setViewport({ top: 0, height: minimapHeight });
      return;
    }
    const ratio = scrollTop / scrollHeight;
    const visibleRatio = clientHeight / scrollHeight;
    const top = ratio * minimapHeight;
    const height = Math.max(12, visibleRatio * minimapHeight);
    setViewport({ top, height });
  }, [scrollContainer]);

  // 滚动事件（rAF 节流）
  useEffect(() => {
    if (!scrollContainer) return;
    const onScroll = () => {
      if (rafId.current != null) return;
      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        recomputeViewport();
      });
    };
    scrollContainer.addEventListener('scroll', onScroll, { passive: true });
    const onResize = () => recomputeViewport();
    window.addEventListener('resize', onResize);
    recomputeViewport();
    return () => {
      scrollContainer.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    };
  }, [scrollContainer, recomputeViewport]);

  // 内容变更时重建文本（200ms 防抖）
  useEffect(() => {
    if (!editor) return;
    const rebuild = () => {
      if (textTimer.current) clearTimeout(textTimer.current);
      textTimer.current = setTimeout(() => {
        setText(editor.getText() || '');
        recomputeViewport();
      }, 200);
    };
    // 初次构建
    rebuild();
    editor.on('update', rebuild);
    return () => {
      editor.off('update', rebuild);
      if (textTimer.current) clearTimeout(textTimer.current);
    };
  }, [editor, recomputeViewport]);

  // 点击 minimap 跳转：将点击位置居中对齐到视口中央
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrollContainer || !minimapRef.current) return;
    const rect = minimapRef.current.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const ratio = clickY / rect.height;
    const targetScrollTop = ratio * scrollContainer.scrollHeight - scrollContainer.clientHeight / 2;
    scrollContainer.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: 'auto',
    });
  }, [scrollContainer]);

  // 拖拽视口高亮矩形：根据鼠标 Y 位置实时滚动编辑器
  const handleViewportMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }, []);

  // 拖拽中：计算鼠标在 minimap 中的位置，同步滚动编辑器
  const handleDragMove = useCallback((clientY: number) => {
    if (!scrollContainer || !minimapRef.current) return;
    const rect = minimapRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    const ratio = Math.max(0, Math.min(1, y / rect.height));
    const targetScrollTop = ratio * scrollContainer.scrollHeight - scrollContainer.clientHeight / 2;
    scrollContainer.scrollTo({
      top: Math.max(0, Math.min(scrollContainer.scrollHeight - scrollContainer.clientHeight, targetScrollTop)),
      behavior: 'auto',
    });
  }, [scrollContainer]);

  // 全局 mousemove / mouseup 事件（拖拽期间绑定到 window）
  useEffect(() => {
    if (!dragging) return;
    const onMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      handleDragMove(e.clientY);
    };
    const onMouseUp = () => {
      setDragging(false);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragging, handleDragMove]);

  if (!editor || !scrollContainer) return null;

  return (
    <div
      className="minimap"
      ref={minimapRef}
      onClick={handleClick}
      title="点击跳转到对应位置"
    >
      <div className="minimap-content">{text}</div>
      <div
        className="minimap-viewport"
        style={{ top: `${viewport.top}px`, height: `${viewport.height}px`, pointerEvents: dragging ? 'none' : 'auto', cursor: 'grab' }}
        onMouseDown={handleViewportMouseDown}
      />
    </div>
  );
};
