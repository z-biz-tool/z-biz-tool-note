import React, { useState, useMemo } from 'react';
import { Hash, ChevronRight, ChevronDown, Folder, Search } from 'lucide-react';
import type { Tag } from '../types';
import {
  MAX_VISIBLE_TAGS,
  buildTagTree,
  countVisibleRows,
  filterTags,
  flattenTagRows,
  isNodeActive,
} from '../lib/tagTree';

interface TagsPanelProps {
  tags: Tag[];
  onTagClick: (tag: string) => void;
  activeTag?: string | null;
}

export const TagsPanel = React.memo(({ tags, onTagClick, activeTag }: TagsPanelProps) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [showAll, setShowAll] = useState(false);

  // 过滤在**建树前**做：搜不到标签就别为它建节点。
  // 否则一万个标签会先建出一万个节点再被丢掉，白白浪费一次建树 + 聚合计数。
  const filteredTags = useMemo(() => filterTags(tags, filter), [tags, filter]);

  const tree = useMemo(() => buildTagTree(filteredTags), [filteredTags]);

  // 可见行（尊重折叠状态）总数 —— 「显示全部 N 行」里的那个 N。
  const totalRows = useMemo(
    () => countVisibleRows(tree, collapsed),
    [tree, collapsed]
  );

  /**
   * 渲染预算：一次最多铺 MAX_VISIBLE_TAGS 行 DOM。
   *
   * Why: 一万个标签行铺成 DOM，光布局就要几百 ms，点标签时父组件 setState
   * ⇒ 浏览器重排上万个节点 ⇒ 主线程占满 ⇒ 白屏。
   * 预算耗尽后停止遍历，剩下的靠过滤框找（数据没丢，只是没铺到 DOM）。
   */
  const rows = useMemo(
    () => flattenTagRows(tree, collapsed, showAll ? Infinity : MAX_VISIBLE_TAGS),
    [tree, collapsed, showAll]
  );

  const toggleCollapse = (path: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  if (tags.length === 0) {
    return (
      <div className="sidebar-empty">
        <p>还没有标签</p>
        <p className="hint">在笔记里写 #标签 即可归类</p>
        <p className="hint">用 #父级/子级 可以建嵌套标签</p>
      </div>
    );
  }

  return (
    <div className="tags-tree">
      <div className="tag-filter">
        <Search size={13} className="tag-filter-icon" />
        <input
          className="tag-filter-input"
          value={filter}
          placeholder="筛选标签…"
          onChange={e => setFilter(e.target.value)}
        />
        {filter && (
          <button className="tag-filter-clear" onClick={() => setFilter('')} title="清空筛选">
            ×
          </button>
        )}
      </div>
      {filteredTags.length === 0 ? (
        <div className="sidebar-empty">
          <p>没有匹配「{filter}」的标签</p>
        </div>
      ) : (
        <>
          {rows.map(({ node, depth }) => {
            const isCollapsed = collapsed.has(node.fullPath);
            const hasChildren = node.children.size > 0;
            const active = isNodeActive(node, activeTag);
            const count = node.aggregatedCount;

            return (
              <div key={node.fullPath}>
                <button
                  className={`tag-tree-item ${active ? 'active' : ''}`}
                  style={{ paddingLeft: `${8 + depth * 14}px` }}
                  onClick={() => onTagClick(node.fullPath)}
                  title={`${count} note${count > 1 ? 's' : ''} (含子标签)`}
                >
                  {hasChildren ? (
                    <span
                      className="tag-tree-caret"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCollapse(node.fullPath);
                      }}
                    >
                      {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    </span>
                  ) : (
                    <span className="tag-tree-caret" style={{ visibility: 'hidden' }}>
                      <ChevronRight size={12} />
                    </span>
                  )}
                  {hasChildren ? <Folder size={12} /> : <Hash size={12} />}
                  <span className="tag-tree-label">{node.name}</span>
                  <span className="tag-count">{count}</span>
                </button>
              </div>
            );
          })}
          {totalRows > MAX_VISIBLE_TAGS && !showAll && (
            <button className="tag-more-btn" onClick={() => setShowAll(true)}>
              显示全部 {totalRows} 行（当前只铺前 {MAX_VISIBLE_TAGS} 行）
            </button>
          )}
        </>
      )}
    </div>
  );
});
