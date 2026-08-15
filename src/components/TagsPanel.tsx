import React, { useState, useMemo } from 'react';
import { Hash, ChevronRight, ChevronDown, Folder } from 'lucide-react';
import type { Tag } from '../types';

interface TagsPanelProps {
  tags: Tag[];
  onTagClick: (tag: string) => void;
  activeTag?: string | null;
}

// 标签树节点：构建 work/project-a / work/project-b 这样的层级
interface TagTreeNode {
  name: string;          // 当前段名称，例如 project-a
  fullPath: string;      // 完整路径，例如 work/project-a
  ownNotes: string[];    // 自身笔记路径
  children: Map<string, TagTreeNode>;
  aggregatedCount: number; // 自身 + 所有后代笔记的去重数量
}

export const TagsPanel = React.memo(({ tags, onTagClick, activeTag }: TagsPanelProps) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // 将扁平 tag 列表构建为树（按 / 分割路径），并预计算聚合 count
  const tree = useMemo(() => {
    const root: TagTreeNode = {
      name: '',
      fullPath: '',
      ownNotes: [],
      children: new Map(),
      aggregatedCount: 0,
    };

    for (const t of tags) {
      const segments = t.name.split('/').filter(Boolean);
      let node = root;
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const isLast = i === segments.length - 1;
        if (!node.children.has(seg)) {
          node.children.set(seg, {
            name: seg,
            fullPath: segments.slice(0, i + 1).join('/'),
            ownNotes: [],
            children: new Map(),
            aggregatedCount: 0,
          });
        }
        node = node.children.get(seg)!;
        if (isLast) {
          // 叶子节点：累积笔记
          node.ownNotes = t.notes;
        }
      }
    }

    // 后序遍历计算 aggregatedCount（自身 + 所有后代去重）
    const compute = (n: TagTreeNode): Set<string> => {
      const noteSet = new Set<string>(n.ownNotes);
      n.children.forEach(c => {
        compute(c).forEach(p => noteSet.add(p));
      });
      n.aggregatedCount = noteSet.size;
      return noteSet;
    };
    compute(root);

    return root;
  }, [tags]);

  if (tags.length === 0) {
    return (
      <div className="sidebar-empty">
        <p>No tags yet</p>
        <p className="hint">Use #tag in your notes to organize them</p>
        <p className="hint">Use #parent/child for nested tags (Bear-style)</p>
      </div>
    );
  }

  const toggleCollapse = (path: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  // 判断节点是否处于激活状态（自身或任意后代被选中）
  const isNodeActive = (node: TagTreeNode): boolean => {
    if (!activeTag) return false;
    if (node.fullPath === activeTag) return true;
    return activeTag.startsWith(node.fullPath + '/');
  };

  const renderNode = (node: TagTreeNode, depth: number): React.ReactNode => {
    const childArr = Array.from(node.children.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'zh-CN')
    );
    return childArr.map(child => {
      const isCollapsed = collapsed.has(child.fullPath);
      const hasChildren = child.children.size > 0;
      const active = isNodeActive(child);
      const count = child.aggregatedCount;

      return (
        <div key={child.fullPath}>
          <button
            className={`tag-tree-item ${active ? 'active' : ''}`}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            onClick={() => onTagClick(child.fullPath)}
            title={`${count} note${count > 1 ? 's' : ''} (含子标签)`}
          >
            {hasChildren ? (
              <span
                className="tag-tree-caret"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCollapse(child.fullPath);
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
            <span className="tag-tree-label">{child.name}</span>
            <span className="tag-count">{count}</span>
          </button>
          {hasChildren && !isCollapsed && renderNode(child, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div className="tags-tree">
      {renderNode(tree, 0)}
    </div>
  );
});