import { useState, useEffect, useRef } from 'react';
import { FileText } from 'lucide-react';

interface QuickSwitcherProps {
  files: Array<{ path: string; name: string; lastModified?: number }>;
  onSelect: (filePath: string) => void;
  onClose: () => void;
}

export const QuickSwitcher = ({ files, onSelect, onClose }: QuickSwitcherProps) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sortedFiles = [...files].sort((a, b) => {
    if (a.lastModified && b.lastModified) {
      return b.lastModified - a.lastModified;
    }
    return 0;
  });

  const filtered = sortedFiles.filter(
    (f) =>
      f.name.toLowerCase().includes(query.toLowerCase()) ||
      f.path.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector('.selected');
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        onSelect(filtered[selectedIndex].path);
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay quick-switcher-overlay" role="dialog" aria-modal="true" aria-label="快速切换" onClick={handleOverlayClick}>
      <div className="modal-box">
        <input
          ref={inputRef}
          className="modal-input"
          type="text"
          placeholder="Search files..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="modal-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="modal-list-item">No files found</div>
          ) : (
            filtered.map((file, i) => (
              <button
                key={file.path}
                className={`modal-list-item${i === selectedIndex ? ' selected' : ''}`}
                onClick={() => {
                  onSelect(file.path);
                  onClose();
                }}
              >
                <span className="modal-list-item-icon">
                  <FileText size={16} />
                </span>
                <span>{file.name}</span>
                <span className="modal-list-item-shortcut">{file.path}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
