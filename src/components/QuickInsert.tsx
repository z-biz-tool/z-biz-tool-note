import { useState, useEffect, useRef } from 'react';
import { FileText, Calendar, Search } from 'lucide-react';
import type { Template } from '../types';
import { applyTemplate, dailyNotePath, todayTitle } from '../lib/templates';

interface QuickInsertProps {
  open: boolean;
  templates: Template[];
  currentDir: string;
  onInsert: (content: string) => void;
  onCreateDaily: (path: string, content: string) => void;
  onClose: () => void;
}

/** 列表里的一行：日记那条是固定的第一行，不参与搜索过滤 */
type Row = { kind: 'daily' } | { kind: 'template'; tpl: Template };

export const QuickInsert = ({ open, templates, currentDir, onInsert, onCreateDaily, onClose }: QuickInsertProps) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = templates.filter(t => t.name.toLowerCase().includes(query.toLowerCase()));
  const rows: Row[] = [{ kind: 'daily' }, ...filtered.map(tpl => ({ kind: 'template' as const, tpl }))];

  useEffect(() => {
    setSelected(0);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [query]);

  // 键盘走到底部/顶部时把那行滚进视野（和 ⌘P 快速切换一个行为）
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!open) return null;

  const pick = (row: Row) => {
    if (row.kind === 'daily') {
      const tpl = templates.find(t => t.id === 'tpl-daily') || templates.find(t => t.name.toLowerCase().includes('daily'));
      const content = applyTemplate(tpl?.content || `# ${todayTitle()}\n\n## 今天\n- [ ] \n`, todayTitle());
      // 没打开文件夹时别默默拼一个相对路径：那条路径写不出去，界面上只会"点了没反应"
      const path = currentDir ? dailyNotePath(currentDir) : '';
      onCreateDaily(path, content);
      return;
    }
    onInsert(applyTemplate(row.tpl.content, row.tpl.name));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[selected];
      if (!row) return;
      pick(row);
      onClose();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const activeId = `qi-row-${selected}`;
  // 日记那行的说明要写它真正落在哪儿：dailyNotePath 拼的是 <目录>/Daily/年-月-日.md，
  // 以前只写文件名，看着像会落在目录根上（使用指南里写的又是"存成 Daily/年-月-日.md"）。
  const dailyDesc = currentDir ? `Daily/${todayTitle()}.md` : '需要先打开一个文件夹';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="quick-insert-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="快捷插入"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="quick-insert-search">
          <Search size={14} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="搜索模板…"
            aria-label="搜索模板"
            role="combobox"
            aria-expanded="true"
            aria-controls="quick-insert-list"
            aria-activedescendant={activeId}
          />
        </div>
        <div className="quick-insert-list" id="quick-insert-list" role="listbox" ref={listRef}>
          {rows.map((row, i) => {
            const isOn = i === selected;
            if (row.kind === 'daily') {
              return (
                <button
                  key="daily"
                  id="qi-row-0"
                  role="option"
                  aria-selected={isOn}
                  className={`quick-insert-item daily${isOn ? ' selected' : ''}`}
                  onClick={() => { pick(row); onClose(); }}
                  onMouseEnter={() => setSelected(i)}
                >
                  <Calendar size={16} />
                  <div>
                    <div className="qi-title">今日日记</div>
                    <div className="qi-desc">{dailyDesc}</div>
                  </div>
                </button>
              );
            }
            return (
              <button
                key={row.tpl.id}
                id={`qi-row-${i}`}
                role="option"
                aria-selected={isOn}
                className={`quick-insert-item${isOn ? ' selected' : ''}`}
                onClick={() => { pick(row); onClose(); }}
                onMouseEnter={() => setSelected(i)}
              >
                <FileText size={16} />
                <div>
                  <div className="qi-title">{row.tpl.name}</div>
                  <div className="qi-desc">{row.tpl.builtin ? '内置模板' : '自定义模板'}</div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="sidebar-empty">没有匹配「{query}」的模板</div>
          )}
        </div>
      </div>
    </div>
  );
};
