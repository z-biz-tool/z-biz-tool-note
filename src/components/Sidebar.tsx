import { useState, useEffect, useCallback } from 'react';
import {
  Folder, FileText, Search, Plus, ChevronRight, ChevronDown,
  Home, Clock, Files, Hash, Settings, Sparkles, Calendar
} from 'lucide-react';
import type { FileItem, Note, RecentFile, Tag } from '../types';
import { useFileOperations } from '../hooks/useFileOperations';
import { electronAPI } from '../lib/electronAPI';
import { FolderContextMenu } from './FolderContextMenu';
import { TagsPanel } from './TagsPanel';
import { invoke } from '@tauri-apps/api/core';

interface SidebarProps {
  isOpen: boolean;
  currentNote: Note | null;
  onSelectNote: (note: Note) => void;
  onNewNote: () => void;
  onOpenFolder: (dirPath: string) => void;
  onRefresh?: () => void;
  refreshKey?: number;
  onRename?: (oldPath: string, newPath: string, newName: string) => void;
  tags?: Tag[];
  onTagClick?: (tag: string) => void;
  activeTag?: string | null;
  onOpenSettings?: () => void;
  onOpenAI?: () => void;
  onCreateDaily?: () => void;
}

type TabType = 'files' | 'recent' | 'search' | 'tags';

export const Sidebar = ({
  isOpen, currentNote, onSelectNote, onNewNote, onOpenFolder, onRefresh, refreshKey, onRename,
  tags = [], onTagClick, activeTag, onOpenSettings, onOpenAI, onCreateDaily,
}: SidebarProps) => {
  const { listFiles, readFile, showOpenDialog } = useFileOperations();
  const [activeTab, setActiveTab] = useState<TabType>('files');
  const [fileTree, setFileTree] = useState<FileItem[]>([]);
  const [currentDir, setCurrentDir] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [searchResults, setSearchResults] = useState<Array<{ filePath: string; fileName: string; snippet: string; line: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'file' | 'folder' | 'empty'; item?: FileItem } | null>(null);

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

  // 当 refreshKey 变化时重新加载文件树
  useEffect(() => {
    if (currentDir) {
      loadFileTree(currentDir);
    }
  }, [refreshKey]);

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
          (file as any).children = result.files.filter((f: FileItem) => !f.name.startsWith('.'));
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
          lastModified: new Date().toISOString(),
          isDirty: false,
        });
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent, file?: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const type: 'file' | 'folder' | 'empty' = file?.isDirectory ? 'folder' : file?.isFile ? 'file' : 'empty';
    setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, type, item: file || undefined });
  };

  // 路径工具函数（替代 Node.js path 模块）
  const pathDirname = (p: string) => p.substring(0, p.lastIndexOf('/')) || p;
  const pathJoin = (...parts: string[]) => parts.join('/').replace(/\/+/g, '/');
  const pathBasename = (p: string) => p.split('/').pop() || p;
  const pathExtname = (p: string) => { const lastDot = p.lastIndexOf('.'); const lastSlash = p.lastIndexOf('/'); return lastDot > lastSlash ? p.substring(lastDot) : ''; };

  const handleNewFile = async () => {
    const ctx = contextMenu;
    if (!ctx) return;
    const item = ctx.item;
    let parentDir = currentDir;
    if (item?.path) {
      parentDir = item.isDirectory ? item.path : pathDirname(item.path);
    }
    if (!parentDir) return;
    let fileName = 'Untitled.md';
    let counter = 1;
    while (await invoke<boolean>('file_exists', { path: pathJoin(parentDir, fileName) })) {
      fileName = `Untitled ${counter++}.md`;
    }
    const filePath = pathJoin(parentDir, fileName);
    await invoke('write_text_file', { path: filePath, content: '# Untitled\n\nStart writing...' });
    loadFileTree(currentDir);
    onRefresh?.();
    setContextMenu(null);
  };

  const handleNewFolder = async () => {
    const ctx = contextMenu;
    if (!ctx) return;
    const item = ctx.item;
    let parentDir = currentDir;
    if (item?.path) {
      parentDir = item.isDirectory ? item.path : pathDirname(item.path);
    }
    if (!parentDir) return;
    let folderName = 'New Folder';
    let counter = 1;
    while (await invoke<boolean>('file_exists', { path: pathJoin(parentDir, folderName) })) {
      folderName = `New Folder ${counter++}`;
    }
    const folderPath = pathJoin(parentDir, folderName);
    await invoke('ensure_dir', { path: folderPath });
    loadFileTree(currentDir);
    onRefresh?.();
    setContextMenu(null);
  };

  const handleRename = async () => {
    const item = contextMenu?.item;
    if (!item) return;
    
    const newName = prompt('输入新名称:', item.name);
    if (!newName || newName === item.name) return;
    
    const parentDir = pathDirname(item.path);
    const newPath = pathJoin(parentDir, newName);
    
    try {
      if (await invoke('file_exists', { path: newPath })) {
        alert('该名称已存在');
        return;
      }
      await invoke('rename_file', { oldPath: item.path, newPath });
      onRename?.(item.path, newPath, newName);
      onRefresh?.();
    } catch (err) {
      console.error('重命名失败:', err);
      alert('重命名失败: ' + err);
    }
    setContextMenu(null);
  };

  const handleDelete = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const item = contextMenu?.item;
    if (!item) return;

    const isDir = item.isDirectory;
    const msg = isDir
      ? `确定将文件夹 "${item.name}" 移到废纸篓吗？`
      : `确定将笔记 "${item.name}" 移到废纸篓吗？`;

    if (!window.confirm(msg)) return;

    try {
      await invoke('move_to_trash', { path: item.path });
      onRefresh?.();
    } catch (err) {
      console.error('删除失败:', err);
      alert('删除失败: ' + err);
    }
    setContextMenu(null);
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
        lastModified: new Date().toISOString(),
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
              onContextMenu={(e) => handleContextMenu(e, file)}
            >
              {expandedFolders.has(file.path) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Folder size={15} />
              <span>{file.name}</span>
            </button>
            {expandedFolders.has(file.path) && (file as any).children && renderFileTree((file as any).children, depth + 1)}
          </>
        ) : (
          <button
            className={`sidebar-file-item ${currentNote?.filePath === file.path ? 'active' : ''}`}
            style={{ paddingLeft: `${12 + depth * 16 + 20}px` }}
            role="treeitem"
            onClick={() => handleFileClick(file)}
            onContextMenu={(e) => handleContextMenu(e, file)}
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
    <div className="sidebar" role="navigation" aria-label="笔记导航">
      <div className="sidebar-header">
        <span className="sidebar-title">ZenNote</span>
        <button className="toolbar-btn" onClick={onNewNote} title="New Note">
          <Plus size={16} />
        </button>
      </div>

      <div className="sidebar-tabs">
        <button className={`sidebar-tab ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')} title="Files">
          <Files size={14} />
        </button>
        <button className={`sidebar-tab ${activeTab === 'recent' ? 'active' : ''}`} onClick={() => setActiveTab('recent')} title="Recent">
          <Clock size={14} />
        </button>
        <button className={`sidebar-tab ${activeTab === 'search' ? 'active' : ''}`} onClick={() => setActiveTab('search')} title="Search">
          <Search size={14} />
        </button>
        <button className={`sidebar-tab ${activeTab === 'tags' ? 'active' : ''}`} onClick={() => setActiveTab('tags')} title="Tags">
          <Hash size={14} />
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
          <div className="sidebar-file-list" role="tree" onContextMenu={(e) => handleContextMenu(e)}>
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
                        lastModified: new Date().toISOString(),
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

      {activeTab === 'tags' && (
        <div className="sidebar-file-list">
          <TagsPanel
            tags={tags}
            onTagClick={(t) => onTagClick?.(t)}
            activeTag={activeTag}
          />
        </div>
      )}

      {contextMenu && (
        <FolderContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          type={contextMenu.type}
          onClose={() => setContextMenu(null)}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      )}

      <div className="sidebar-footer">
        {onCreateDaily && (
          <button className="toolbar-btn" onClick={onCreateDaily} title="Today's Daily Note">
            <Calendar size={16} />
          </button>
        )}
        {onOpenAI && (
          <button className="toolbar-btn" onClick={onOpenAI} title="AI Assistant">
            <Sparkles size={16} />
          </button>
        )}
        {onOpenSettings && (
          <button className="toolbar-btn" onClick={onOpenSettings} title="Settings">
            <Settings size={16} />
          </button>
        )}
      </div>
    </div>
  );
};
