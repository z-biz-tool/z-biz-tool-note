import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Folder, FileText, Search, Plus, ChevronRight, ChevronDown,
  Home, Clock, Files, Hash, Settings, Sparkles, Calendar
} from 'lucide-react';
import type { FileItem, Note, RecentFile, Tag } from '../types';
import { useFileOperations } from '../hooks/useFileOperations';
import { electronAPI } from '../lib/electronAPI';
import { searchNotes } from '../lib/searchIndex';
import { confirmDialog, notify, promptDialog } from '../lib/dialogs';
import { FolderContextMenu } from './FolderContextMenu';
import { TagsPanel } from './TagsPanel';

// 渐变色主题常量
const brandGradient = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
const cardBgGradient = "linear-gradient(135deg, rgba(102,126,234,0.04) 0%, rgba(118,75,162,0.04) 100%)";

// 桥层把 Rust 报错包成 {success:false,error} 而不是抛异常，这里还原成异常，
// 好让调用点的 try/catch 仍能给出「重命名失败 / 删除失败」的提示。
function must(r: any) {
  if (r && r.success === false) throw new Error(r.error || '操作失败');
  return r;
}

const SEARCH_HISTORY_KEY = 'searchHistory';
const SEARCH_HISTORY_MAX = 8;

/** 历史来自 localStorage，任何脏数据（非数组、非字符串项）都在这里挡掉 */
function readSearchHistory(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, SEARCH_HISTORY_MAX);
  } catch {
    return [];
  }
}

/**
 * 清理搜索 snippet 的 HTML：Rust 侧已转义 content，但保险起见再次白名单过滤
 * 仅保留 <mark> 标签（用于高亮），移除其它可能的 HTML/脚本。
 */
function sanitizeSnippet(html: string): string {
  // 1. 转义除 <mark> / </mark> 之外的所有标签
  return html.replace(/<(?!\/?mark\b)[^>]*>/g, '');
}

interface SidebarProps {
  isOpen: boolean;
  /** 唯一的目录来源：App 打开/切换文件夹后由这里下发，Sidebar 不再自己存一份 */
  currentDir: string;
  currentNote: Note | null;
  onSelectNote: (note: Note) => void;
  onOpenFile?: (path: string) => void;
  onNewNote: () => void;
  onOpenFolder: (dirPath: string) => void;
  onRefresh?: () => void;
  refreshKey?: number;
  onRename?: (oldPath: string, newPath: string, newName: string, isDirectory: boolean) => void;
  /** 文件/文件夹进了废纸篓：App 要关掉指向它的标签，否则自动保存会把删掉的文件写回来 */
  onDelete?: (path: string, isDirectory: boolean) => void;
  tags?: Tag[];
  onTagClick?: (tag: string) => void;
  activeTag?: string | null;
  onOpenSettings?: () => void;
  onOpenAI?: () => void;
  onCreateDaily?: () => void;
  width?: number;
}

type TabType = 'files' | 'recent' | 'search' | 'tags';

export const Sidebar = ({
  isOpen, currentDir, currentNote, onSelectNote, onOpenFile, onNewNote, onOpenFolder, onRefresh, refreshKey, onRename, onDelete,
  tags = [], onTagClick, activeTag, onOpenSettings, onOpenAI, onCreateDaily, width,
}: SidebarProps) => {
  const { listFiles, readFile, showOpenDialog } = useFileOperations();
  const [activeTab, setActiveTab] = useState<TabType>('files');
  const [fileTree, setFileTree] = useState<FileItem[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [searchResults, setSearchResults] = useState<Array<{ filePath: string; fileName: string; snippet: string; line: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'file' | 'folder' | 'empty'; item?: FileItem } | null>(null);

  // loadFileTree 要按"当前展开了哪些目录"补子节点，回调里读到最新展开集得靠 ref
  const expandedRef = useRef<Set<string>>(expandedFolders);
  expandedRef.current = expandedFolders;
  const treeSeqRef = useRef(0);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('recentFiles') || '[]');
      if (Array.isArray(saved)) setRecentFiles(saved);
    } catch {
      // 历史数据坏了就丢掉，不能让侧栏白屏
      localStorage.removeItem('recentFiles');
    }
  }, []);
  
  // 快速搜索：Cmd/Ctrl+K 切到搜索页并聚焦输入框
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [focusSearch, setFocusSearch] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setActiveTab('search');
        setFocusSearch(true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 输入框可能在切到搜索页后才挂载，所以放在渲染提交后聚焦（不依赖 rAF）
  useEffect(() => {
    if (!focusSearch) return;
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
    setFocusSearch(false);
  }, [focusSearch, activeTab]);

  // 换目录、外部刷新（refreshKey）都要重新拉树
  useEffect(() => {
    if (currentDir) {
      loadFileTree(currentDir);
    } else {
      setFileTree([]);
    }
  }, [currentDir, refreshKey]);

  const loadFileTree = async (dir: string, extraExpand: string[] = []) => {
    setLoading(true);
    const seq = ++treeSeqRef.current;
    const expanded = new Set([...expandedRef.current, ...extraExpand]);
    const visible = (files: FileItem[]) => files.filter((f: FileItem) => !f.name.startsWith('.'));
    // list-files 只给一层。展开态还留在 expandedFolders 里，但刷新出来的目录节点没有
    // children，渲染条件 (expanded && children) 直接不成立 —— 于是每次新建/改名/删除
    // 之后整棵树"啪"地收起来，用户刚定位到的位置没了。这里把展开过的目录补齐。
    const hydrate = async (nodes: FileItem[]): Promise<FileItem[]> =>
      Promise.all(nodes.map(async (n) => {
        if (!n.isDirectory || !expanded.has(n.path)) return n;
        const r = await listFiles(n.path);
        const kids = r.success && r.files ? visible(r.files) : [];
        return { ...n, children: await hydrate(kids) } as FileItem;
      }));
    const result = await listFiles(dir);
    if (seq !== treeSeqRef.current) return;
    if (result.success && result.files) {
      const tree = await hydrate(visible(result.files));
      if (seq !== treeSeqRef.current) return;
      setFileTree(tree);
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

  // 重命名/删除后，「最近打开」里指向旧路径的条目必须跟着改：
  // 否则点下去 readFile 失败、界面上没有任何反馈，看起来像应用坏了。
  const mutateRecent = useCallback((change: (f: RecentFile) => RecentFile | null) => {
    setRecentFiles(prev => {
      const updated = prev.map(change).filter((f): f is RecentFile => f !== null);
      localStorage.setItem('recentFiles', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const handleFolderSelect = async () => {
    const result = await showOpenDialog();
    if (!result.canceled && result.filePath) {
      // 只上报给 App，目录状态由 App 统一持有（否则侧栏和主窗口会各说各话）
      onOpenFolder(result.filePath);
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
          setFileTree(prev => [...prev]);
        }
      }
    } else if (file.isFile) {
      // 任意文件类型都走 App 的统一打开逻辑(按 fileTypes 路由分发)
      if (onOpenFile) {
        addRecentFile(file.path, file.name);
        onOpenFile(file.path);
      } else {
        // 回退:仅处理 .md
        if (file.name.endsWith('.md') || file.name.endsWith('.markdown')) {
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
    while (await electronAPI.invoke('file-exists', pathJoin(parentDir, fileName))) {
      fileName = `Untitled ${counter++}.md`;
    }
    const filePath = pathJoin(parentDir, fileName);
    must(await electronAPI.invoke('write-text-file', filePath, '# Untitled\n\nStart writing...'));
    // 在某个文件夹里新建，就得让那个文件夹保持展开，否则刷新后新建项藏在收起的目录里，
    // 界面上等于"点了没反应"
    setExpandedFolders(prev => prev.has(parentDir!) ? prev : new Set(prev).add(parentDir!));
    loadFileTree(currentDir, [parentDir]);
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
    while (await electronAPI.invoke('file-exists', pathJoin(parentDir, folderName))) {
      folderName = `New Folder ${counter++}`;
    }
    const folderPath = pathJoin(parentDir, folderName);
    must(await electronAPI.invoke('ensure-dir', folderPath));
    setExpandedFolders(prev => prev.has(parentDir!) ? prev : new Set(prev).add(parentDir!));
    loadFileTree(currentDir, [parentDir]);
    onRefresh?.();
    setContextMenu(null);
  };

  /**
   * 树里展示的是去掉扩展名的名字，用户照着输入 "Guide" 时要把原扩展名补回来，
   * 否则落盘成无扩展名文件、被笔记列表过滤掉，看起来就像数据丢了。
   * 校验和落盘都走这里，保证「查重的名字」和「真正写出去的名字」是同一个。
   */
  const normalizeName = (item: FileItem, raw: string) => {
    const ext = pathExtname(item.path);
    const name = raw.trim();
    return ext && !pathExtname(name) ? name + ext : name;
  };

  /** 返回错误文案则留在弹窗里继续改；重名要查一次磁盘，所以是异步 */
  const validateName = async (item: FileItem, raw: string): Promise<string | null> => {
    const name = raw.trim();
    if (!name) return '名称不能为空';
    if (/[/\\]/.test(name) || /^\.+$/.test(name)) return '名称不能包含 / 或 \\，也不能只有点';
    const target = pathJoin(pathDirname(item.path), normalizeName(item, name));
    // 只改大小写时不算重名：macOS 默认 APFS 大小写不敏感，原名会把自己查成"已存在"
    if (target.toLowerCase() === item.path.toLowerCase()) return null;
    if (await electronAPI.invoke('file-exists', target)) return '该名称已存在';
    return null;
  };

  const handleRename = async () => {
    const item = contextMenu?.item;
    if (!item) return;
    // 先把右键菜单收掉，弹窗叠在菜单上会两层浮层抢焦点
    setContextMenu(null);

    const input = await promptDialog({
      title: item.isDirectory ? '重命名文件夹' : '重命名',
      message: item.path,
      defaultValue: item.name,
      confirmText: '重命名',
      validate: raw => validateName(item, raw),
    });
    if (input === null) return;
    const newName = normalizeName(item, input);
    if (!newName || newName === item.name) return;

    const parentDir = pathDirname(item.path);
    const newPath = pathJoin(parentDir, newName);

    try {
      must(await electronAPI.invoke('rename-file', item.path, newPath));
      const oldPrefix = item.path + '/';
      const newPrefix = newPath + '/';
      const renamedPath = item.path;
      mutateRecent(f => {
        if (f.path === renamedPath) return { ...f, path: newPath, name: newName };
        if (item.isDirectory && f.path.startsWith(oldPrefix)) {
          return { ...f, path: newPrefix + f.path.slice(oldPrefix.length) };
        }
        return f;
      });
      if (item.isDirectory) {
        // 展开态记的是路径：目录改了名不跟着搬，刷新时补齐子节点就会认不出来，整棵子树收起
        setExpandedFolders(prev => {
          const next = new Set<string>();
          prev.forEach(p => next.add(p === renamedPath ? newPath : p.startsWith(oldPrefix) ? newPrefix + p.slice(oldPrefix.length) : p));
          return next;
        });
      }
      onRename?.(item.path, newPath, newName, !!item.isDirectory);
      onRefresh?.();
      notify(`已重命名为 ${newName}`, 'success');
    } catch (err) {
      console.error('重命名失败:', err);
      notify('重命名失败: ' + err, 'error');
    }
  };

  const handleDelete = async (e?: React.MouseEvent) => {
    const item = contextMenu?.item;
    if (!item) return;
    e?.stopPropagation();
    setContextMenu(null);

    const isDir = item.isDirectory;
    const ok = await confirmDialog({
      title: isDir ? '删除文件夹' : '删除笔记',
      message: isDir
        ? `确定将文件夹 "${item.name}" 移到废纸篓吗？`
        : `确定将笔记 "${item.name}" 移到废纸篓吗？`,
      confirmText: '移到废纸篓',
      danger: true,
    });
    if (!ok) return;

    try {
      must(await electronAPI.invoke('move-to-trash', item.path));
      const gone = item.path;
      const dir = !!item.isDirectory;
      mutateRecent(f => (f.path === gone || (dir && f.path.startsWith(gone + '/')) ? null : f));
      // 交给 App 关掉对应标签：标签还活着的话，2 秒防抖自动保存会把刚进废纸篓的文件写回来
      onDelete?.(gone, dir);
      onRefresh?.();
      notify(isDir ? '文件夹已移到废纸篓' : '笔记已移到废纸篓', 'success');
    } catch (err) {
      console.error('删除失败:', err);
      notify('删除失败: ' + err, 'error');
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
        lastModified: new Date().toISOString(),
        isDirty: false,
      });
    }
  };

  // 搜索 debounce + 取消令牌（避免前次响应覆盖后次结果）
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 只认最后一次发出的搜索结果，避免慢的旧响应盖掉新结果 */
  const searchSeqRef = useRef(0);

  // 最近搜索：只在搜到结果时记录，避免历史里全是打错词或无意义的前缀
  const [searchHistory, setSearchHistory] = useState<string[]>(readSearchHistory);

  const pushSearchHistory = useCallback((q: string) => {
    const query = q.trim();
    if (!query) return;
    setSearchHistory(prev => {
      const next = [query, ...prev.filter(x => x !== query)].slice(0, SEARCH_HISTORY_MAX);
      try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
      } catch {
        // 存储写满时只丢历史，不影响搜索
      }
      return next;
    });
  }, []);

  const clearSearchHistory = useCallback(() => {
    setSearchHistory([]);
    localStorage.removeItem(SEARCH_HISTORY_KEY);
  }, []);

  const handleGlobalSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim() || !currentDir) {
      setSearchResults([]);
      return;
    }
    // 取消前次未完成的搜索
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    searchDebounceRef.current = setTimeout(async () => {
      const seq = ++searchSeqRef.current;
      try {
        // 优先走 FTS5 索引搜索；索引为空或不可用时降级为全盘扫描
        const indexed = await searchNotes(query, 100);

        if (indexed && indexed.length > 0) {
          if (seq !== searchSeqRef.current) return;
          setSearchResults(indexed.map(m => ({
            filePath: m.file_path,
            fileName: m.file_path.split('/').pop() || m.file_path,
            // snippet 内已含 <mark> 高亮；前端直接渲染（注意 XSS 用 dangerouslySetInnerHTML）
            snippet: m.snippet,
            line: m.line,
          })));
          pushSearchHistory(query);
          return;
        }

        // 降级路径
        const result = await electronAPI.invoke('search-in-files', currentDir, query);
        if (seq !== searchSeqRef.current) return;
        if (result.success && result.matches) {
          setSearchResults(result.matches.map((m: any) => ({
            filePath: m.filePath,
            fileName: m.filePath.split('/').pop() || m.filePath,
            snippet: m.preview || '',
            line: m.line || 0,
          })));
          if (result.matches.length > 0) pushSearchHistory(query);
        } else {
          setSearchResults([]);
        }
      } catch (e) {
        if ((e as any)?.name !== 'AbortError') {
          console.warn('搜索失败:', e);
        }
      }
    }, 300);
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
        <button className="toolbar-btn" onClick={handleFolderSelect} title="打开文件夹（Cmd+Shift+O）">
          <Home size={18} />
        </button>
        <button className="toolbar-btn" onClick={onNewNote} title="新建笔记">
          <Plus size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar" role="navigation" aria-label="笔记导航" style={width ? { width: `${width}px` } : undefined}>
      <div 
        className="sidebar-header"
        style={{
          background: cardBgGradient,
          borderRadius: 12,
          padding: "12px 16px",
          marginBottom: 12,
        }}
      >
        <span 
          className="sidebar-title"
          style={{ 
            fontWeight: 600, 
            background: brandGradient,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundImage: brandGradient,
          }}
        >ZenNote</span>
        <button className="toolbar-btn" onClick={onNewNote} title="New Note">
          <Plus size={16} />
        </button>
      </div>

      <div 
        className="sidebar-tabs"
        style={{
          background: cardBgGradient,
          borderRadius: 10,
          padding: 4,
          marginBottom: 12,
        }}
      >
        <button className={`sidebar-tab ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')} title="文件树" aria-label="文件树">
          <Files size={14} />
        </button>
        <button className={`sidebar-tab ${activeTab === 'recent' ? 'active' : ''}`} onClick={() => setActiveTab('recent')} title="最近打开" aria-label="最近打开">
          <Clock size={14} />
        </button>
        <button className={`sidebar-tab ${activeTab === 'search' ? 'active' : ''}`} onClick={() => setActiveTab('search')} title="全文搜索（Cmd+K）" aria-label="全文搜索">
          <Search size={14} />
        </button>
        <button className={`sidebar-tab ${activeTab === 'tags' ? 'active' : ''}`} onClick={() => setActiveTab('tags')} title="标签" aria-label="标签">
          <Hash size={14} />
        </button>
      </div>

      {activeTab === 'files' && (
        <>
          <div 
            className="sidebar-search"
            style={{
              background: cardBgGradient,
              borderRadius: 10,
              padding: "8px 12px",
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <button className="toolbar-btn" onClick={handleFolderSelect} title="打开文件夹（Cmd+Shift+O）" style={{ width: 28, height: 28 }}>
              <Folder size={14} />
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {currentDir ? currentDir.split('/').pop() : '未打开文件夹'}
            </span>
          </div>
          <div 
            className="sidebar-file-list" 
            role="tree" 
            onContextMenu={(e) => handleContextMenu(e)}
            style={{
              background: cardBgGradient,
              borderRadius: 10,
              padding: 8,
            }}
          >
            {loading ? (
              <div className="sidebar-empty">正在读取目录…</div>
            ) : fileTree.length === 0 ? (
              <div className="sidebar-empty">
                <p>这个文件夹里还没有笔记</p>
                <button className="toolbar-btn" onClick={handleFolderSelect} style={{ marginTop: 8, padding: '4px 12px', width: 'auto', fontSize: 13 }}>
                  打开文件夹
                </button>
              </div>
            ) : (
              renderFileTree(fileTree)
            )}
          </div>
        </>
      )}

      {activeTab === 'recent' && (
        <div 
          className="sidebar-file-list"
          style={{
            background: cardBgGradient,
            borderRadius: 10,
            padding: 8,
          }}
        >
          {recentFiles.length === 0 ? (
            <div className="sidebar-empty">还没有最近打开的笔记</div>
          ) : (
            recentFiles.map(file => (
              <button
                key={file.path}
                className="sidebar-file-item"
                onClick={() => handleRecentClick(file)}
                title={file.path}
                style={{
                  margin: 2,
                  padding: "8px 12px",
                  borderRadius: 8,
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(102,126,234,0.1)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
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
          <div 
            className="sidebar-search"
            style={{
              background: cardBgGradient,
              borderRadius: 10,
              padding: "8px 12px",
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Search size={14} style={{ color: 'var(--text-muted)' }} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="搜索全部笔记…"
              value={searchQuery}
              onChange={(e) => handleGlobalSearch(e.target.value)}
              autoFocus
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                fontSize: 13,
                background: 'transparent',
              }}
            />
          </div>
          <div 
            className="sidebar-file-list"
            style={{
              background: cardBgGradient,
              borderRadius: 10,
              padding: 8,
            }}
          >
            {!searchQuery.trim() ? (
              <div className="sidebar-empty">
                <p>输入关键词搜索全部笔记</p>
                {searchHistory.length > 0 && (
                  <div className="search-history">
                    <div className="search-history-head">
                      <span>最近搜索</span>
                      <button className="search-history-clear" onClick={clearSearchHistory}>清空</button>
                    </div>
                    <div className="search-history-chips">
                      {searchHistory.map(h => (
                        <button
                          key={h}
                          className="search-history-chip"
                          onClick={() => handleGlobalSearch(h)}
                          title={`再次搜索 ${h}`}
                        >
                          {h}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <p className="sidebar-empty-hint"><kbd>Cmd</kbd><kbd>K</kbd> 直接跳到搜索框</p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="sidebar-empty">
                <p>没有匹配「{searchQuery.trim()}」的笔记</p>
                <p className="sidebar-empty-hint">换个更短的关键词，或在 设置 → 搜索 里对齐一次索引</p>
              </div>
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
                  <span
                    style={{ fontSize: 12, color: 'var(--text-muted)', paddingLeft: 20, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}
                    // snippet 内已含 <mark> 高亮；用 dangerouslySetInnerHTML 安全渲染
                    // （Rust 侧已对 content 做 HTML 转义，仅 <mark> 由我们控制注入）
                    dangerouslySetInnerHTML={{ __html: sanitizeSnippet(result.snippet) }}
                  />
                </button>
              ))
            )}
          </div>
        </>
      )}

      {activeTab === 'tags' && (
        <div 
          className="sidebar-file-list"
          style={{
            background: cardBgGradient,
            borderRadius: 10,
            padding: 8,
          }}
        >
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

      <div 
        className="sidebar-footer"
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: `1px solid var(--ant-color-border-secondary)`,
        }}
      >
        {onCreateDaily && (
          <button className="toolbar-btn" onClick={onCreateDaily} title="今日日记（Cmd+Shift+D）">
            <Calendar size={16} />
          </button>
        )}
        {onOpenAI && (
          <button className="toolbar-btn" onClick={onOpenAI} title="AI 助手（Cmd+J）">
            <Sparkles size={16} />
          </button>
        )}
        {onOpenSettings && (
          <button className="toolbar-btn" onClick={onOpenSettings} title="设置（Cmd+,）">
            <Settings size={16} />
          </button>
        )}
      </div>
    </div>
  );
};
