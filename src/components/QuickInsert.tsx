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

export const QuickInsert = ({ open, templates, currentDir, onInsert, onCreateDaily, onClose }: QuickInsertProps) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const filtered = templates.filter(t => t.name.toLowerCase().includes(query.toLowerCase()));

  const handlePick = (tpl: Template) => {
    const content = applyTemplate(tpl.content, tpl.name);
    onInsert(content);
    onClose();
  };

  const handleDaily = () => {
    const tpl = templates.find(t => t.id === 'tpl-daily') || templates.find(t => t.name.toLowerCase().includes('daily'));
    const content = applyTemplate(tpl?.content || `# ${todayTitle()}\n\n## Plan\n- [ ]\n`, todayTitle());
    const path = currentDir ? dailyNotePath(currentDir) : '';
    onCreateDaily(path, content);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="quick-insert-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="quick-insert-search">
          <Search size={14} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates..."
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
          />
        </div>
        <div className="quick-insert-list">
          <button className="quick-insert-item daily" onClick={handleDaily}>
            <Calendar size={16} />
            <div>
              <div className="qi-title">Today's Daily Note</div>
              <div className="qi-desc">{todayTitle()}.md</div>
            </div>
          </button>
          {filtered.map(t => (
            <button key={t.id} className="quick-insert-item" onClick={() => handlePick(t)}>
              <FileText size={16} />
              <div>
                <div className="qi-title">{t.name}</div>
                <div className="qi-desc">{t.builtin ? 'Built-in template' : 'Custom template'}</div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="sidebar-empty">No templates match "{query}"</div>
          )}
        </div>
      </div>
    </div>
  );
};
