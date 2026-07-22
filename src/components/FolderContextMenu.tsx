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
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, [onClose]);

  return (
    <div
      className="context-menu"
      style={{ left: x, top: y }}
      onClick={handleClickOutside}
    >
      {type === 'empty' && (
        <>
          <button className="context-menu-item" onClick={(e) => { e.stopPropagation(); onNewFile(); }}>
            <FileText size={16} />
            <span>New File</span>
          </button>
          <button className="context-menu-item" onClick={(e) => { e.stopPropagation(); onNewFolder(); }}>
            <FolderPlus size={16} />
            <span>New Folder</span>
          </button>
        </>
      )}

      {type === 'file' && (
        <>
          <button className="context-menu-item" onClick={(e) => { e.stopPropagation(); onRename(); }}>
            <Edit3 size={16} />
            <span>Rename</span>
          </button>
          <div className="context-menu-divider"></div>
          <button className="context-menu-item danger" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <Trash2 size={16} />
            <span>Delete</span>
          </button>
        </>
      )}

      {type === 'folder' && (
        <>
          <button className="context-menu-item" onClick={(e) => { e.stopPropagation(); onNewFile(); }}>
            <FileText size={16} />
            <span>New File</span>
          </button>
          <button className="context-menu-item" onClick={(e) => { e.stopPropagation(); onNewFolder(); }}>
            <FolderPlus size={16} />
            <span>New Folder</span>
          </button>
          <div className="context-menu-divider"></div>
          <button className="context-menu-item" onClick={(e) => { e.stopPropagation(); onRename(); }}>
            <Edit3 size={16} />
            <span>Rename</span>
          </button>
          <button className="context-menu-item danger" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <Trash2 size={16} />
            <span>Delete</span>
          </button>
        </>
      )}
    </div>
  );
};
