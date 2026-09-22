import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, CornerDownLeft } from 'lucide-react';
import type { Command } from '../types';

interface CommandPaletteProps {
  commands: Command[];
  onClose: () => void;
}

/** 匹配打分：0 表示不匹配，分值越高排序越前 */
const scoreCommand = (cmd: Command, q: string): number => {
  if (!q) return 1;
  const title = cmd.title.toLowerCase();
  if (title.startsWith(q)) return 100;
  if (title.includes(q)) return 60;
  if (cmd.category.toLowerCase().includes(q)) return 30;
  if (cmd.id.toLowerCase().includes(q)) return 20;
  return 0;
};

/** 分类色点：由分类名派生稳定色相，避免每个分类维护图标映射 */
const categoryColor = (category: string): string => {
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = (hash * 31 + category.charCodeAt(i)) | 0;
  }
  return `hsl(${Math.abs(hash) % 360} 62% 58%)`;
};

export const CommandPalette = ({ commands, onClose }: CommandPaletteProps) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of commands) counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  }, [commands]);

  const query_l = query.trim().toLowerCase();

  const filteredCommands = useMemo(() => {
    let list = commands;
    if (activeCategory) list = list.filter(c => c.category === activeCategory);
    if (!query_l) return list;
    return list
      .map(cmd => ({ cmd, score: scoreCommand(cmd, query_l) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.cmd);
  }, [commands, activeCategory, query_l]);

  useEffect(() => {
    setSelectedIndex(0);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [query, activeCategory]);

  // 键盘越界时把选中项滚回可视区
  useEffect(() => {
    const el = listRef.current?.querySelector('.selected');
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, filteredCommands.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => (filteredCommands.length ? (i + 1) % filteredCommands.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => (filteredCommands.length ? (i - 1 + filteredCommands.length) % filteredCommands.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filteredCommands[selectedIndex];
      if (cmd) {
        cmd.action();
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Backspace' && !query && activeCategory) {
      // 输入框为空时退格退回「全部分类」
      e.preventDefault();
      setActiveCategory(null);
    }
  };

  const runCommand = (cmd: Command) => {
    cmd.action();
    onClose();
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="命令面板"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-box command-palette-box">
        <div className="command-palette-input">
          <Search size={16} className="command-palette-search-icon" />
          <input
            ref={inputRef}
            className="command-palette-field"
            type="text"
            placeholder="搜索命令…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-expanded
            aria-controls="command-palette-list"
          />
          <kbd className="command-palette-esc">Esc</kbd>
        </div>

        {categories.length > 1 && (
          <div className="command-palette-chips" role="tablist" aria-label="命令分类">
            <button
              role="tab"
              aria-selected={activeCategory === null}
              className={`command-chip${activeCategory === null ? ' active' : ''}`}
              onClick={() => setActiveCategory(null)}
            >
              全部 <span className="command-chip-count">{commands.length}</span>
            </button>
            {categories.map(({ name, count }) => (
              <button
                key={name}
                role="tab"
                aria-selected={activeCategory === name}
                className={`command-chip${activeCategory === name ? ' active' : ''}`}
                onClick={() => setActiveCategory(activeCategory === name ? null : name)}
              >
                <i className="command-chip-dot" style={{ background: categoryColor(name) }} />
                {name} <span className="command-chip-count">{count}</span>
              </button>
            ))}
          </div>
        )}

        <div className="modal-list" id="command-palette-list" ref={listRef} role="listbox">
          {filteredCommands.length === 0 ? (
            <div className="command-palette-empty">
              没有匹配的命令
              {activeCategory && (
                <button className="command-palette-reset" onClick={() => { setActiveCategory(null); setQuery(''); }}>
                  清除筛选
                </button>
              )}
            </div>
          ) : (
            filteredCommands.map((cmd, index) => (
              <button
                key={cmd.id}
                role="option"
                aria-selected={index === selectedIndex}
                className={`modal-list-item${index === selectedIndex ? ' selected' : ''}`}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => runCommand(cmd)}
              >
                <i className="command-item-dot" style={{ background: categoryColor(cmd.category) }} />
                <span className="command-item-title">{cmd.title}</span>
                <span className="modal-list-item-category">{cmd.category}</span>
                {cmd.shortcut && <span className="modal-list-item-shortcut">{cmd.shortcut}</span>}
              </button>
            ))
          )}
        </div>

        <div className="command-palette-footer">
          <span>
            <CornerDownLeft size={12} /> 执行
          </span>
          <span>↑↓ 选择</span>
          <span>{filteredCommands.length} 项</span>
        </div>
      </div>
    </div>
  );
};
