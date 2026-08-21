import { X, PanelRightOpen, PanelRightClose } from 'lucide-react';

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
        className="toolbar-btn"
        onClick={onToggleWide}
        title={wide ? 'Switch to narrow view' : 'Switch to wide view'}
        aria-label={wide ? 'Switch to narrow view' : 'Switch to wide view'}
      >
        {wide ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
      </button>
      <button className="toolbar-btn" onClick={onClose} title="Close" aria-label="Close panel">
        <X size={14} />
      </button>
    </div>
  );
};