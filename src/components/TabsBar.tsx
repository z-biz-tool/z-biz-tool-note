import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, SplitSquareHorizontal, FileText, MoreHorizontal } from 'lucide-react';
import type { Note } from '../types';

interface TabsBarProps {
  tabs: Note[];
  activeId: string | null;
  splitId?: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onOpenInSplit: (id: string) => void;
  onToggleSplit: () => void;
  isSplit: boolean;
  onCloseOthers?: (keepId: string) => void;
  onCloseToRight?: (tabId: string) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
}

// 顶部标签栏：展示所有打开的笔记；点击切换、中键或右键在分屏中打开、× 关闭
export const TabsBar = React.memo(({
  tabs,
  activeId,
  splitId,
  onSelect,
  onClose,
  onOpenInSplit,
  onToggleSplit,
  isSplit,
  onCloseOthers,
  onCloseToRight,
  onReorder,
}: TabsBarProps) => {
  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const tabListRef = useRef<HTMLDivElement>(null);

  // 键盘导航：左右箭头切换标签
  const handleTabKeyDown = useCallback((e: React.KeyboardEvent, tabIndex: number) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const direction = e.key === 'ArrowLeft' ? -1 : 1;
      const nextIndex = (tabIndex + direction + tabs.length) % tabs.length;
      const nextTab = tabListRef.current?.children[nextIndex] as HTMLElement;
      nextTab?.focus();
      onSelect(tabs[nextIndex].id);
    }
  }, [tabs, onSelect]);
  
  // 鼠标滚轮切换标签
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const direction = e.deltaY > 0 ? 1 : -1;
      const idx = tabs.findIndex(t => t.id === activeId);
      const newIdx = (idx + direction + tabs.length) % tabs.length;
      onSelect(tabs[newIdx].id);
    }
  }, [tabs, activeId, onSelect]);
  // 拖拽排序状态
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // 拖拽排序处理
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      onReorder?.(dragIndex, index);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // 右键菜单处理
  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId });
  };

  // 点击外部关闭右键菜单
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  if (tabs.length === 0) return null;

  return (
    <div className="tabs-bar" onWheel={handleWheel}>
      <div className="tabs-list" role="tablist" ref={tabListRef}>
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeId;
          const isSplitTab = tab.id === splitId;
          const isHovered = hoveredTab === tab.id;
          return (
            <div
              key={tab.id}
              className={`tab-item ${isActive ? 'active' : ''} ${isSplitTab ? 'split' : ''} ${dragIndex === index ? 'dragging' : ''} ${dragOverIndex === index && dragIndex !== null && dragIndex < index ? 'drag-over-right' : ''} ${dragOverIndex === index && dragIndex !== null && dragIndex > index ? 'drag-over-left' : ''} ${isHovered ? 'hovered' : ''}`}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              onMouseEnter={() => setHoveredTab(tab.id)}
              onMouseLeave={() => setHoveredTab(null)}
              onAuxClick={(e) => {
                // 中键点击：在分屏中打开
                if (e.button === 1) {
                  e.preventDefault();
                  onOpenInSplit(tab.id);
                }
              }}
              title={tab.filePath || tab.title}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
            >
              <FileText size={12} className="tab-icon" />
              <span className="tab-title">{tab.title || 'Untitled'}</span>
              {tab.isDirty && <span className="tab-dirty" title="未保存">●</span>}
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
                title="关闭 (Cmd+W)"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
      <button
        className={`tab-split-btn ${isSplit ? 'active' : ''}`}
        onClick={onToggleSplit}
        title={isSplit ? '关闭分屏 (Cmd+\\)' : '水平分屏 (Cmd+\\)'}
      >
        <SplitSquareHorizontal size={14} />
      </button>

      {/* 右键菜单 */}
      {contextMenu && (
        <div className="tab-context-menu" role="menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <div className="tab-context-item" role="menuitem" tabIndex={0} onClick={() => { onClose(contextMenu.tabId); setContextMenu(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { onClose(contextMenu.tabId); setContextMenu(null); } }}>关闭标签</div>
          <div className="tab-context-item" role="menuitem" tabIndex={0} onClick={() => { onCloseOthers?.(contextMenu.tabId); setContextMenu(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { onCloseOthers?.(contextMenu.tabId); setContextMenu(null); } }}>关闭其他标签</div>
          <div className="tab-context-item" role="menuitem" tabIndex={0} onClick={() => { onCloseToRight?.(contextMenu.tabId); setContextMenu(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { onCloseToRight?.(contextMenu.tabId); setContextMenu(null); } }}>关闭右侧标签</div>
          <div className="tab-context-separator" />
          <div className="tab-context-item" role="menuitem" tabIndex={0} onClick={() => { navigator.clipboard.writeText(contextMenu.tabId); setContextMenu(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { navigator.clipboard.writeText(contextMenu.tabId); setContextMenu(null); } }}>复制文件路径</div>
        </div>
      )}
    </div>
  );
});