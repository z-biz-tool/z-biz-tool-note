import { useEffect } from 'react';
import { X } from 'lucide-react';

interface OutlineProps {
  headings: Array<{ id: string; level: number; text: string; pos: number }>;
  activeId: string | null;
  onJump: (pos: number) => void;
  onClose: () => void;
}

export const Outline = ({ headings, activeId, onJump, onClose }: OutlineProps) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="outline-panel">
      <div className="outline-header">
        Outline
        <button className="find-replace-btn" onClick={onClose} title="Close">
          <X size={14} />
        </button>
      </div>
      <div className="outline-list">
        {headings.length === 0 ? (
          <div className="outline-item">No headings found</div>
        ) : (
          headings.map((heading) => (
            <button
              key={heading.id}
              className={`outline-item${activeId === heading.id ? ' active' : ''}`}
              style={{ paddingLeft: `${12 + (heading.level - 1) * 16}px` }}
              onClick={() => onJump(heading.pos)}
              title={heading.text}
            >
              {heading.text}
            </button>
          ))
        )}
      </div>
    </div>
  );
};
