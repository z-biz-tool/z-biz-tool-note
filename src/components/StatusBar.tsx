import { Sun, Moon, Eye, Save, Clock } from 'lucide-react';

interface StatusBarProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  isDirty: boolean;
  lastSaved: Date | null;
}

export const StatusBar = ({ darkMode, onToggleDarkMode, isDirty, lastSaved }: StatusBarProps) => {
  return (
    <div style={styles.statusBar}>
      <div style={styles.leftSection}>
        {isDirty && (
          <span style={styles.dirtyIndicator}>
            <Save size={14} />
            Unsaved
          </span>
        )}
        {!isDirty && lastSaved && (
          <span style={styles.savedIndicator}>
            <Clock size={14} />
            Saved {lastSaved.toLocaleTimeString()}
          </span>
        )}
      </div>

      <div style={styles.rightSection}>
        <button onClick={onToggleDarkMode} style={styles.modeButton}>
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          <span>{darkMode ? 'Light' : 'Dark'}</span>
        </button>
        
        <div style={styles.separator} />
        
        <div style={styles.info}>
          <Eye size={14} />
          <span>ZenNote v1.0.0</span>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 16px',
    backgroundColor: 'var(--bg-secondary)',
    borderTop: '1px solid var(--border-color)',
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
  leftSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  rightSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  dirtyIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    color: 'var(--warning-color)',
  },
  savedIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    color: 'var(--success-color)',
  },
  modeButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  separator: {
    width: '1px',
    height: '16px',
    backgroundColor: 'var(--border-color)',
  },
  info: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
};