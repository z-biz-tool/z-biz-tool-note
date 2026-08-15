import { useState, useEffect, useRef } from 'react';
import { Command as CommandIcon } from 'lucide-react';
import type { Command } from '../types';

interface CommandPaletteProps {
  commands: Command[];
  onClose: () => void;
}

export const CommandPalette = ({ commands, onClose }: CommandPaletteProps) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = commands.filter(
    (c) =>
      c.title.toLowerCase().includes(query.toLowerCase()) ||
      c.category.toLowerCase().includes(query.toLowerCase())
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
        filtered[selectedIndex].action();
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
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="命令面板" onClick={handleOverlayClick}>
      <div className="modal-box">
        <input
          ref={inputRef}
          className="modal-input"
          type="text"
          placeholder="Type a command..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="modal-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="modal-list-item">No commands found</div>
          ) : (
            filtered.map((cmd) => (
              <button
                key={cmd.id}
                className={`modal-list-item${
                  filtered[selectedIndex]?.id === cmd.id ? ' selected' : ''
                }`}
                onClick={() => {
                  cmd.action();
                  onClose();
                }}
              >
                <span className="modal-list-item-icon">
                  <CommandIcon size={16} />
                </span>
                <span>{cmd.title}</span>
                <span className="modal-list-item-category">{cmd.category}</span>
                {cmd.shortcut && (
                  <span className="modal-list-item-shortcut">{cmd.shortcut}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
