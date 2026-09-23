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
import { displayName, isMarkdownPath } from '../lib/fileTypes';
import { formatRecentTime, listRecentFiles, mutateRecentFiles, subscribeRecentFiles } from '../lib/recentFiles';
import { FolderContextMenu, MoveTarget } from './FolderContextMenu';
import { TagsPanel } from './TagsPanel';
import { modKeys, MOD } from '../lib/modifier';

// 渐变色主题常量
const brandGradient = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
const cardBgGradient = "linear-gradient(135deg, rgba(102,126,234,0.04) 0%, rgba(118,75,162,0.04) 100%)";

// 桥层把 Rust 报错包成 {success:false,error} 而不是抛异常，这里还原成异常，
// 好让调用点的 try/catch 仍能给出「重命名失败 / 删除失败」的提示。
function must(r: any) {
  if (r && r.success === false) throw new Error(r.error || '操作失败');
  return r;
}

/** 递归树里挑出所有能当放置目标的目录，depth 用来在子菜单里缩进 */
function collectDirs(nodes: FileItem[], depth: number, out: MoveTarget[] = []): MoveTarget[] {
  for (const n of nodes) {
    if (!n.isDirectory || n.name.startsWith('.')) continue;
    out.push({ path: n.path, name: n.name, depth, relPath: n.path });
    collectDirs(n.children ?? [], depth + 1, out);
  }
  return out;
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
  /** 打开文件的唯一入口：App 按扩展名分发到编辑器/查看器，侧栏不再自己拼 Note */
  onOpenFile: (path: string) => void;
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
  isOpen, currentDir, currentNote, onOpenFile, onNewNote, onOpenFolder, onRefresh, refreshKey, onRename, onDelete,
  tags = [], onTagClick, activeTag, onOpenSettings, onOpenAI, onCreateDaily, width,
}: SidebarProps) => {
  const { listFiles, listFilesRecursive, showOpenDialog } = useFileOperations();
  const [activeTab, setActiveTab] = useState<TabType>('files');
  const [fileTree, setFileTree] = useState<FileItem[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(listRecentFiles);
  const [searchResults, setSearchResults] = useState<Array<{ filePath: string; fileName: string; snippet: string; line: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'file' | 'folder' | 'empty'; item?: FileItem } | null>(null);

  // loadFileTree 要按"当前展开了哪些目录"补子节点，回调里读到最新展开集得靠 ref
  const expandedRef = useRef<Set<string>>(expandedFolders);
  expandedRef.current = expandedFolders;
  const treeSeqRef = useRef(0);
  // 拖拽移动的源：dataTransfer 在 dragover 阶段读不出数据（浏览器隐私限制），只能自己记
  const dragItemRef = useRef<{ path: string; isDir: boolean } | null>(null);
  const [dropTargetDir, setDropTargetDir] = useState<string | null>(null);
  // 右键「移到文件夹」子菜单的候选：null 表示还没加载完
  const [moveTargets, setMoveTargets] = useState<MoveTarget[] | null>(null);
  // 递归列目录按工作区缓存；改名/移动/新建都会 bump refreshKey，缓存随之作废
  const dirsCacheRef = useRef<{ key: string; dirs: MoveTarget[] } | null>(null);
  const moveSeqRef = useRef(0);

  // 真源在 lib/recentFiles（App 记、这里读）：谁写都会广播，侧栏只要跟着刷新，
  // 不再自己读写 localStorage、自己拼显示名
  useEffect(() => subscribeRecentFiles(() => setRecentFiles(listRecentFiles())), []);

  // 相对时间的参照点：不跟着走的话"刚刚"能一直挂一小时。
  // 只在「最近打开」这一页开着时掐表，别的页不养定时器。
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (activeTab !== 'recent') return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [activeTab]);
  
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
      // 任意文件类型都走 App 的统一打开逻辑(按 fileTypes 路由分发)；
      // 「最近打开」由 App 在笔记成为当前标签时记，这里不再自己记
      onOpenFile(file.path);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, file?: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    const type: 'file' | 'folder' | 'empty' = file?.isDirectory ? 'folder' : file?.isFile ? 'file' : 'empty';
    // 每次右键都是一次新的提问：作废上一次子菜单的候选和仍在飞的列目录结果
    moveSeqRef.current++;
    setMoveTargets(null);
    // 用视口坐标而不是容器坐标：菜单是 position: fixed，按容器算会整体偏掉工具栏那段高度。
    // 键盘（Mac 上 Fn+Control+Space / Shift+F10）触发的事件 clientX/Y 都是 0，
    // 那样菜单会飞到窗口左上角，改成钉在当前行的左下角。
    const keyboard = !e.clientX && !e.clientY;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = keyboard ? rect.left : e.clientX;
    const y = keyboard ? rect.bottom : e.clientY;
    setContextMenu({ x, y, type, item: file || undefined });
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
    let fileName = '未命名.md';
    let counter = 1;
    while (await electronAPI.invoke('file-exists', pathJoin(parentDir, fileName))) {
      fileName = `未命名 ${counter++}.md`;
    }
    const filePath = pathJoin(parentDir, fileName);
    must(await electronAPI.invoke('write-text-file', filePath, '# 未命名\n\n开始写点什么…\n'));
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
    let folderName = '新建文件夹';
    let counter = 1;
    while (await electronAPI.invoke('file-exists', pathJoin(parentDir, folderName))) {
      folderName = `新建文件夹 ${counter++}`;
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
      // 输入框预填的是树里/标签里看到的那个名字（笔记不带 .md）：
      // 预填 "Getting Started.md" 会让人以为 .md 是名字的一部分，删掉它反而像在改扩展名。
      defaultValue: displayName(item.name),
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
      remapPaths(item.path, newPath, !!item.isDirectory);
      onRename?.(item.path, newPath, newName, !!item.isDirectory);
      onRefresh?.();
      notify(`已重命名为 ${displayName(newName)}`, 'success');
    } catch (err) {
      console.error('重命名失败:', err);
      notify('重命名失败: ' + err, 'error');
    }
  };

  /** 路径变了要一起搬的地方：最近列表、目录展开态（重命名与拖拽移动共用一套） */
  const remapPaths = (oldPath: string, newPath: string, isDirectory: boolean) => {
    const oldPrefix = oldPath + '/';
    const newPrefix = newPath + '/';
    mutateRecentFiles(e => {
      if (e.path === oldPath) return { ...e, path: newPath };
      if (isDirectory && e.path.startsWith(oldPrefix)) {
        return { ...e, path: newPrefix + e.path.slice(oldPrefix.length) };
      }
      return e;
    });
    if (!isDirectory) return;
    // 展开态记的是路径：目录改了名不跟着搬，刷新时补齐子节点就会认不出来，整棵子树收起
    setExpandedFolders(prev => {
      const next = new Set<string>();
      prev.forEach(p => next.add(p === oldPath ? newPath : p.startsWith(oldPrefix) ? newPrefix + p.slice(oldPrefix.length) : p));
      return next;
    });
  };

  // 允许把笔记/文件夹拖进另一个文件夹（T3-05）。已经在目标里、或要放进自己/自己的
  // 子目录，都不算合法目标 —— 后者 fs.rename 会直接报错，不如提前拦住给句人话。
  const canDropInto = (srcPath: string, targetDir: string) =>
    !!srcPath && !!targetDir && pathDirname(srcPath) !== targetDir
    && targetDir !== srcPath && !targetDir.startsWith(srcPath + '/');

  const handleDragStart = (e: React.DragEvent, item: FileItem) => {
    // 展开的目录里，子行外面还套着目录自己的可拖拽 div；dragstart 会冒泡上去，
    // 不截住的话"把笔记从文件夹里拖出来"会变成拖那个文件夹（实测过）。
    e.stopPropagation();
    dragItemRef.current = { path: item.path, isDir: !!item.isDirectory };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.path);
    (e.currentTarget as HTMLElement).style.opacity = '0.45';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    dragItemRef.current = null;
    setDropTargetDir(null);
    (e.currentTarget as HTMLElement).style.opacity = '';
  };

  const handleDirDragOver = (e: React.DragEvent, dirPath: string) => {
    // 目录行自己决定收不收；不冒泡到列表容器，否则"拖进一个不能放的目录"会被
    // 容器接过去当成"放回根目录"。
    e.stopPropagation();
    const src = dragItemRef.current;
    if (!src || !canDropInto(src.path, dirPath)) return;
    // 不 preventDefault 就是"这里不能放"，浏览器不会触发 drop
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropTargetDir !== dirPath) setDropTargetDir(dirPath);
  };

  const handleDirDrop = async (e: React.DragEvent, targetDir: string) => {
    e.preventDefault();
    // 冒泡到文件列表容器会被当成"移回根目录"，必须截住
    e.stopPropagation();
    const src = dragItemRef.current;
    dragItemRef.current = null;
    setDropTargetDir(null);
    if (!src || !canDropInto(src.path, targetDir)) return;
    await moveInto(src.path, targetDir, src.isDir);
  };

  const moveInto = async (srcPath: string, targetDir: string, isDir: boolean) => {
    const name = pathBasename(srcPath);
    const newPath = pathJoin(targetDir, name);
    try {
      if (await electronAPI.invoke('file-exists', newPath)) {
        notify(`目标文件夹里已有 ${name}`, 'error');
        return;
      }
      must(await electronAPI.invoke('rename-file', srcPath, newPath));
      remapPaths(srcPath, newPath, isDir);
      // 目标目录展开着才看得见移过去的东西，否则像"文件凭空消失了"
      setExpandedFolders(prev => prev.has(targetDir) ? prev : new Set(prev).add(targetDir));
      loadFileTree(currentDir, [targetDir]);
      onRename?.(srcPath, newPath, name, isDir);
      onRefresh?.();
      notify(`已移动到 ${targetDir === currentDir ? '根目录' : pathBasename(targetDir)}`, 'success');
    } catch (err) {
      console.error('移动失败:', err);
      notify('移动失败: ' + err, 'error');
    }
  };

  /** 子菜单展开时才递归列目录：拖拽之外给键盘/触控板一条同样的移动路径 */
  const prepareMoveTargets = async () => {
    const item = contextMenu?.item;
    if (!item || !currentDir) return;
    setMoveTargets(null);
    const seq = ++moveSeqRef.current;
    const key = `${currentDir}#${refreshKey ?? 0}`;
    let dirs = dirsCacheRef.current?.key === key ? dirsCacheRef.current.dirs : null;
    if (!dirs) {
      const result = await listFilesRecursive(currentDir);
      if (!result.success || !result.files) {
        notify('无法列出文件夹' + (result.error ? '：' + result.error : ''), 'error');
        dirs = [];
      } else {
        // 根目录也是合法目标（把东西拖回工作区根），列目录只给子节点，所以自己补上
        dirs = [{ path: currentDir, name: '根目录', depth: 0, relPath: '根目录' }, ...collectDirs(result.files as FileItem[], 1)];
      }
      dirsCacheRef.current = { key, dirs };
    }
    if (seq !== moveSeqRef.current) return;
    const prefix = currentDir + '/';
    setMoveTargets(
      dirs
        .filter(d => canDropInto(item.path, d.path))
        .map(d => ({ ...d, relPath: d.path === currentDir ? '根目录' : d.path.slice(prefix.length) })),
    );
  };

  const handleMoveTo = async (dirPath: string) => {
    const item = contextMenu?.item;
    if (!item) return;
    setContextMenu(null);
    await moveInto(item.path, dirPath, !!item.isDirectory);
  };

  const handleDelete = async (e?: React.MouseEvent) => {
    const item = contextMenu?.item;
    if (!item) return;
    e?.stopPropagation();
    setContextMenu(null);

    const isDir = item.isDirectory;
    // 树里任何类型都能右键删除：给 .txt 说"笔记"、还把 .md 摊给用户看，
    // 和树里/标签里看到的名字对不上（显示名规则统一在 fileTypes.displayName）
    const what = isDir ? '文件夹' : (isMarkdownPath(item.path) ? '笔记' : '文件');
    const ok = await confirmDialog({
      title: `删除${what}`,
      message: `确定将${what} "${displayName(item.name)}" 移到废纸篓吗？`,
      confirmText: '移到废纸篓',
      danger: true,
    });
    if (!ok) return;

    try {
      must(await electronAPI.invoke('move-to-trash', item.path));
      const gone = item.path;
      const dir = !!item.isDirectory;
      // 重命名/删除后，「最近打开」里指向旧路径的条目必须跟着改或清掉：
      // 否则点下去 readFile 失败、界面上没有任何反馈，看起来像应用坏了。
      mutateRecentFiles(e => (e.path === gone || (dir && e.path.startsWith(gone + '/')) ? null : e));
      // 交给 App 关掉对应标签：标签还活着的话，2 秒防抖自动保存会把刚进废纸篓的文件写回来
      onDelete?.(gone, dir);
      onRefresh?.();
      notify(isDir ? '文件夹已移到废纸篓' : '笔记已移到废纸篓', 'success');
    } catch (err) {
      console.error('删除失败:', err);
      notify('删除失败: ' + err, 'error');
    }
  };

  const handleRecentClick = (file: RecentFile) => {
    // 也走 App 的分发：最近列表里可能有 .txt / .png，自己 readFile 拼 Note 会丢掉 fileType，
    // 于是图片、代码被当成 markdown 塞进编辑器（树里点同一个文件却是对的，两边不一致）
    onOpenFile(file.path);
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
            fileName: displayName(m.file_path) || m.file_path,
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
            fileName: displayName(m.filePath) || m.filePath,
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
      <div
        key={file.path}
        draggable
        onDragStart={(e) => handleDragStart(e, file)}
        onDragEnd={handleDragEnd}
      >
        {file.isDirectory ? (
          <>
            <button
              className={`sidebar-folder-item ${dropTargetDir === file.path ? 'drop-target' : ''}`}
              style={{ paddingLeft: `${12 + depth * 16}px` }}
              onClick={() => handleFileClick(file)}
              onContextMenu={(e) => handleContextMenu(e, file)}
              onDragOver={(e) => handleDirDragOver(e, file.path)}
              onDragLeave={() => setDropTargetDir(prev => (prev === file.path ? null : prev))}
              onDrop={(e) => handleDirDrop(e, file.path)}
              title={dropTargetDir === file.path ? `移动到 ${file.name}` : undefined}
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
            // 笔记行不是放置目标：吞掉 dragover 让它不冒泡到列表容器，
            // 否则"把笔记拖到另一篇笔记上"会被容器当成放回根目录。
            onDragOver={(e) => e.stopPropagation()}
          >
            <FileText size={14} />
            <span>{displayName(file.path)}</span>
          </button>
        )}
      </div>
    ));
  };

  if (!isOpen) {
    return (
      <div className="sidebar-collapsed">
        <button className="toolbar-btn" onClick={handleFolderSelect} title={modKeys('打开文件夹（Cmd+Shift+O）')}>
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
        <button className="toolbar-btn" onClick={onNewNote} title="新建笔记">
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
        <button className={`sidebar-tab ${activeTab === 'search' ? 'active' : ''}`} onClick={() => setActiveTab('search')} title={modKeys('全文搜索（Cmd+K）')} aria-label="全文搜索">
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
            <button className="toolbar-btn" onClick={handleFolderSelect} title={modKeys('打开文件夹（Cmd+Shift+O）')} style={{ width: 28, height: 28 }}>
              <Folder size={14} />
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {currentDir ? currentDir.split('/').pop() : '未打开文件夹'}
            </span>
          </div>
          <div 
            className={`sidebar-file-list ${dropTargetDir === currentDir ? 'drop-target' : ''}`} 
            role="tree" 
            onContextMenu={(e) => handleContextMenu(e)}
            onDragOver={(e) => handleDirDragOver(e, currentDir)}
            onDrop={(e) => handleDirDrop(e, currentDir)}
            onDragLeave={() => setDropTargetDir(prev => (prev === currentDir ? null : prev))}
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
            <div className="sidebar-empty">还没有最近打开的文件</div>
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
                <span className="sidebar-item-meta">{formatRecentTime(file.lastOpened, now)}</span>
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
                <p className="sidebar-empty-hint"><kbd>{MOD}</kbd><kbd>K</kbd> 直接跳到搜索框</p>
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
                  onClick={() => onOpenFile(result.filePath)}
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
          moveTargets={moveTargets}
          onOpenMove={prepareMoveTargets}
          onMoveTo={handleMoveTo}
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
          <button className="toolbar-btn" onClick={onCreateDaily} title={modKeys('今日日记（Cmd+Shift+D）')}>
            <Calendar size={16} />
          </button>
        )}
        {onOpenAI && (
          <button className="toolbar-btn" onClick={onOpenAI} title={modKeys('AI 助手（Cmd+J）')}>
            <Sparkles size={16} />
          </button>
        )}
        {onOpenSettings && (
          <button className="toolbar-btn" onClick={onOpenSettings} title={modKeys('设置（Cmd+,）')}>
            <Settings size={16} />
          </button>
        )}
      </div>
    </div>
  );
};
