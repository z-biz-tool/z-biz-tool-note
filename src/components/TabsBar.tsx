import { useState, useEffect } from 'react';
import { X, SplitSquareHorizontal, FileText } from 'lucide-react';
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
}

// 顶部标签栏：展示所有打开的笔记；点击切换、中键或右键在分屏中打开、× 关闭
export const TabsBar = ({
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
}: TabsBarProps) => {
  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);

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
    <div className="tabs-bar">
      <div className="tabs-list">
        {tabs.map(tab => {
          const isActive = tab.id === activeId;
          const isSplitTab = tab.id === splitId;
          return (
            <div
              key={tab.id}
              className={`tab-item ${isActive ? 'active' : ''} ${isSplitTab ? 'split' : ''}`}
              onClick={() => onSelect(tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              onAuxClick={(e) => {
                // 中键点击：在分屏中打开
                if (e.button === 1) {
                  e.preventDefault();
                  onOpenInSplit(tab.id);
                }
              }}
              title={tab.filePath || tab.title}
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
        <div className="tab-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <div className="tab-context-item" onClick={() => { onClose(contextMenu.tabId); setContextMenu(null); }}>关闭标签</div>
          <div className="tab-context-item" onClick={() => { onCloseOthers?.(contextMenu.tabId); setContextMenu(null); }}>关闭其他标签</div>
          <div className="tab-context-item" onClick={() => { onCloseToRight?.(contextMenu.tabId); setContextMenu(null); }}>关闭右侧标签</div>
          <div className="tab-context-separator" />
          <div className="tab-context-item" onClick={() => { navigator.clipboard.writeText(contextMenu.tabId); setContextMenu(null); }}>复制文件路径</div>
        </div>
      )}
    </div>
  );
};
