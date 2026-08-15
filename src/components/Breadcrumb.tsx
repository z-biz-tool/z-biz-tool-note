import React from 'react';
import { ChevronRight, FileText, Hash } from 'lucide-react';
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
  // 从路径中解析文件夹层级（去掉文件名）
  const segments = filePath
    ? filePath.split('/').filter(Boolean).slice(0, -1) // 末尾是文件名，丢弃
    : [];

  // 当前激活的标题对象
  const activeHeading = activeHeadingId
    ? headings.find(h => h.id === activeHeadingId) || null
    : null;

  return (
    <div className="breadcrumb-bar" role="navigation">
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
                {activeHeading && <ChevronRight size={12} className="breadcrumb-sep" />}
              </span>
            )}
            {activeHeading && (
              <button
                className="breadcrumb-segment breadcrumb-heading"
                onClick={() => onHeadingClick(activeHeading.pos)}
                title={`跳转到此处: ${activeHeading.text}`}
              >
                <Hash size={12} />
                <span className="breadcrumb-text">{activeHeading.text}</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
});