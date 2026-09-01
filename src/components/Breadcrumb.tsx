import React, { useState, useRef, useEffect } from 'react';
import { ChevronRight, FileText, Hash, Maximize2 } from 'lucide-react';
import type { HeadingItem } from '../types';

interface BreadcrumbProps {
  filePath: string;             // 笔记完整路径
  noteTitle: string;            // 笔记标题
  headings: HeadingItem[];      // 当前笔记的所有标题
  activeHeadingId: string | null; // 当前光标所在标题 id
  onHeadingClick: (pos: number) => void; // 点击标题段时跳转
}

// 顶部面包屑：[文件夹] / [子文件夹] / [笔记标题] / [当前 # 标题]
// 文件夹/笔记段为静态展示，标题段可点击跳转。
export const Breadcrumb = React.memo(({
  filePath,
  noteTitle,
  headings,
  activeHeadingId,
  onHeadingClick,
}: BreadcrumbProps) => {
  const [showAllHeadings, setShowAllHeadings] = useState(false);
  const breadcrumbRef = useRef<HTMLDivElement>(null);
  
  // 从路径中解析文件夹层级（去掉文件名）
  const segments = filePath
    ? filePath.split('/').filter(Boolean).slice(0, -1) // 末尾是文件名，丢弃
    : [];

  // 当前激活的标题对象
  const activeHeading = activeHeadingId
    ? headings.find(h => h.id === activeHeadingId) || null
    : null;
    
  // 显示所有标题的下拉菜单
  const [showHeadingsMenu, setShowHeadingsMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowHeadingsMenu(false);
      }
    };
    if (showHeadingsMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showHeadingsMenu]);

  return (
    <div className="breadcrumb-bar" role="navigation" ref={breadcrumbRef}>
      <div className="breadcrumb-segments">
        {segments.length === 0 && !noteTitle ? (
          <span className="breadcrumb-segment muted">未打开文件</span>
        ) : (
          <>
            {segments.map((seg, i) => (
              <span className="breadcrumb-segment muted" key={`folder-${i}-${seg}`} title={seg}>
                <span className="breadcrumb-text">{seg}</span>
                <ChevronRight size={12} className="breadcrumb-sep" />
              </span>
            ))}
            {noteTitle && (
              <span className="breadcrumb-segment current-file" title={noteTitle}>
                <FileText size={12} />
                <span className="breadcrumb-text">{noteTitle}</span>
                {headings.length > 0 && activeHeading && <ChevronRight size={12} className="breadcrumb-sep" />}
              </span>
            )}
            {headings.length > 0 && (
              <div className="breadcrumb-headings-menu" ref={menuRef}>
                <button
                  className={`breadcrumb-segment breadcrumb-heading ${showHeadingsMenu ? 'active' : ''}`}
                  onClick={() => setShowHeadingsMenu(!showHeadingsMenu)}
                  title={activeHeading ? `跳转到: ${activeHeading.text}` : '选择标题'}
                >
                  {activeHeading ? (
                    <>
                      <Hash size={12} />
                      <span className="breadcrumb-text">{activeHeading.text}</span>
                    </>
                  ) : (
                    <Maximize2 size={12} />
                  )}
                </button>
                {showHeadingsMenu && (
                  <div className="breadcrumb-headings-dropdown" onClick={(e) => e.stopPropagation()}>
                    {headings.map((heading) => (
                      <button
                        key={heading.id}
                        className={`breadcrumb-headings-item ${activeHeadingId === heading.id ? 'active' : ''}`}
                        onClick={() => {
                          onHeadingClick(heading.pos);
                          setShowHeadingsMenu(false);
                        }}
                        title={heading.text}
                        style={{ paddingLeft: `${12 + (heading.level - 1) * 16}px` }}
                      >
                        {heading.text}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});