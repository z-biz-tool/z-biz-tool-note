import { useState, useEffect } from 'react';
import { Folder, FileText, Search, Plus, ChevronRight, ChevronDown, Home } from 'lucide-react';
import type { FileItem, Note } from '../types';
import { useFileOperations } from '../hooks/useFileOperations';

interface SidebarProps {
  isOpen: boolean;
  currentNote: Note | null;
  onSelectNote: (note: Note) => void;
  onNewNote: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const Sidebar = ({ isOpen, currentNote, onSelectNote, onNewNote, searchQuery, onSearchChange }: SidebarProps) => {
  const { listFiles, showOpenDialog, readFile } = useFileOperations();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentDir, setCurrentDir] = useState<string>('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    if (!currentDir) {
      const result = await showOpenDialog();
      if (!result.canceled && result.filePath) {
        setCurrentDir(result.filePath);
      }
      return;
    }
    setLoading(true);
    const result = await listFiles(currentDir);
    if (result.success && result.files) {
      setFiles(result.files.filter(f => f.name !== '.DS_Store'));
    }
    setLoading(false);
  };

  const handleFileClick = async (file: FileItem) => {
    if (file.isDirectory) {
      const isExpanded = expandedFolders.has(file.path);
      setExpandedFolders(prev => {
        const next = new Set(prev);
        if (isExpanded) {
          next.delete(file.path);
        } else {
          next.add(file.path);
        }
        return next;
      });
    } else if (file.isFile && file.name.endsWith('.md')) {
      const result = await readFile(file.path);
      if (result.success && result.content) {
        onSelectNote({
          id: file.path,
          title: file.name.replace('.md', ''),
          content: result.content,
          filePath: file.path,
          lastModified: new Date(),
          isDirty: false,
        });
      }
    }
  };

  const filteredFiles = files.filter(file => 
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) {
    return (
      <div style={styles.collapsedSidebar}>
        <button onClick={loadFiles} style={styles.navButton}>
          <Home size={20} />
        </button>
      </div>
    );
  }

  return (
    <div style={styles.sidebar}>
      <div style={styles.header}>
        <h2 style={styles.title}>Notes</h2>
        <button onClick={onNewNote} style={styles.newButton}>
          <Plus size={16} />
        </button>
      </div>

      <div style={styles.searchContainer}>
        <Search size={16} style={{ color: 'var(--text-muted)' }} />
        <input
          type="text"
          placeholder="Search notes..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          style={styles.searchInput}
        />
      </div>

      <div style={styles.pathBar}>
        <button onClick={loadFiles} style={styles.pathButton}>
          <Folder size={14} />
          <span>{currentDir || 'Select Folder'}</span>
        </button>
      </div>

      <div style={styles.fileList}>
        {loading ? (
          <div style={styles.loading}>Loading...</div>
        ) : filteredFiles.length === 0 ? (
          <div style={styles.empty}>No files found</div>
        ) : (
          filteredFiles.map(file => (
            <div key={file.path}>
              {file.isDirectory ? (
                <div>
                  <button 
                    onClick={() => handleFileClick(file)} 
                    style={styles.folderItem}
                  >
                    {expandedFolders.has(file.path) ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                    <Folder size={16} />
                    <span>{file.name}</span>
                  </button>
                  {expandedFolders.has(file.path) && (
                    <div style={styles.subfolder}>
                      {file.name}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => handleFileClick(file)}
                  style={{
                    ...styles.fileItem,
                    backgroundColor: currentNote?.filePath === file.path ? 'var(--accent-color)' : 'transparent',
                    color: currentNote?.filePath === file.path ? '#fff' : 'var(--text-primary)',
                  }}
                >
                  <FileText size={16} />
                  <span>{file.name}</span>
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  collapsedSidebar: {
    width: '48px',
    backgroundColor: 'var(--bg-secondary)',
    borderRight: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: '16px',
  },
  navButton: {
    width: '32px',
    height: '32px',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebar: {
    width: '280px',
    backgroundColor: 'var(--bg-secondary)',
    borderRight: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px',
    borderBottom: '1px solid var(--border-color)',
  },
  title: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  newButton: {
    width: '28px',
    height: '28px',
    border: 'none',
    backgroundColor: 'var(--accent-color)',
    color: '#fff',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderBottom: '1px solid var(--border-color)',
  },
  searchInput: {
    flex: 1,
    border: 'none',
    backgroundColor: 'var(--bg-tertiary)',
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: '14px',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  pathBar: {
    padding: '8px 16px',
    borderBottom: '1px solid var(--border-color)',
  },
  pathButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: '13px',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    width: '100%',
  },
  fileList: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 0',
  },
  loading: {
    padding: '16px',
    color: 'var(--text-muted)',
    fontSize: '14px',
  },
  empty: {
    padding: '16px',
    color: 'var(--text-muted)',
    fontSize: '14px',
    textAlign: 'center',
  },
  folderItem: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 16px',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontSize: '14px',
    textAlign: 'left',
  },
  fileItem: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 16px',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontSize: '14px',
    textAlign: 'left',
    borderRadius: '4px',
    margin: '2px 8px',
  },
  subfolder: {
    paddingLeft: '32px',
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
};