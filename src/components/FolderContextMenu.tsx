import React from 'react';
import { FolderPlus, FileText, Trash2, Edit3, FolderInput, ChevronRight, Folder } from 'lucide-react';
import { useClampedMenuPos } from '../lib/useClampedMenuPos';

/** 一个可移入的目录；depth 用来缩进，relPath 放在 title 里指清位置 */
export interface MoveTarget {
  path: string;
  name: string;
  depth: number;
  relPath: string;
}

interface FolderContextMenuProps {
  x: number;
  y: number;
  type: 'file' | 'folder' | 'empty';
  onClose: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRename: () => void;
  onDelete: () => void;
  /** 可选的移入目录列表；undefined = 还没开始加载，null 没这个能力时不必传 */
  moveTargets?: MoveTarget[] | null;
  /** 展开子菜单时才去递归列目录：工作区可能上万文件，右键一次就全量遍历不划算 */
  onOpenMove?: () => void;
  onMoveTo?: (dirPath: string) => void;
}

interface MenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
  danger?: boolean;
  dividerBefore?: boolean;
  hasSubmenu?: boolean;
}

export const FolderContextMenu = ({
  x,
  y,
  type,
  onClose,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  moveTargets,
  onOpenMove,
  onMoveTo,
}: FolderContextMenuProps) => {
  const [moveOpen, setMoveOpen] = React.useState(false);
  // 子菜单展开会长高，位置要跟着重新收进视口，所以把展开态和内容条数一起当 key
  const { ref: menuRef, pos } = useClampedMenuPos<HTMLDivElement>(x, y, `${moveOpen}:${moveTargets?.length ?? -1}`);

  const handleClickOutside = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.context-menu')) return;
    onClose();
  };

  React.useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.context-menu')) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('click', handleGlobalClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const openMove = () => {
    setMoveOpen(true);
    onOpenMove?.();
  };

  // 三种类型只差在项的增减上：原来三段 JSX 各写一遍，改文案要改三处（英文就是这么留下的）
  const items: MenuItem[] = [];
  if (type === 'empty' || type === 'folder') {
    items.push({ key: 'new-file', label: '新建笔记', icon: <FileText size={16} />, action: onNewFile });
    items.push({ key: 'new-folder', label: '新建文件夹', icon: <FolderPlus size={16} />, action: onNewFolder });
  }
  if (type === 'file' || type === 'folder') {
    const label = (t: string) => (type === 'folder' ? `${t}文件夹` : t);
    items.push({ key: 'rename', label: label('重命名'), icon: <Edit3 size={16} />, action: onRename });
    if (onMoveTo) {
      items.push({ key: 'move', label: '移到文件夹', icon: <FolderInput size={16} />, action: openMove, hasSubmenu: true });
    }
    // 分隔线放在删除前：把破坏性动作和上面的常规动作隔开，少一次手滑。
    // 文件项不写"删除笔记"：树里 .txt/.png 同样能右键，叫"笔记"对不上（文件夹那侧仍带类型，避免和"移到文件夹"混）
    items.push({ key: 'delete', label: label('删除'), icon: <Trash2 size={16} />, action: onDelete, danger: true, dividerBefore: items.length > 0 });
  }

  return (
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      aria-label="文件操作菜单"
      style={{ left: pos.left, top: pos.top }}
      onClick={handleClickOutside}
    >
      {items.map((item, index) => (
        <React.Fragment key={item.key}>
          {item.dividerBefore && <div className="context-menu-divider" role="separator" />}
          <button
            className={`context-menu-item${item.danger ? ' danger' : ''}`}
            role="menuitem"
            tabIndex={0}
            // 焦点进到菜单里，键盘用户才能直接 Enter/方向键操作；否则还得把整棵文件树 Tab 一遍
            autoFocus={index === 0}
            aria-haspopup={item.hasSubmenu || undefined}
            aria-expanded={item.hasSubmenu ? moveOpen : undefined}
            onClick={(e) => {
              e.stopPropagation();
              item.action();
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') item.action(); }}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.hasSubmenu && <ChevronRight size={14} className={`context-menu-arrow${moveOpen ? ' open' : ''}`} />}
          </button>
          {/* 内嵌展开而不是右侧浮出：窄侧栏里浮层会被相邻面板压住，列表也看不到全貌 */}
          {item.hasSubmenu && moveOpen && (
            <div className="context-submenu" role="menu" aria-label="移到文件夹">
              {moveTargets == null ? (
                <div className="context-submenu-hint">正在列出文件夹…</div>
              ) : moveTargets.length === 0 ? (
                <div className="context-submenu-hint">没有可移入的文件夹</div>
              ) : (
                moveTargets.map(target => {
                  // 父目录被过滤掉了（已经在里面 / 是自己 / 自己的子目录）时，缩进会失去参照，
                  // 所以补一层灰色路径：只剩 "Sub" 时看不出它其实在 Examples 下
                  const parentPath = target.path.slice(0, target.path.lastIndexOf('/'));
                  const parentShown = !target.relPath.includes('/')
                    || moveTargets.some(t => t.path === parentPath);
                  return (
                  <button
                    key={target.path}
                    className="context-menu-item context-submenu-item"
                    role="menuitem"
                    title={target.relPath}
                    style={{ paddingLeft: 12 + target.depth * 14 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMoveOpen(false);
                      onMoveTo?.(target.path);
                    }}
                  >
                    <Folder size={14} />
                    <span>{target.name}</span>
                    {!parentShown && (
                      <span className="context-submenu-where">
                        {target.relPath.slice(0, target.relPath.lastIndexOf('/') + 1)}
                      </span>
                    )}
                  </button>
                  );
                })
              )}
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
