import { X, Maximize2, Minimize2 } from 'lucide-react';
import { useI18n } from '../lib/i18n';

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
  const { t } = useI18n();
  return (
    <div className="outline-header">
      {icon}
      <span>{title}</span>
      {badge}
      <button
        className="panel-wide-toggle"
        onClick={onToggleWide}
        title={t('panel', wide ? 'toStandardTitle' : 'toWideTitle')}
        aria-label={t('panel', wide ? 'standard' : 'wide')}
      >
        {wide ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        <span className="panel-wide-label">{t('panel', wide ? 'standard' : 'wide')}</span>
      </button>
      <button className="toolbar-btn" onClick={onClose} title={t('panel', 'closeTitle')} aria-label={t('panel', 'closeTitle')}>
        <X size={14} />
      </button>
    </div>
  );
};