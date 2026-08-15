import React from 'react';
import { Sun, Moon, Save, Clock, Eye, AlignCenter, FileCode } from 'lucide-react';
import type { ThemeName } from '../types';

interface StatusBarProps {
  theme: ThemeName;
  onCycleTheme: () => void;
  isDirty: boolean;
  lastSaved: string | null;
  stats: { words: number; characters: number; lines: number; readingTime: number };
  editorMode: 'wysiwyg' | 'source';
  focusMode: boolean;
  typewriterMode: boolean;
  onToggleEditorMode: () => void;
  onToggleFocusMode: () => void;
  onToggleTypewriterMode: () => void;
}

export const StatusBar = React.memo(({
  theme,
  onCycleTheme,
  isDirty,
  lastSaved,
  stats,
  editorMode,
  focusMode,
  typewriterMode,
  onToggleEditorMode,
  onToggleFocusMode,
  onToggleTypewriterMode,
}: StatusBarProps) => {
  // 格式化保存时间：显示 "已保存 HH:MM"
  const formatSaveTime = (timeStr: string | null) => {
    if (!timeStr) return '';
    // timeStr 可能是 "YYYY-MM-DD HH:MM:SS" 格式（来自 Rust）或 ISO 格式
    const timeOnly = timeStr.split(' ')[1]?.substring(0, 5) || '';
    if (timeOnly) return `已保存 ${timeOnly}`;
    // 尝试 ISO 格式解析
    try {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) {
        return `已保存 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      }
    } catch {}
    return '已保存';
  };

  return (
    <div className="status-bar" role="status" aria-live="polite">
      <div className="status-bar-section">
        {isDirty ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--warning-color)' }}>
            <Save size={13} /> 未保存
          </span>
        ) : lastSaved ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--success-color)' }}>
            <Clock size={13} /> {formatSaveTime(lastSaved)}
          </span>
        ) : null}
      </div>

      <div className="status-bar-section">
        <button className={`status-bar-btn ${focusMode ? 'active' : ''}`} onClick={onToggleFocusMode} title="Focus Mode">
          <Eye size={14} /> Focus
        </button>
        <button className={`status-bar-btn ${typewriterMode ? 'active' : ''}`} onClick={onToggleTypewriterMode} title="Typewriter Mode">
          <AlignCenter size={14} /> Typewriter
        </button>
        <button className={`status-bar-btn ${editorMode === 'source' ? 'active' : ''}`} onClick={onToggleEditorMode} title="Toggle Source Mode">
          <FileCode size={14} /> {editorMode === 'wysiwyg' ? 'WYSIWYG' : 'Source'}
        </button>

        <div className="status-bar-divider" />

        <span style={{ fontSize: 12 }}>
          {stats.words} words · {stats.characters} chars · {stats.lines} lines · {stats.readingTime} min read
        </span>

        <div className="status-bar-divider" />

        <button className="status-bar-btn" onClick={onCycleTheme} title={`Theme: ${theme}`}>
          {theme === 'light' || theme === 'sepia' || theme === 'solarized' ? <Sun size={14} /> : <Moon size={14} />}
          <span style={{ textTransform: 'capitalize' }}>{theme}</span>
        </button>

        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>ZenNote v2.0</span>
      </div>
    </div>
  );
});