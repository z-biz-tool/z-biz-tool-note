import { useState, useEffect, useRef } from 'react';
import { Command as CommandIcon } from 'lucide-react';
import type { Command } from '../types';

// 渐变色主题常量
const brandGradient = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
const cardBgGradient = "linear-gradient(135deg, rgba(102,126,234,0.04) 0%, rgba(118,75,162,0.04) 100%)";

interface CommandPaletteProps {
  commands: Command[];
  onClose: () => void;
}

export const CommandPalette = ({ commands, onClose }: CommandPaletteProps) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filteredCommands, setFilteredCommands] = useState<Command[]>(commands);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  
  // 支持命令分类过滤
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  
  // 过滤命令
  useEffect(() => {
    let filtered = commands.filter(
      (c) =>
        c.title.toLowerCase().includes(query.toLowerCase()) ||
        c.category.toLowerCase().includes(query.toLowerCase())
    );
    
    if (activeCategory) {
      filtered = filtered.filter(c => c.category === activeCategory);
    }
    
    setFilteredCommands(filtered);
  }, [query, activeCategory, commands]);

  useEffect(() => {
    setSelectedIndex(0);
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [query, activeCategory]);

  useEffect(() => {
    const el = listRef.current?.querySelector('.selected');
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);
  
  // 获取唯一的分类列表
  const categories = [...new Set(commands.map(c => c.category))];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, Math.max(filteredCommands.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
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
      <div 
        className="modal-box"
        style={{
          background: cardBgGradient,
          borderRadius: 16,
          boxShadow: "0 8px 24px rgba(102,126,234,0.3)",
          overflow: "hidden",
          width: "90%",
          maxWidth: 500,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <input
          ref={inputRef}
          className="modal-input"
          type="text"
          placeholder="Type a command..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            padding: "16px 20px",
            fontSize: 15,
            border: "none",
            outline: "none",
            background: "transparent",
            borderBottom: `1px solid rgba(102,126,234,0.1)`,
          }}
        />
        <div className="modal-list" ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {filtered.length === 0 ? (
            <div className="modal-list-item">No commands found</div>
          ) : (
            filtered.map((cmd, index) => (
              <button
                key={cmd.id}
                className={`modal-list-item${
                  filtered[selectedIndex]?.id === cmd.id ? ' selected' : ''
                }`}
                onClick={() => {
                  cmd.action();
                  onClose();
                }}
                style={{
                  margin: "2px 8px",
                  padding: "10px 16px",
                  borderRadius: 8,
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  background: filtered[selectedIndex]?.id === cmd.id ? brandGradient : 'transparent',
                  boxShadow: filtered[selectedIndex]?.id === cmd.id ? "0 4px 12px rgba(102,126,234,0.3)" : "none",
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
