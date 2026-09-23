import React from 'react';
import { Sun, Moon, Save, Clock, Eye, AlignCenter, FileCode, Maximize2, Minimize2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import type { ThemeName, NoteStats } from '../types';
import { themeLabel } from '../lib/themes';
import { modKeys } from '../lib/modifier';
import { useI18n } from '../lib/i18n';

interface StatusBarProps {
  theme: ThemeName;
  onCycleTheme: () => void;
  isDirty: boolean;
  lastSaved: string | null;
  saveState?: 'idle' | 'dirty' | 'saving' | 'saved' | 'error'; // 保存状态机（P0 优化）
  stats: NoteStats;
  editorMode: 'wysiwyg' | 'source';
  focusMode: boolean;
  typewriterMode: boolean;
  documentWide: boolean;
  onToggleEditorMode: () => void;
  onToggleFocusMode: () => void;
  onToggleTypewriterMode: () => void;
  onToggleDocumentWide: () => void;
}

export const StatusBar = React.memo(({
  theme,
  onCycleTheme,
  isDirty,
  lastSaved,
  saveState = 'idle',
  stats,
  editorMode,
  focusMode,
  typewriterMode,
  documentWide,
  onToggleEditorMode,
  onToggleFocusMode,
  onToggleTypewriterMode,
  onToggleDocumentWide,
}: StatusBarProps) => {
  const { t, lang } = useI18n();
  // 格式化保存时间：显示 "已保存 HH:MM"
  const formatSaveTime = (timeStr: string | null) => {
    // 没有时间点也要留下"已保存"三个字：这个函数只在"确实保存过"的分支里被调用，
    // 返回空串会在状态栏留下一个孤零零的勾（切到未命名标签时会撞上）
    if (!timeStr) return t('status', 'saved');
    // timeStr 可能是 "YYYY-MM-DD HH:MM:SS" 格式（来自 Rust）或 ISO 格式
    const timeOnly = timeStr.split(' ')[1]?.substring(0, 5) || '';
    if (timeOnly) return `${t('status', 'saved')} ${timeOnly}`;
    // 尝试 ISO 格式解析
    try {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) {
        return `${t('status', 'saved')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      }
    } catch {}
    return t('status', 'saved');
  };

  // 保存状态指示器：saving / saved / error 优先级高于 isDirty
  const renderSaveIndicator = () => {
    if (saveState === 'saving') {
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'color-mix(in srgb, var(--accent-color, #3b82f6) 55%, var(--text-primary))' }} title={t('status', 'savingTitle')}>
          <Loader2 size={13} className="spinning" /> {t('status', 'saving')}
        </span>
      );
    }
    if (saveState === 'error') {
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'color-mix(in srgb, var(--error-color, #ef4444) 55%, var(--text-primary))' }} title={t('status', 'saveFailedTitle')}>
          <AlertCircle size={13} /> {t('status', 'saveFailed')}
        </span>
      );
    }
    if (saveState === 'saved' || (!isDirty && lastSaved)) {
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'color-mix(in srgb, var(--success-color) 55%, var(--text-primary))' }}>
          <CheckCircle2 size={13} /> {formatSaveTime(lastSaved)}
        </span>
      );
    }
    if (isDirty) {
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'color-mix(in srgb, var(--warning-color) 55%, var(--text-primary))' }}>
          <Save size={13} /> {t('status', 'unsaved')}
        </span>
      );
    }
    return null;
  };

  return (
    <div className="status-bar" role="status" aria-live="polite">
      <div className="status-bar-section">
        {renderSaveIndicator()}
      </div>

      <div className="status-bar-section">
        <button className={`status-bar-btn ${focusMode ? 'active' : ''}`} onClick={onToggleFocusMode} title={t('status', 'focusTitle')} aria-pressed={focusMode}>
          <Eye size={14} /> {t('status', 'focus')}
        </button>
        <button className={`status-bar-btn ${typewriterMode ? 'active' : ''}`} onClick={onToggleTypewriterMode} title={t('status', 'typewriterTitle')} aria-pressed={typewriterMode}>
          <AlignCenter size={14} /> {t('status', 'typewriter')}
        </button>
        {/* 这一个不能用固定文案：它不是开关，是「富文本 ↔ 源码」两态互切，
            按钮上写的就是当前那态。所以提示语也得跟着翻——
            之前在源码模式下悬停，仍写着"源码模式：直接编辑 Markdown 原文"，
            看着像"再点一次进源码模式"，实际是按回富文本。 */}
        <button className={`status-bar-btn ${editorMode === 'source' ? 'active' : ''}`} onClick={onToggleEditorMode}
          title={t('status', editorMode === 'source' ? 'toRichTitle' : 'toSourceTitle').replace('{key}', modKeys('Cmd+/'))}
          aria-pressed={editorMode === 'source'}>
          <FileCode size={14} /> {editorMode === 'wysiwyg' ? t('status', 'richText') : t('status', 'source')}
        </button>
        {/* 文案固定为模式名，靠高亮表达开关（和专注/打字机一致）。
            之前显示的是"点下去会变成什么"，宽屏时按钮却写着"标准"。 */}
        <button className={`status-bar-btn ${documentWide ? 'active' : ''}`} onClick={onToggleDocumentWide} title={documentWide ? t('status', 'wideOnTitle') : t('status', 'wideOffTitle')} aria-pressed={documentWide}>
          {documentWide ? <Minimize2 size={14} /> : <Maximize2 size={14} />} {t('status', 'wide')}
        </button>

        <div className="status-bar-divider" />

        <span
          style={{ fontSize: 12 }}
          title={t('status', 'statsTitle')}
        >
          {stats.words} {t('status', 'words')} · {stats.characters} {t('status', 'characters')} · {stats.blocks} {t('status', 'blocks')} · {t('status', 'about')} {stats.readingTime} {t('status', 'minutes')}
        </span>

        <div className="status-bar-divider" />

        <button className="status-bar-btn" onClick={onCycleTheme} title={t('status', 'themeTitle').replace('{theme}', themeLabel(theme, lang))}>
          {theme === 'light' || theme === 'sepia' || theme === 'solarized' ? <Sun size={14} /> : <Moon size={14} />}
          {themeLabel(theme, lang)}
        </button>

        <span
          className="status-bar-version"
          style={{ fontSize: 11, color: 'var(--text-muted)' }}
          title={`ZenNote ${__APP_VERSION__}`}
        >
          v{__APP_VERSION__}
        </span>
      </div>
    </div>
  );
});