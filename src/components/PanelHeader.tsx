import { X, Maximize2, Minimize2 } from 'lucide-react';

interface PanelHeaderProps {
  icon?: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  wide: boolean;
  onToggleWide: () => void;
  onClose: () => void;
}

/**
 * Shared header used by all right-side panels (Outline, Backlinks,
 * AI Assistant, Knowledge Graph). Provides a "narrow / wide" toggle
 * (similar to Yuque's panel switch) and a close button.
 */
export const PanelHeader = ({ icon, title, badge, wide, onToggleWide, onClose }: PanelHeaderProps) => {
  return (
    <div className="outline-header">
      {icon}
      <span>{title}</span>
      {badge}
      <button
        className="panel-wide-toggle"
        onClick={onToggleWide}
        title={wide ? '切换为标准视图' : '切换为宽屏视图（占满右侧，编辑器隐藏）'}
        aria-label={wide ? '切换为标准视图' : '切换为宽屏视图'}
      >
        {wide ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        <span className="panel-wide-label">{wide ? '标准' : '宽屏'}</span>
      </button>
      <button className="toolbar-btn" onClick={onClose} title="关闭面板" aria-label="Close panel">
        <X size={14} />
      </button>
    </div>
  );
};