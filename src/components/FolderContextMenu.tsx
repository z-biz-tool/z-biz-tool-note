import React from 'react';
import { FolderPlus, FileText, Trash2, Edit3 } from 'lucide-react';

interface FolderContextMenuProps {
  x: number;
  y: number;
  type: 'file' | 'folder' | 'empty';
  onClose: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRename: () => void;
  onDelete: () => void;
}

interface MenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
  danger?: boolean;
  dividerBefore?: boolean;
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
}: FolderContextMenuProps) => {
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

  // 三种类型只差在项的增减上：原来三段 JSX 各写一遍，改文案要改三处（英文就是这么留下的）
  const items: MenuItem[] = [];
  if (type === 'empty' || type === 'folder') {
    items.push({ key: 'new-file', label: '新建笔记', icon: <FileText size={16} />, action: onNewFile });
    items.push({ key: 'new-folder', label: '新建文件夹', icon: <FolderPlus size={16} />, action: onNewFolder });
  }
  if (type === 'file' || type === 'folder') {
    const label = (t: string) => (type === 'folder' ? `${t}文件夹` : t);
    items.push({ key: 'rename', label: label('重命名'), icon: <Edit3 size={16} />, action: onRename });
    // 分隔线放在删除前：把破坏性动作和上面的常规动作隔开，少一次手滑
    items.push({ key: 'delete', label: label(type === 'folder' ? '删除' : '删除笔记'), icon: <Trash2 size={16} />, action: onDelete, danger: true, dividerBefore: items.length > 0 });
  }

  return (
    <div
      className="context-menu"
      role="menu"
      aria-label="文件操作菜单"
      style={{ left: x, top: y }}
      onClick={handleClickOutside}
    >
      {items.map(item => (
        <React.Fragment key={item.key}>
          {item.dividerBefore && <div className="context-menu-divider" role="separator" />}
          <button
            className={`context-menu-item${item.danger ? ' danger' : ''}`}
            role="menuitem"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); item.action(); }}
            onKeyDown={(e) => { if (e.key === 'Enter') item.action(); }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};
