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
}: TabsBarProps) => {
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
    </div>
  );
};
