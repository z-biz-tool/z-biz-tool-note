import React from 'react';
import { Link2, FileText } from 'lucide-react';
import type { Backlink } from '../types';

interface BacklinksPanelProps {
  backlinks: Backlink[];
  onJump: (filePath: string) => void;
  onClose: () => void;
}

export const BacklinksPanel = React.memo(({ backlinks, onJump, onClose }: BacklinksPanelProps) => {
  return (
    <div className="backlinks-panel">
      <div className="outline-header">
        <Link2 size={14} />
        <span>Backlinks</span>
        <span className="count-badge">{backlinks.length}</span>
        <button className="toolbar-btn" onClick={onClose} title="Close">×</button>
      </div>
      <div className="backlinks-list">
        {backlinks.length === 0 ? (
          <div className="sidebar-empty">
            <p>No backlinks yet</p>
            <p className="hint">Other notes will appear here when they link to this note via [[wiki links]]</p>
          </div>
        ) : (
          backlinks.map((bl, i) => (
            <button
              key={`${bl.noteId}-${i}`}
              className="backlink-item"
              onClick={() => onJump(bl.noteId)}
              title={bl.noteId}
            >
              <div className="backlink-title">
                <FileText size={13} />
                <span>{bl.title}</span>
              </div>
              <div className="backlink-snippet">{bl.preview}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
});