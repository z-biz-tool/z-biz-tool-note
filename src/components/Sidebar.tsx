import { useState, useEffect, useCallback } from 'react';
import {
  Folder, FileText, Search, Plus, ChevronRight, ChevronDown,
  Home, Clock, Files
} from 'lucide-react';
import type { FileItem, Note, RecentFile } from '../types';
import { useFileOperations } from '../hooks/useFileOperations';
import { electronAPI } from '../lib/electronAPI';

interface SidebarProps {
  isOpen: boolean;
  currentNote: Note | null;
  onSelectNote: (note: Note) => void;
  onNewNote: () => void;
  onOpenFolder: (dirPath: string) => void;
}

type TabType = 'files' | 'recent' | 'search';

export const Sidebar = ({ isOpen, currentNote, onSelectNote, onNewNote, onOpenFolder }: SidebarProps) => {
  const { listFiles, readFile, showOpenDialog } = useFileOperations();
  const [activeTab, setActiveTab] = useState<TabType>('files');
  const [fileTree, setFileTree] = useState<FileItem[]>([]);
  const [currentDir, setCurrentDir] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [searchResults, setSearchResults] = useState<Array<{ filePath: string; fileName: string; snippet: string; line: number }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('recentFiles');
    if (saved) {
      setRecentFiles(JSON.parse(saved));
    }
    const savedDir = localStorage.getItem('currentDir');
    if (savedDir) {
      setCurrentDir(savedDir);
      loadFileTree(savedDir);
    }
  }, []);

  const loadFileTree = async (dir: string) => {
    setLoading(true);
    const result = await listFiles(dir);
    if (result.success && result.files) {
      setFileTree(result.files.filter((f: FileItem) => !f.name.startsWith('.')));
    }
    setLoading(false);
  };

  const addRecentFile = useCallback((path: string, name: string) => {
    setRecentFiles(prev => {
      const filtered = prev.filter(f => f.path !== path);
      const updated = [{ path, name, lastOpened: Date.now() }, ...filtered].slice(0, 20);
      localStorage.setItem('recentFiles', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const handleFolderSelect = async () => {
    const result = await showOpenDialog();
    if (!result.canceled && result.filePath) {
      setCurrentDir(result.filePath);
      localStorage.setItem('currentDir', result.filePath);
      onOpenFolder(result.filePath);
      loadFileTree(result.filePath);
    }
  };

  const handleFileClick = async (file: FileItem) => {
    if (file.isDirectory) {
      const isExpanded = expandedFolders.has(file.path);
      setExpandedFolders(prev => {
        const next = new Set(prev);
        if (isExpanded) next.delete(file.path);
        else next.add(file.path);
        return next;
      });
      if (!isExpanded && !file.children) {
        const result = await listFiles(file.path);
        if (result.success && result.files) {
          file.children = result.files.filter((f: FileItem) => !f.name.startsWith('.'));
          setFileTree([...fileTree]);
        }
      }
    } else if (file.isFile && (file.name.endsWith('.md') || file.name.endsWith('.markdown'))) {
      const result = await readFile(file.path);
      if (result.success && result.content !== undefined) {
        addRecentFile(file.path, file.name.replace(/\.md$|\.markdown$/, ''));
        onSelectNote({
          id: file.path,
          title: file.name.replace(/\.md$|\.markdown$/, ''),
          content: result.content,
          filePath: file.path,
          lastModified: new Date(),
          isDirty: false,
        });
      }
    }
  };

  const handleRecentClick = async (file: RecentFile) => {
    const result = await readFile(file.path);
    if (result.success && result.content !== undefined) {
      addRecentFile(file.path, file.name);
      onSelectNote({
        id: file.path,
        title: file.name,
        content: result.content,
        filePath: file.path,
        lastModified: new Date(),
        isDirty: false,
      });
    }
  };

  const handleGlobalSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim() || !currentDir) {
      setSearchResults([]);
      return;
    }
    const result = await electronAPI.invoke('search-in-files', currentDir, query);
    if (result.success && result.matches) {
      setSearchResults(result.matches.map((m: any) => ({
        filePath: m.filePath,
        fileName: m.filePath.split('/').pop() || m.filePath,
        snippet: m.preview || '',
        line: m.line || 0,
      })));
    }
  };

  const renderFileTree = (files: FileItem[], depth = 0): React.ReactNode => {
    return files.map(file => (
      <div key={file.path}>
        {file.isDirectory ? (
          <>
            <button
              className="sidebar-folder-item"
              style={{ paddingLeft: `${12 + depth * 16}px` }}
              onClick={() => handleFileClick(file)}
            >
              {expandedFolders.has(file.path) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Folder size={15} />
              <span>{file.name}</span>
            </button>
            {expandedFolders.has(file.path) && file.children && renderFileTree(file.children, depth + 1)}
          </>
        ) : (
          <button
            className={`sidebar-file-item ${currentNote?.filePath === file.path ? 'active' : ''}`}
            style={{ paddingLeft: `${12 + depth * 16 + 20}px` }}
            onClick={() => handleFileClick(file)}
          >
            <FileText size={14} />
            <span>{file.name.replace(/\.md$|\.markdown$/, '')}</span>
          </button>
        )}
      </div>
    ));
  };

  if (!isOpen) {
    return (
      <div className="sidebar-collapsed">
        <button className="toolbar-btn" onClick={() => onOpenFolder('')} title="Open Folder">
          <Home size={18} />
        </button>
        <button className="toolbar-btn" onClick={onNewNote} title="New Note">
          <Plus size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">ZenNote</span>
        <button className="toolbar-btn" onClick={onNewNote} title="New Note">
          <Plus size={16} />
        </button>
      </div>

      <div className="sidebar-tabs">
        <button className={`sidebar-tab ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')}>
          <Files size={14} />
          <span style={{ marginLeft: 4 }}>Files</span>
        </button>
        <button className={`sidebar-tab ${activeTab === 'recent' ? 'active' : ''}`} onClick={() => setActiveTab('recent')}>
          <Clock size={14} />
          <span style={{ marginLeft: 4 }}>Recent</span>
        </button>
        <button className={`sidebar-tab ${activeTab === 'search' ? 'active' : ''}`} onClick={() => setActiveTab('search')}>
          <Search size={14} />
          <span style={{ marginLeft: 4 }}>Search</span>
        </button>
      </div>

      {activeTab === 'files' && (
        <>
          <div className="sidebar-search">
            <button className="toolbar-btn" onClick={handleFolderSelect} title="Open Folder" style={{ width: 28, height: 28 }}>
              <Folder size={14} />
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {currentDir ? currentDir.split('/').pop() : 'No folder'}
            </span>
          </div>
          <div className="sidebar-file-list">
            {loading ? (
              <div className="sidebar-empty">Loading...</div>
            ) : fileTree.length === 0 ? (
              <div className="sidebar-empty">
                <p>No files found</p>
                <button className="toolbar-btn" onClick={handleFolderSelect} style={{ marginTop: 8, padding: '4px 12px', width: 'auto', fontSize: 13 }}>
                  Open Folder
                </button>
              </div>
            ) : (
              renderFileTree(fileTree)
            )}
          </div>
        </>
      )}

      {activeTab === 'recent' && (
        <div className="sidebar-file-list">
          {recentFiles.length === 0 ? (
            <div className="sidebar-empty">No recent files</div>
          ) : (
            recentFiles.map(file => (
              <button
                key={file.path}
                className="sidebar-file-item"
                onClick={() => handleRecentClick(file)}
                title={file.path}
              >
                <Clock size={14} />
                <span>{file.name}</span>
              </button>
            ))
          )}
        </div>
      )}

      {activeTab === 'search' && (
        <>
          <div className="sidebar-search">
            <Search size={14} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search in all notes..."
              value={searchQuery}
              onChange={(e) => handleGlobalSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="sidebar-file-list">
            {!searchQuery.trim() ? (
              <div className="sidebar-empty">Type to search across all notes</div>
            ) : searchResults.length === 0 ? (
              <div className="sidebar-empty">No results found</div>
            ) : (
              searchResults.map((result, i) => (
                <button
                  key={`${result.filePath}-${i}`}
                  className="sidebar-file-item"
                  onClick={async () => {
                    const res = await readFile(result.filePath);
                    if (res.success && res.content !== undefined) {
                      addRecentFile(result.filePath, result.fileName);
                      onSelectNote({
                        id: result.filePath,
                        title: result.fileName,
                        content: res.content,
                        filePath: result.filePath,
                        lastModified: new Date(),
                        isDirty: false,
                      });
                    }
                  }}
                  style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                    <FileText size={14} />
                    <span style={{ fontWeight: 500 }}>{result.fileName}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>L{result.line}</span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', paddingLeft: 20, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                    {result.snippet}
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};
