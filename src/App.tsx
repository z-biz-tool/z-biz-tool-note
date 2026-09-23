import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { listen } from '@tauri-apps/api/event';
import { electronAPI, mustSucceed, formatMtime, errText } from './lib/electronAPI';
import { DialogHost, ToastHost, confirmDialog, notify, promptDialog, validateUrl, type ToastKind } from './lib/dialogs';
import { applyTheme, THEMES } from './lib/themes';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { ImageViewer } from './components/Viewers/ImageViewer';
import { VideoPlayer } from './components/Viewers/VideoPlayer';
import { AudioPlayer } from './components/Viewers/AudioPlayer';
import { CodeViewer } from './components/Viewers/CodeViewer';
import { CsvViewer } from './components/Viewers/CsvViewer';
import { PdfViewer } from './components/Viewers/PdfViewer';
import { DocxViewer } from './components/Viewers/DocxViewer';
import { XlsxViewer } from './components/Viewers/XlsxViewer';
import { BinaryViewer } from './components/Viewers/BinaryViewer';
import type { FileKind } from './lib/fileTypes';
import { isMarkdownPath, displayName } from './lib/fileTypes';
import { disambiguateTabTitles } from './lib/tabTitles';
import { recordRecentFile } from './lib/recentFiles';
import { parseWikiLinkTarget } from './lib/WikiLinkExtension';
import { rebuildIndex, indexNote, unindexNote } from './lib/searchIndex';
import { StatusBar } from './components/StatusBar';
import { Outline } from './components/Outline';
import { QuickSwitcher } from './components/QuickSwitcher';
import { CommandPalette } from './components/CommandPalette';
import { BacklinksPanel } from './components/BacklinksPanel';
import { QuickInsert } from './components/QuickInsert';
import { Breadcrumb } from './components/Breadcrumb';
import { TabsBar } from './components/TabsBar';
import { Welcome } from './components/Welcome';
import ErrorBoundary from './components/ErrorBoundary';
import { I18nProvider } from './lib/i18n';
import { Resizer } from './components/Resizer';
import { PanelHeader } from './components/PanelHeader';
import { ListTree, Link2, Sparkles, Network, FileText } from 'lucide-react';
import type { Note, ThemeName, EditorMode, HeadingItem, Command, WikiLinkItem, GraphNode, GraphLink, AIConfig, AIMessage, Template, Tag, Backlink, Config } from './types';
import type { AIAction } from './components/AIPanel';

// 懒加载重型组件
const KnowledgeGraph = lazy(() => import('./components/KnowledgeGraph').then(m => ({ default: m.KnowledgeGraph })));
const VersionHistory = lazy(() => import('./components/VersionHistory'));
const SettingsDialog = lazy(() => import('./components/SettingsDialog').then(m => ({ default: m.SettingsDialog })));
const AIPanel = lazy(() => import('./components/AIPanel').then(m => ({ default: m.AIPanel })));
import { useFileOperations } from './hooks/useFileOperations';
import { BUILTIN_TEMPLATES, applyTemplate, dailyNotePath, todayTitle } from './lib/templates';
import { walStore, shouldCreateBackup, markBackedUp, type WalEntry } from './hooks/useAutoSave';
import { RecoveryBanner } from './components/RecoveryBanner';
import { useFileWatcher, useNoteUpdated } from './hooks/useFileWatcher';
import { parseFrontmatter, stripFrontmatter, withFrontmatter } from './lib/frontmatter';
import { decideExternalChange, selfWriteOf } from './lib/selfWrites';
import { FrontmatterMeta } from './components/FrontmatterMeta';
import './index.css';

const DEMO_CONTENT = `# 使用指南

ZenNote 是本地 Markdown 笔记应用，思路来自 Typora / Obsidian / Notion：写下来就是最终样子，链接把笔记连成网，落到磁盘上的始终是普通 .md 文件，没有私有格式。

> 下面写 ⌘ 的地方，Windows / Linux 换成 Ctrl。记不住键位就按 ⌘⇧P 打开命令面板，用中文搜「导出」「分屏」都找得到。

## 一篇笔记四种看法

- 富文本：默认状态，工具栏或敲 / 唤出块菜单。
- 源码：⌘/ 切成 Markdown 原文，再按一次切回来。
- 专注：只点亮光标所在的那一段，其余压暗。
- 打字机：光标始终停在屏幕中间，不用手动挪视野。

底部状态栏能切换这四种，最右侧还能循环 6 个主题：浅色 / 深色 / 米黄 / 暖阳 / 暗夜 / 极地。

## / 菜单能插入什么

标题 1–3、无序 / 有序 / 任务列表、引用、分割线、代码块、3×3 表格、数学公式、Mermaid 图、图片、嵌入另一篇笔记、高亮，以及 6 种提示框：信息、警告、成功、危险、小贴士、引用。

行内公式 $E=mc^2$；独立公式用两个美元符号包住：

$$
\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
$$

\`\`\`typescript
interface Note {
  id: string;
  title: string;
  tags?: string[];
}
\`\`\`

代码块内置 12 种语言高亮：html、css、javascript、typescript、python、java、go、rust、json、bash、sql、cpp。

- [x] 任务列表勾上就不会掉
- [ ] 回车自动续下一条

## 把笔记连起来

- 输入两个左方括号 [[ 就能引用别的笔记，比如 [[某篇笔记]]。
- 右侧「反向链接」面板会列出谁引用了本篇。
- ![[笔记名]] 把另一篇就地嵌进来。
- 正文里写 #标签 会归进侧边栏标签树，「一级/二级」这种嵌套也认。
- ⌘⇧G 打开知识图谱看笔记之间的连线。

## 改块的姿势

- 段落左侧的 ⠿ 手柄：按住拖动可以整块挪位置，点手柄上的折叠箭头收起这一节。
- 选中一个词后 ⌘D 逐个加选下一处，⌘⇧L 一次选中所有匹配，⌘U 撤掉上一个选区，Esc 退出多光标。
- ⌘F 在当前笔记里查找替换；⌘K 跳到侧边栏搜索，整个文件夹的正文都能搜。
- 大纲面板按标题定位（默认开着，收起了就在命令面板里搜「大纲」）。

## 日常动作

| 想做的事 | 键 |
| --- | --- |
| 新建 / 保存 / 另存为 | ⌘N、⌘S、⌘⇧S |
| 今日日记（存成 Daily/年-月-日.md） | ⌘⇧D |
| 快捷插入日记或模板 | ⌘⇧I |
| 打开文件夹 / 在笔记间快速切换 | ⌘⇧O、⌘P |
| 左右分屏对照两篇 | ⌘ 加反斜杠 |
| 关闭标签 / 上一个 / 下一个 | ⌘W、⌘⇧[、⌘⇧] |
| 侧边栏 / AI 助手 / 设置 | ⌘B、⌘J、⌘, |
| 版本历史 | ⌘⇧H |

## 内容放在哪

- 保存就是写进你打开的那个文件夹，路径显示在编辑器上方的面包屑里。
- 写入失败或异常退出时，内容先暂存到本机 WAL，下次打开顶部会有横幅让你恢复。
- 保存时会留一份快照（同一个文件 5 分钟内不重复），⌘⇧H 里可以对比、回滚。
- 命令面板搜「导出」可以出 HTML 或 PDF。

## 还没有的

- [ ] 云同步、多设备
- [ ] 插件系统

> 最淡的墨水，也胜过最好的记忆。

这篇指南本身是内存态笔记，要留档得按 ⌘⇧S 存成文件。`;

const App = () => {
  const { writeFile, showSaveDialog, exportHtml, exportPdf, createNewNote, readFile, readFileBinary, getFileMeta } = useFileOperations();

  // 多标签 + 分屏：openTabs 为所有打开的笔记，activeTabId 为左窗格当前笔记，
  // splitNote 为右窗格笔记（null 表示无分屏）。currentNote 由 activeTabId 派生，
  // 保留为派生值以兼容既有 save/AI/graph 逻辑。
  const [openTabs, setOpenTabs] = useState<Note[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [splitNote, setSplitNote] = useState<Note | null>(null);
  const currentNote = openTabs.find(t => t.id === activeTabId) || null;

  // 标题跟随当前笔记：多标签应用里"窗口标题永远是仓库名"等于没有信息。
  // 未保存是这里唯一需要抢眼的状态，所以它进标题而不是只靠标签页上的小圆点。
  // 显示名与标签栏同一套（撞名补目录后缀），否则三篇 Code 时标签写着「Code · Sub」、
  // 窗口标题却只说「Code」，切换窗口时又分不清了。
  const displayTabTitles = useMemo(() => disambiguateTabTitles(openTabs), [openTabs]);
  const activeTabIndex = openTabs.findIndex(t => t.id === activeTabId);
  const windowTitle = activeTabIndex >= 0
    ? `${displayTabTitles[activeTabIndex] || '未命名'}${openTabs[activeTabIndex].isDirty ? ' · 未保存' : ''} — ZenNote`
    : 'ZenNote';
  useEffect(() => { document.title = windowTitle; }, [windowTitle]);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  // TOC（Outline）默认打开：notes app 的大纲是核心导航体验
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [theme, setTheme] = useState<ThemeName>('light');
  const [editorMode, setEditorMode] = useState<EditorMode>('wysiwyg');
  const [focusMode, setFocusMode] = useState(false);
  const [typewriterMode, setTypewriterMode] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [stats, setStats] = useState({ words: 0, characters: 0, blocks: 0, readingTime: 0 });
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  // 分屏右窗格独立的标题/统计状态
  const [splitHeadings, setSplitHeadings] = useState<HeadingItem[]>([]);
  const [splitActiveHeading, setSplitActiveHeading] = useState<string | null>(null);
  const [splitStats, setSplitStats] = useState({ words: 0, characters: 0, blocks: 0, readingTime: 0 });
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [lastSavedSplit, setLastSavedSplit] = useState<string | null>(null);
  // 保存状态机：驱动 StatusBar 的 saving/saved/error 微标
  const [mainSaveState, setMainSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle');
  const [splitSaveState, setSplitSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle');
  const [allFiles, setAllFiles] = useState<Array<{ path: string; name: string; lastModified: number }>>([]);
  // 侧栏文件树的刷新信号：新建/重命名/删除后 bump，Sidebar 只认它、不自己存目录
  const [treeVersion, setTreeVersion] = useState(0);
  // 本地暂存（WAL）里待恢复的条目；保存失败或异常退出后在此露出恢复入口
  const [walEntries, setWalEntries] = useState<WalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphLinks, setGraphLinks] = useState<GraphLink[]>([]);
  const [showKnowledgeGraph, setShowKnowledgeGraph] = useState(false);

  // Knowledge management state
  const [tags, setTags] = useState<Tag[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [showBacklinks, setShowBacklinks] = useState(false);
  const [currentDir, setCurrentDir] = useState<string>('');

  // AI state
  const [aiConfig, setAIConfig] = useState<AIConfig>({
    baseURL: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    enabled: false,
  });
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // 字体配置
  const [config, setConfig] = useState<Config>({
    theme: 'light',
    fontSize: 16,
    fontFamily: 'system-ui',
    autoSave: true,
    lastNoteId: '',
  });

  // Templates state
  const [templates, setTemplates] = useState<Template[]>(BUILTIN_TEMPLATES);
  const [showQuickInsert, setShowQuickInsert] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  // Resizable side panels (persisted in localStorage)
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const v = parseInt(localStorage.getItem('sidebarWidth') || '', 10);
    return Number.isFinite(v) && v >= 160 && v <= 600 ? v : 280;
  });
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(() => {
    const v = parseInt(localStorage.getItem('rightPanelWidth') || '', 10);
    return Number.isFinite(v) && v >= 200 && v <= 600 ? v : 300;
  });
  // 右侧面板"窄/宽"两种展示形态（类似语雀）：
  //   窄 = 当前固定宽度（300px），可拖拽 Resizer 微调
  //   宽 = 占满除侧边栏外的全部右侧空间，编辑器隐藏
  // 默认 wide，README/H1 那种"打开就看大纲"是 notes app 的主场景
  const [rightPanelWide, setRightPanelWide] = useState<boolean>(() => {
    const v = localStorage.getItem('rightPanelWide');
    return v === null ? true : v === '1';
  });
  const RIGHT_PANEL_NARROW = 300;

  const editorRef = useRef<any>(null);
  const editorRefSplit = useRef<any>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 滚动同步引用
  const mainScrollRef = useRef<HTMLElement>(null);
  const splitScrollRef = useRef<HTMLElement>(null);

  // 用于避免防抖回调中的过期闭包问题（声明，在对应函数定义后赋值）
  const handleSaveRef = useRef<() => void>(() => {});
  const handleSaveSplitRef = useRef<() => void>(() => {});
  const openTabsRef = useRef(openTabs);
  openTabsRef.current = openTabs;
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  const splitNoteRef = useRef(splitNote);
  splitNoteRef.current = splitNote;
  const currentDirRef = useRef(currentDir);
  currentDirRef.current = currentDir;

  // 「最近打开」只有一个记录点：谁成为当前标签，谁就被记一笔。
  // 挂在侧栏各个点击处会漏掉双链 Cmd+点、快速切换、图谱节点、恢复暂存这几条入口。
  useEffect(() => {
    const note = openTabsRef.current.find(t => t.id === activeTabId);
    if (note?.filePath) recordRecentFile(note.filePath);
  }, [activeTabId]);

  // ---------- 多标签 / 分屏 辅助函数 ----------
  // 打开（或聚焦）一篇笔记到左窗格
  const openNote = useCallback((note: Note) => {
    setOpenTabs(prev => {
      const idx = prev.findIndex(t => t.id === note.id);
      if (idx >= 0) {
        // 已打开：仅聚焦，不覆盖（避免丢失未保存编辑）
        return prev;
      }
      return [...prev, note];
    });
    setActiveTabId(note.id);
  }, []);

  // 更新当前激活标签的局部字段
  const updateActiveTab = useCallback((patch: Partial<Note>) => {
    setOpenTabs(prev => prev.map(t => (t.id === activeTabId ? { ...t, ...patch } : t)));
  }, [activeTabId]);

  // 更新指定笔记（用于分屏右窗格）
  const updateNote = useCallback((id: string, patch: Partial<Note>) => {
    setOpenTabs(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)));
    setSplitNote(prev => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  }, []);

  // 关闭标签（含未保存提示）
  // 给用户看的标签名：与标签栏、窗口标题同一套（撞名带目录后缀）。
  // 从 openTabsRef 现算，closeTab 才能待在 [] 依赖里而不出 stale 闭包。
  const shownTabTitle = (id: string, fallback: string) => {
    const tabs = openTabsRef.current;
    const i = tabs.findIndex(t => t.id === id);
    return (i >= 0 ? disambiguateTabTitles(tabs)[i] : '') || fallback;
  };

  const closeTab = useCallback(async (id: string) => {
    const tab = openTabsRef.current.find(t => t.id === id);
    if (tab?.isDirty) {
      const ok = await confirmDialog({
        title: '关闭未保存的标签',
        // 用标签栏那套显示名：三篇 Code 时，"Code 有未保存的更改" 说不清是哪一篇
        message: `"${shownTabTitle(id, tab.title)}" 有未保存的更改，关闭后这些改动会丢失。`,
        confirmText: '丢弃并关闭',
        danger: true,
      });
      if (!ok) return;
    }
    setOpenTabs(prev => {
      const idx = prev.findIndex(t => t.id === id);
      if (idx < 0) return prev;
      const next = prev.filter(t => t.id !== id);
      // 若关闭的是当前激活标签，则切换到相邻标签
      if (activeTabIdRef.current === id) {
        const newActive = next[Math.min(idx, next.length - 1)];
        setActiveTabId(newActive ? newActive.id : null);
      }
      return next;
    });
    // 若关闭的是分屏笔记，清空分屏
    setSplitNote(prev => (prev && prev.id === id ? null : prev));
  }, []);

  // 关闭其他标签（保留指定标签）
  const closeOtherTabs = useCallback(async (keepId: string) => {
    const dirtyTabs = openTabsRef.current.filter(t => t.id !== keepId && t.isDirty);
    if (dirtyTabs.length > 0) {
      const ok = await confirmDialog({
        title: '关闭其他标签',
        message: `其余 ${dirtyTabs.length} 个标签有未保存的更改，关闭后这些改动会丢失。`,
        confirmText: '丢弃并关闭',
        danger: true,
      });
      if (!ok) return;
    }
    setOpenTabs(prev => prev.filter(t => t.id === keepId));
    setActiveTabId(keepId);
    setSplitNote(null);
  }, []);

  // 关闭右侧标签
  const closeTabsToRight = useCallback(async (tabId: string) => {
    // 确认必须在 setState 之外做：更新函数在 StrictMode 下会跑两遍，
    // 原先把 confirm 写在里面，关一次右侧标签要弹两次
    const tabs = openTabsRef.current;
    const idx = tabs.findIndex(t => t.id === tabId);
    if (idx < 0) return;
    const closing = tabs.slice(idx + 1);
    if (closing.length === 0) return;
    const dirtyCount = closing.filter(t => t.isDirty).length;
    if (dirtyCount > 0) {
      const ok = await confirmDialog({
        title: '关闭右侧标签',
        message: `右侧 ${dirtyCount} 个标签有未保存的更改，关闭后这些改动会丢失。`,
        confirmText: '丢弃并关闭',
        danger: true,
      });
      if (!ok) return;
    }
    setOpenTabs(prev => {
      const at = prev.findIndex(t => t.id === tabId);
      if (at < 0) return prev;
      const kept = prev.slice(0, at + 1);
      // 如果活跃标签在关闭范围内，切换到最后一个保留的标签
      const currentActiveId = activeTabIdRef.current;
      if (!kept.some(t => t.id === currentActiveId)) {
        setActiveTabId(kept[kept.length - 1]?.id || '');
      }
      // 如果分屏笔记在关闭范围内，关闭分屏
      const currentSplit = splitNoteRef.current;
      if (currentSplit && !kept.some(t => t.id === currentSplit.id)) {
        setSplitNote(null);
      }
      return kept;
    });
  }, []);

  // 切换标签（方向 -1 = 上一个，1 = 下一个）
  const switchTab = useCallback((direction: 1 | -1) => {
    setOpenTabs(prev => {
      if (prev.length === 0) return prev;
      const idx = prev.findIndex(t => t.id === activeTabIdRef.current);
      const newIdx = (idx + direction + prev.length) % prev.length;
      setActiveTabId(prev[newIdx].id);
      return prev;
    });
  }, []);

  // 切换分屏：开 → 关；关 → 开（右窗格初始展示当前笔记）
  const toggleSplit = useCallback(() => {
    setSplitNote(prev => {
      if (prev) return null;
      // 获取当前笔记
      const note = openTabsRef.current.find(t => t.id === activeTabIdRef.current);
      return note || null;
    });
  }, []);

  // 在分屏中打开指定标签
  const openInSplit = useCallback((id: string) => {
    const note = openTabs.find(t => t.id === id);
    if (note) setSplitNote(note);
  }, [openTabs]);

  // 拖拽排序标签
  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setOpenTabs(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  // Initialize
  useEffect(() => {
    const savedTheme = (localStorage.getItem('theme') as ThemeName) || 'light';
    setTheme(savedTheme);
    applyTheme(savedTheme);

    // Load AI config
    const savedAI = localStorage.getItem('aiConfig');
    if (savedAI) {
      try { setAIConfig(JSON.parse(savedAI)); } catch (e) { console.warn('加载 AI 配置失败:', e); }
    }

    // 加载字体配置
    const savedConfig = localStorage.getItem('appConfig');
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        setConfig(parsed);
        if (parsed.fontSize) {
          document.documentElement.style.setProperty('--font-size-base', parsed.fontSize + 'px');
        }
        if (parsed.fontFamily) {
          document.documentElement.style.setProperty('--font-family', parsed.fontFamily);
        }
      } catch (e) { console.warn('加载配置失败:', e); }
    }

    // Load templates
    const savedTpls = localStorage.getItem('templates');
    if (savedTpls) {
      try { setTemplates(JSON.parse(savedTpls)); } catch (e) { console.warn('加载模板失败:', e); }
    }

    // Load current dir
    const savedDir = localStorage.getItem('currentDir');
    if (savedDir) {
      setCurrentDir(savedDir);
      refreshFileList(savedDir);
      refreshKnowledgeIndex(savedDir);
    }
    // VS Code 风格：启动时不自动打开 demo 笔记，显示 Welcome 首屏（可通过 Recent/Welcome Guide 快速进入）
  }, []);

  // Load files for quick switcher when a directory is opened
  const refreshFileList = useCallback(async (dirPath: string) => {
    if (!dirPath) return;
    const result = await electronAPI.invoke('list-files-recursive', dirPath);
    if (result.success && result.files) {
      const flatten = (items: any[]): Array<{ path: string; name: string; lastModified: number }> => {
        let result: Array<{ path: string; name: string; lastModified: number }> = [];
        for (const item of items) {
          if (item.isFile) {
            result.push({ path: item.path, name: item.name.replace(/\.md$|\.markdown$/, ''), lastModified: Date.now() });
          }
          if (item.children) {
            result = result.concat(flatten(item.children));
          }
        }
        return result;
      };
      setAllFiles(flatten(result.files));
    }
  }, []);

  // Build global knowledge index: tags + graph nodes/links (from all notes in dir)
  const refreshKnowledgeIndex = useCallback(async (dirPath: string) => {
    if (!dirPath) return;
    const result = await electronAPI.invoke('read-all-notes', dirPath);
    if (!result.success || !result.notes) return;

    const notes: any[] = result.notes;

    // Tags aggregation
    const tagMap = new Map<string, string[]>();
    notes.forEach(n => {
      (n.tags || []).forEach((t: string) => {
        if (!tagMap.has(t)) tagMap.set(t, []);
        tagMap.get(t)!.push(n.filePath);
      });
    });
    const tagList: Tag[] = Array.from(tagMap.entries())
      .map(([name, paths]) => ({ name, count: paths.length, notes: paths }))
      .sort((a, b) => b.count - a.count);
    setTags(tagList);

    // Graph: nodes = all notes, links = wiki links (resolved by title)
    const titleToPath = new Map<string, string>();
    notes.forEach(n => titleToPath.set(n.title.toLowerCase(), n.filePath));
    const nodes: GraphNode[] = notes.map(n => ({
      id: n.filePath,
      name: n.title,
      path: n.filePath,
      group: (n.tags?.[0] as string) || undefined,
    }));
    const links: GraphLink[] = [];
    const linkSet = new Set<string>();
    notes.forEach(n => {
      (n.links || []).forEach((targetTitle: string) => {
        const targetPath = titleToPath.get(targetTitle.toLowerCase());
        if (targetPath && targetPath !== n.filePath) {
          const key = `${n.filePath}->${targetPath}`;
          if (!linkSet.has(key)) {
            linkSet.add(key);
            links.push({ source: n.filePath, target: targetPath });
          }
        }
      });
    });
    setGraphNodes(nodes);
    setGraphLinks(links);
  }, []);

  // 侧栏树 + allFiles（双链解析靠它）对齐。read-all-notes 要读全部笔记，只在
  // 路径真的变了（改名/删除）时才跟着刷，新建文件不必。
  const refreshFileTree = useCallback(() => {
    setTreeVersion(v => v + 1);
    const dir = currentDirRef.current;
    if (dir) void refreshFileList(dir);
  }, [refreshFileList]);

  const refreshNoteIndex = useCallback(() => {
    const dir = currentDirRef.current;
    if (dir) void refreshKnowledgeIndex(dir);
  }, [refreshKnowledgeIndex]);

  // 重命名后要把所有指向旧路径的状态一起搬走：标签、分屏、激活标签。
  // 目录改名必须连带里面的文件（含正在编辑的那篇）——否则自动保存按老路径写盘，
  // 会把刚改掉的目录和文件重新造出来，磁盘上变成"改名没生效 + 多出一份副本"。
  const handleFileRenamed = useCallback((oldPath: string, newPath: string, newName: string, isDirectory: boolean) => {
    const reroot = (p?: string) => {
      if (!p) return p;
      if (p === oldPath) return newPath;
      return isDirectory && p.startsWith(`${oldPath}/`) ? newPath + p.slice(oldPath.length) : p;
    };
    // 标签标题与文件树、双链目标同一套形态：笔记不带 .md/.markdown，其它类型留扩展名
    // （fileTypes.displayName 定的规则，改名/移动后要按同样的规则重算，不能各写一份）
    const titleOf = (p: string, fallback: string) => displayName(p) || fallback;
    setOpenTabs(prev => prev.map(tab => {
      const filePath = reroot(tab.filePath);
      if (!filePath || filePath === tab.filePath) return tab;
      return { ...tab, id: filePath, filePath, title: titleOf(filePath, filePath === newPath ? newName : tab.title) };
    }));
    setSplitNote(prev => {
      const filePath = reroot(prev?.filePath);
      if (!prev || !filePath || filePath === prev.filePath) return prev;
      return { ...prev, id: filePath, filePath, title: titleOf(filePath, filePath === newPath ? newName : prev.title) };
    });
    // 标签 id 就是路径：改名后 activeTabId 若还指旧路径，currentNote 查不到 → 编辑区直接空白
    const active = activeTabIdRef.current;
    const nextActive = reroot(active ?? undefined);
    if (nextActive && active && nextActive !== active) setActiveTabId(nextActive);
    refreshFileTree();
    refreshNoteIndex();
  }, [refreshFileTree, refreshNoteIndex]);

  // Find backlinks for the current note
  const refreshBacklinks = useCallback(async () => {
    if (!currentNote || !currentDir) {
      setBacklinks([]);
      return;
    }
    const result = await electronAPI.invoke('find-backlinks', currentDir, currentNote.title, currentNote.filePath || '');
    if (result.success && result.backlinks) {
      setBacklinks(result.backlinks);
    } else {
      setBacklinks([]);
    }
  }, [currentNote, currentDir]);

  useEffect(() => {
    refreshBacklinks();
  }, [refreshBacklinks]);

  // Run an AI action against the current note
  const runAIAction = useCallback(async (action: AIAction, context?: string, history?: AIMessage[]): Promise<string> => {
    if (!aiConfig.enabled) {
      throw new Error('AI 功能未启用，请先在 设置 → AI 服务商 中配置。');
    }

    const noteContent = currentNote?.content || '';
    const noteTitle = currentNote?.title || '';
    const truncated = noteContent.length > 8000 ? noteContent.slice(0, 8000) + '\n...[truncated]' : noteContent;

    const systemPrompt = action === 'chat'
      ? '你是一个智能笔记助手，帮助用户整理和分析笔记内容。'
      : `你是一个笔记分析助手。请根据用户的内容执行以下操作：${action}`;

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      ...(history || []),
      { role: 'user', content: action === 'chat' ? (context || `Note: ${noteTitle}\n\n${truncated}`) : context || '' },
    ];

    const result = await electronAPI.invoke('ai-chat', aiConfig, messages);
    if (!result.success) {
      throw new Error(result.error || 'AI 请求失败');
    }
    return result.content || '（模型没有返回内容）';
  }, [aiConfig, currentNote, allFiles]);

  const handleInsertText = useCallback((text: string) => {
    if (!editorRef.current) return;
    editorRef.current.chain().focus().insertContent('\n\n' + text + '\n').run();
    setShowAIPanel(false);
  }, []);

  // Toast helper：实现已挪到 lib/dialogs.tsx 的全局 store，这里保留同名薄封装，
  // 让 App 内 20 多处 showToast 调用和它们的 useCallback 依赖表不用动
  const showToast = useCallback((message: string, kind?: ToastKind) => notify(message, kind), []);

  // 文件/文件夹被删掉（侧栏移到废纸篓，或外部删除）：关掉指向它的标签与分屏。
  // 不关的话标签里的内容还在，2 秒防抖自动保存会按原路径重新写盘，把刚删的文件"复活"回来。
  const closeTabsForDeletedPath = useCallback((path: string, isDirectory: boolean) => {
    const hit = (p?: string) => !!p && (p === path || (isDirectory && p.startsWith(`${path}/`)));
    const gone = new Set(openTabsRef.current.filter(t => hit(t.filePath)).map(t => t.id));
    if (gone.size === 0) return false;
    const remaining = openTabsRef.current.filter(t => !gone.has(t.id));
    setOpenTabs(remaining);
    const active = activeTabIdRef.current;
    if (active && gone.has(active)) {
      setActiveTabId(remaining.length ? remaining[remaining.length - 1].id : null);
    }
    setSplitNote(prev => (prev && hit(prev.filePath) ? null : prev));
    return true;
  }, []);

  const handleFileDeleted = useCallback((path: string, isDirectory: boolean) => {
    if (closeTabsForDeletedPath(path, isDirectory)) showToast('已关闭指向被删除文件的标签');
    refreshFileTree();
    refreshNoteIndex();
  }, [closeTabsForDeletedPath, showToast, refreshFileTree, refreshNoteIndex]);

  // 文件监听：替换旧的 5s 轮询，notify crate 推送事件
  // 状态栏那句「已保存 HH:MM」读的是 lastSaved，处理完事件顺手把 mtime 对上，
  // 免得同一次修改被重复处理时又弹一遍
  /**
   * 把盘上 mtime 对进状态栏要读的那份 state。afterSave 只给"刚刚保存成功"的场合：
   * lastSaved 是「已保存 HH:MM」唯一的数据来源，读不到盘上时间时也要把这一笔记下来，
   * 否则会一直挂着上一次保存（甚至打开）的那一刻（实测 13:57 保存后仍显示 13:47）。
   */
  const syncMtime = useCallback(async (filePath: string, opts: {
    isCurrent?: boolean; isSplit?: boolean; afterSave?: boolean;
  } = {}) => {
    const { isCurrent = true, isSplit = false, afterSave = false } = opts;
    let mtime: string | null = null;
    try {
      mtime = mustSucceed(await electronAPI.invoke('get-file-modified', filePath)) as string;
    } catch {}
    if (!mtime && !afterSave) return;
    const stamp = mtime || formatMtime();
    if (isCurrent) setLastSaved(stamp);
    if (isSplit) setLastSavedSplit(stamp);
  }, []);

  const handleExternalChange = useCallback(async (filePath: string) => {
    const cur = openTabsRef.current.find(t => t.id === activeTabIdRef.current);
    const isCurrent = cur?.filePath === filePath;
    const isSplit = splitNoteRef.current?.filePath === filePath;
    if (!isCurrent && !isSplit) return;

    // 先读盘对账：watcher 不认人，我们自己 write_file 的那一笔半秒后也会广播回来。
    // 对得上就是回声 —— 不重载、不弹框、不打扰（决策口径见 lib/selfWrites.ts）
    let disk: string;
    try {
      const result = await readFile(filePath);
      if (!result.success || result.content === undefined) {
        showToast(`重新加载失败: ${result.error || '未知错误'}`, 'error');
        return;
      }
      disk = result.content;
    } catch (e) {
      console.warn('重新加载失败:', e);
      showToast(`重新加载失败: ${errText(e)}`, 'error');
      return;
    }
    const tab = isCurrent ? cur : splitNoteRef.current;
    const action = decideExternalChange({
      disk,
      local: tab?.content ?? null,
      recorded: selfWriteOf(filePath) ?? null,
      isDirty: tab?.isDirty === true,
    });
    if (action === 'ignore') return;

    // 本地没改动时重新加载不会丢东西，直接刷并提示一句；有未保存改动才需要问，
    // 而且要说清楚"会被替换"，原来的文案只写"是否重新加载"，看不出会丢工作
    if (action === 'confirm') {
      const ok = await confirmDialog({
        title: '文件已被外部修改',
        message: `"${filePath.split('/').pop()}" 在磁盘上被改过了，而标签里有未保存的修改。重新加载会丢弃本地改动。`,
        confirmText: '丢弃本地并重新加载',
        danger: true,
      });
      if (!ok) {
        // 用户选择保留本地内容：仍要同步 mtime，否则下一次改动又会再弹一遍
        await syncMtime(filePath, { isCurrent, isSplit });
        showToast('已保留本地未保存的修改', 'info');
        return;
      }
    }
    if (isCurrent) {
      updateActiveTab({ content: disk, isDirty: false });
    } else {
      setSplitNote(prev => prev ? { ...prev, content: disk, isDirty: false } : null);
    }
    showToast('已加载外部修改', 'success');
    await syncMtime(filePath, { isCurrent, isSplit });
  }, [updateActiveTab, readFile, showToast, syncMtime]);

  // 启动 notify watcher（监听 currentDir 整个目录树）
  useFileWatcher({
    dir: currentDir || null,
    onChanged: (filePath: string) => {
      handleExternalChange(filePath);
      // 外部改过的文件内容变了，索引也得跟着重读（后端自己读盘拿 mtime）
      if (isMarkdownPath(filePath)) void indexNote(filePath);
    },
    onRemoved: (filePath: string) => {
      const wasOpen = openTabsRef.current.some(t => t.filePath === filePath);
      closeTabsForDeletedPath(filePath, false);
      if (wasOpen) showToast('文件已被外部删除，相关标签已关闭');
      if (isMarkdownPath(filePath)) void unindexNote(filePath);
    },
    onCreated: (filePath: string) => {
      // 文件创建：触发一次文件树刷新（轻量）
      // 用 currentDirRef 避免闭包旧值（用户切换目录后回调里拿到的应是当前目录）
      refreshFileList(currentDirRef.current);
      if (isMarkdownPath(filePath)) void indexNote(filePath);
    },
  });

  // 打开目录时对齐 FTS 索引：外部编辑器/云同步写进来的文件不走 write_file，
  // 不主动扫一遍的话搜索会一直漏掉它们（rebuild 按 mtime 增量，重复调用几乎零成本）
  useEffect(() => {
    const dir = currentDir;
    if (!dir) return;
    let cancelled = false;
    void rebuildIndex(dir).then(status => {
      if (!cancelled && status) console.log(`[index] ${dir}: ${status.indexed}/${status.total} 篇已索引`);
    });
    return () => { cancelled = true; };
  }, [currentDir]);

  // 笔记更新事件：增量更新知识图谱（取代每次保存后全量 read-all-notes）
  useNoteUpdated(useCallback((summary) => {
    setGraphNodes(prev => {
      const idx = prev.findIndex(n => n.id === summary.file_path);
      const next = [...prev];
      const nodeUpdate = { id: summary.file_path, name: summary.title, label: summary.title };
      if (idx >= 0) {
        next[idx] = { ...next[idx], ...nodeUpdate };
      } else {
        next.push(nodeUpdate as GraphNode);
      }
      return next;
    });
    setGraphLinks(prev => {
      const next = prev.filter(l => l.source !== summary.file_path);
      const newLinks = summary.links.map(target => ({ source: summary.file_path, target }));
      return [...next, ...newLinks];
    });
  }, []));

  /**
   * 落盘一篇模板/日记并打开。两条入口（命令面板的"今日日记"、QuickInsert 面板）原来各写一份，
   * 而且都裸调 invoke：浏览器模式下 ensure_dir/write_text_file 抛 TypeError 只留一条 console.warn
   * 就继续往下走，于是要么凭空开出一篇空白笔记、要么整条链路静默失败。合并成走桥层的一份，
   * 并把失败说给用户听。
   */
  const createAndOpenNote = useCallback(async (filePath: string, content: string, okToast: string) => {
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    try {
      mustSucceed(await electronAPI.invoke('ensure-dir', dir));
      mustSucceed(await electronAPI.invoke('write-text-file', filePath, content));
    } catch (e) {
      showToast(`创建失败（${errText(e)}）`, 'error');
      return;
    }
    const result = await readFile(filePath);
    if (!result.success || result.content === undefined) {
      showToast(`创建失败（${result.error || '刚写入的文件读不回来'}）`, 'error');
      return;
    }
    openNote({
      id: filePath,
      title: todayTitle(),
      content: result.content,
      filePath,
      lastModified: new Date().toISOString(),
      isDirty: false,
    });
    await syncMtime(filePath, { isCurrent: true, afterSave: true });
    showToast(okToast, 'success');
  }, [readFile, openNote, showToast, syncMtime]);

  // Create today's daily note
  const handleCreateDaily = useCallback(async () => {
    if (!currentDir) {
      showToast('请先打开一个文件夹');
      return;
    }
    const filePath = dailyNotePath(currentDir);
    const tpl = templates.find(t => t.id === 'tpl-daily') || templates.find(t => /daily|日记|日志/i.test(t.name));
    const content = applyTemplate(tpl?.content || `# ${todayTitle()}\n\n## 今日计划\n- [ ]\n`, todayTitle());
    await createAndOpenNote(filePath, content, '已打开今日日记');
    refreshFileList(currentDir);
    refreshKnowledgeIndex(currentDir);
  }, [currentDir, templates, createAndOpenNote, refreshFileList, refreshKnowledgeIndex, showToast]);

  // Electron IPC listeners
  // 注意：此 effect 依赖数组为 []，所有 handler 闭包捕获的是首次渲染的值。
  // 当前应用已迁移至 Tauri，electronAPI.isElectron 为 false，此 effect 会直接 return，
  // 因此过期闭包不会造成实际问题。若将来恢复 Electron 支持，需将 handler 改为 ref 或添加依赖。
  useEffect(() => {
    if (!electronAPI.isElectron) return;

    const handlers: Record<string, (...args: any[]) => void> = {
      'new-note': () => handleNewNote(),
      'open-file': (filePath: string) => handleOpenFile(filePath),
      'open-folder': (dirPath: string) => handleOpenFolder(dirPath),
      'save-file': () => handleSave(),
      'save-file-as': () => handleSaveAs(),
      'export-html': () => handleExportHtml(),
      'export-pdf': () => handleExportPdf(),
      'toggle-source-mode': () => setEditorMode(prev => prev === 'wysiwyg' ? 'source' : 'wysiwyg'),
      'toggle-focus-mode': () => setFocusMode(prev => !prev),
      'toggle-typewriter-mode': () => setTypewriterMode(prev => !prev),
      'toggle-sidebar': () => setSidebarOpen(prev => !prev),
      'toggle-outline': () => setOutlineOpen(prev => !prev),
      'toggle-dark-mode': () => cycleTheme(),
      'toggle-find-replace': () => setShowFindReplace(prev => !prev),
      'quick-switch': () => setShowQuickSwitcher(true),
      'command-palette': () => setShowCommandPalette(true),
      'insert-table': () => editorRef.current?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      'insert-image': async () => {
        const url = await promptDialog({
          title: '插入图片',
          placeholder: 'https://… 或图片的相对路径',
          confirmText: '插入',
          validate: validateUrl,
        });
        if (url) editorRef.current?.chain().focus().setImage({ src: url }).run();
      },
      'insert-link': async () => {
        const url = await promptDialog({
          title: '插入链接',
          placeholder: 'https://… 或 [[双链目标]]',
          confirmText: '插入',
          validate: validateUrl,
        });
        if (url) editorRef.current?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
      },
      'insert-code-block': () => editorRef.current?.chain().focus().toggleCodeBlock().run(),
      'insert-math': () => editorRef.current?.chain().focus().toggleMath().run(),
      'insert-horizontal-rule': () => editorRef.current?.chain().focus().setHorizontalRule().run(),
      'insert-emoji': () => { /* handled by Editor component */ },
      'insert-math-formula': () => editorRef.current?.chain().focus().toggleMath().run(),
      // Knowledge management
      'toggle-graph': () => setShowKnowledgeGraph(prev => !prev),
      'toggle-backlinks': () => setShowBacklinks(prev => !prev),
      'create-daily-note': () => handleCreateDaily(),
      'insert-template': () => setShowQuickInsert(true),
      // AI
      'toggle-ai-panel': () => setShowAIPanel(prev => !prev),
      'open-settings': () => setShowSettings(true),
      'ai-summarize': () => { setShowAIPanel(true); /* user clicks Summarize */ },
      'ai-tags': () => { setShowAIPanel(true); },
      'ai-outline': () => { setShowAIPanel(true); },
    };

    Object.entries(handlers).forEach(([event, handler]) => {
      electronAPI.on(event, (...args: any[]) => handler(...args));
    });

    return () => {
      Object.keys(handlers).forEach(event => electronAPI.removeAllListeners(event));
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const cmd = e.metaKey || e.ctrlKey;
      // e.key 的大小写跟着 Caps Lock / Shift 变（开着大写锁定按 ⌘B 拿到的是 'B'），
      // 统一转小写、要靠 shiftKey 区分组合，否则这批快捷键会整片静默失效
      const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
      // Cmd+S 保存（带 Shift 时留给下面的另存为）
      if (cmd && key === 's' && !e.shiftKey) {
        e.preventDefault();
        if (document.activeElement?.closest('.editor-pane-split')) {
          handleSaveSplitRef.current();
        } else {
          handleSaveRef.current();
        }
        return;
      }
      if (cmd && key === 'p' && !e.shiftKey) {
        e.preventDefault();
        setShowQuickSwitcher(true);
      } else if (cmd && e.shiftKey && key === 'p') {
        e.preventDefault();
        setShowCommandPalette(true);
      } else if (cmd && key === 'n') {
        e.preventDefault();
        menuActionsRef.current['new-note']?.();
      } else if (cmd && e.shiftKey && key === 's') {
        e.preventDefault();
        menuActionsRef.current['save-as']?.();
      } else if (cmd && key === 'b') {
        // 编辑器内 Cmd+B 被 Tiptap 的加粗拦走，这里只在编辑器之外生效
        e.preventDefault();
        menuActionsRef.current['toggle-sidebar']?.();
      } else if (cmd && e.shiftKey && key === 'i') {
        e.preventDefault();
        setShowQuickInsert(true);
      } else if (cmd && key === 'f') {
        e.preventDefault();
        setShowFindReplace(true);
      } else if (cmd && e.key === '/') {
        e.preventDefault();
        setEditorMode(prev => prev === 'wysiwyg' ? 'source' : 'wysiwyg');
      } else if (cmd && e.shiftKey && key === 'o') {
        e.preventDefault();
        menuActionsRef.current['open-folder']?.();
      } else if (cmd && key === 'j') {
        e.preventDefault();
        setShowAIPanel(prev => !prev);
      } else if (cmd && e.key === ',') {
        // macOS 惯例：Cmd+, 打开设置
        e.preventDefault();
        setShowSettings(true);
      } else if (cmd && e.shiftKey && key === 'd') {
        // 每日笔记移至 Cmd+Shift+D（Cmd+D 让给多光标）
        e.preventDefault();
        menuActionsRef.current['create-daily']?.();
      } else if (cmd && e.shiftKey && key === 'g') {
        e.preventDefault();
        setShowKnowledgeGraph(prev => !prev);
      } else if (cmd && e.shiftKey && key === 'h') {
        // Cmd+Shift+H：版本历史
        e.preventDefault();
        setShowVersionHistory(true);
      } else if (cmd && key === 'w' && !e.shiftKey) {
        // Cmd+W：关闭当前标签
        e.preventDefault();
        if (activeTabIdRef.current) closeTab(activeTabIdRef.current);
      } else if (cmd && e.shiftKey && e.code === 'BracketLeft') {
        // Cmd+Shift+[：上一个标签
        e.preventDefault();
        switchTab(-1);
      } else if (cmd && e.shiftKey && e.code === 'BracketRight') {
        // Cmd+Shift+]：下一个标签
        e.preventDefault();
        switchTab(1);
      } else if (cmd && e.code === 'Backslash') {
        // Cmd+\：切换分屏
        e.preventDefault();
        toggleSplit();
      } else if (e.key === 'Escape') {
        setShowQuickSwitcher(false);
        setShowCommandPalette(false);
        setShowFindReplace(false);
        setShowQuickInsert(false);
        setShowVersionHistory(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // 这个 effect 只在挂载时注册一次，闭包里直接调的 handler 永远是首帧那一份。
    // 凡读 state 的（create-daily 要 currentDir）都会因此拿到过期值 —— 实测 Cmd+Shift+D
    // 在已经打开 demo 目录的情况下弹「请先打开一个文件夹」。统一走 menuActionsRef，
    // 它每次渲染都重新指向当前闭包（菜单事件通道本来就是这么接的）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeTab, switchTab, toggleSplit]);

  // 关闭窗口前检查未保存的更改
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasDirty = openTabsRef.current.some(t => t.isDirty);
      if (hasDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // 组件卸载时清理自动保存定时器
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      if (splitDebounce.current) {
        clearTimeout(splitDebounce.current);
      }
    };
  }, []);

  const cycleTheme = useCallback(() => {
    setTheme(prev => {
      const idx = THEMES.findIndex(t => t.name === prev);
      const next = THEMES[(idx + 1) % THEMES.length];
      applyTheme(next.name);
      return next.name;
    });
  }, []);

  const handleNewNote = useCallback(async () => {
    if (!currentDir) {
      showToast('请先打开一个文件夹');
      return;
    }
    try {
      // 注意：这里只是内存态便签（filePath 为空），并没有落盘。
      // ⌘S 会走"另存为"拿到真实路径；崩溃恢复 WAL 也只在有路径时才写。
      const created = createNewNote();
      openNote(created);
      setLastSaved(null);
    } catch (e) {
      showToast(`创建失败: ${e}`, 'error');
    }
  }, [openNote, currentDir, createNewNote, showToast]);

  const handleOpenFile = useCallback(async (filePath: string) => {
    // 若标签已打开，仅聚焦，避免覆盖未保存编辑
    if (openTabsRef.current.some(t => t.id === filePath)) {
      setActiveTabId(filePath);
      await syncMtime(filePath, { isCurrent: true });
      return;
    }
    setIsLoading(true);
    // 读不到文件只默默 return 的话：转圈停了、界面回到原样、一句提示都没有，
    // 从「最近打开」/图谱/双链点进来时看着就跟"鼠标没点上"一样，用户只会再点一次。
    const fail = (reason: string) => showToast(`无法打开 ${displayName(filePath)}：${reason}`, 'error');
    try {
      // 通用打开:按文件类型路由,生成对应 Note
      const { kindOf, mimeOf, isEditable } = await import('./lib/fileTypes');
      const kind = kindOf(filePath);
      const title = displayName(filePath);
      const mime = mimeOf(filePath);

      // 拿文件元信息
      let size = 0;
      let mtime = '';
      try {
        const meta = await getFileMeta(filePath);
        if (meta.success) { size = meta.size; mtime = meta.modified; }
      } catch {}

      // 根据类型决定读取方式
      let content = '';
      let dataUrl: string | undefined;

      if (kind === 'markdown' || kind === 'code' || kind === 'csv') {
        const result = await readFile(filePath);
        if (result.success && result.content !== undefined) {
          content = result.content;
        } else {
          fail(result.error || '文件读取失败');
          return;
        }
      } else {
        // 二进制:读 base64 + 拼 dataUrl
        const result = await readFileBinary(filePath);
        if (result.success && result.base64) {
          dataUrl = `data:${mime};base64,${result.base64}`;
        } else {
          fail(result.error || '文件读取失败');
          return;
        }
      }

      openNote({
        id: filePath,
        title,
        content,
        filePath,
        lastModified: new Date().toISOString(),
        isDirty: false,
        fileType: kind,
        dataUrl,
        fileSize: size,
        fileMtime: mtime,
        fileMime: mime,
        isReadonly: !isEditable(kind),
      });

      if (mtime) setLastSaved(mtime);
    } catch (e: any) {
      // invoke 在 Rust 侧返回 Err 时是 reject（路径越权、无读权限都走这里），
      // 不接住就是一条 unhandled rejection，用户那边依旧"点了没反应"
      fail(e?.message || String(e));
    } finally {
      setIsLoading(false);
    }
  }, [readFile, readFileBinary, getFileMeta, openNote, showToast, syncMtime]);

  // 编辑器里 Cmd+点击 [[链接]] → 按标题/文件名解析并打开（主窗格与分屏共用同一份逻辑）
  const handleWikiLinkNavigate = useCallback((href: string) => {
    const t = parseWikiLinkTarget(href);
    if (!t) return;
    const existing = openTabsRef.current.find(x => x.title === t);
    if (existing) { setActiveTabId(existing.id); return; }
    const m = allFiles.find(f => {
      const fn = f.name?.replace(/\.md$/, '').replace(/\.markdown$/, '');
      return fn === t || f.path?.endsWith(`/${t}.md`) || f.path?.endsWith(`/${t}.markdown`);
    });
    if (m) handleOpenFile(m.path);
    else showToast(`未找到笔记: ${t}`, 'error');
  }, [allFiles, handleOpenFile, showToast]);

  // `[[` 补全的候选：目录里的 markdown 笔记名。allFiles 的 name 在 refreshFileList 里
  // 就已经去掉了 .md/.markdown（它同时也是 handleWikiLinkNavigate 的比对键），
  // 所以"是不是 markdown"只能看 path——用 name 判扩展名会一条都筛不出来。
  // 排掉当前这篇：给自己建双链没意义，还占掉了最想要的第一行。
  const wikiTargets = useMemo(() => {
    const cur = currentNote?.filePath || '';
    const seen = new Set<string>();
    for (const f of allFiles) {
      if (!/\.(md|markdown)$/i.test(f.path || '')) continue;
      if (f.path === cur) continue;
      if (f.name) seen.add(f.name);
    }
    return [...seen];
  }, [allFiles, currentNote?.filePath]);

  const handleOpenFolder = useCallback((dirPath: string) => {
    if (dirPath) {
      setCurrentDir(dirPath);
      localStorage.setItem('currentDir', dirPath);
      refreshFileList(dirPath);
      refreshKnowledgeIndex(dirPath);
    }
  }, [refreshFileList, refreshKnowledgeIndex]);

  const handleOpenFolderDialog = useCallback(async () => {
    const result = await electronAPI.invoke('show-open-dialog');
    if (!result.canceled && result.filePath) {
      setCurrentDir(result.filePath);
      localStorage.setItem('currentDir', result.filePath);
      refreshFileList(result.filePath);
      refreshKnowledgeIndex(result.filePath);
    }
  }, [refreshFileList, refreshKnowledgeIndex]);

  // 根据文件类型路由渲染:markdown → tiptap 编辑器,其他 → 专用 viewer
  // 编辑器 Frontmatter 解析（轻量、不引入 gray-matter）
  const [frontmatterMeta, setFrontmatterMeta] = useState<Record<string, unknown>>({});
  useEffect(() => {
    if (currentNote?.fileType === 'markdown') {
      const { data } = parseFrontmatter(currentNote.content);
      setFrontmatterMeta(data);
    }
  }, [currentNote?.content, currentNote?.fileType]);

  const fmElement = currentNote?.fileType === 'markdown' ? (
    <FrontmatterMeta meta={frontmatterMeta} editable={false} />
  ) : null;

  const renderFileContent = (note: Note, isSplit = false) => {
    const kind = note.fileType || 'markdown';
    const fp = note.filePath || '';
    const mime = note.fileMime || 'application/octet-stream';
    const dataUrl = note.dataUrl;
    // 所见即所得只编辑正文：Tiptap 会把 YAML 头当普通段落重排（`tags:` 和 `- 条目`
    // 之间插空行、缩进消失），存一次元数据就走形。回写时再把原块一字不动贴回去，
    // 顶部的元数据卡片显示的还是同一份 frontmatter。
    const editableBody = stripFrontmatter(note.content);
    const writeBack = (body: string) => withFrontmatter(note.content, body);

    // markdown 走原 tiptap 编辑器(主/分屏参数不同)
    if (kind === 'markdown') {
      if (isSplit) {
        return (
          <>
            {fmElement}
            <Editor
            content={editableBody}
            onChange={body => handleSplitContentChange(writeBack(body))}
            title={note.title}
            onTitleChange={handleSplitTitleChange}
            editorMode={editorMode}
            focusMode={focusMode}
            typewriterMode={typewriterMode}
            showFindReplace={false}
            onToggleFindReplace={() => {}}
            onStatsChange={setSplitStats}
            onHeadingsChange={setSplitHeadings}
            onWikiLinksChange={() => {}}
            currentFilePath={fp}
            editorRef={editorRefSplit}
            onActiveHeadingChange={handleSplitActiveHeadingChange}
            scrollSyncTarget={mainScrollRef}
            onWikiLinkClick={handleWikiLinkNavigate}
            onTagClick={(tag: string) => handleTagClick(tag)}
            documentWide={rightPanelWide}
            wikiTargets={wikiTargets}
          />
          </>
        );
      }
      return (
        <>
          {fmElement}
          <Editor
            content={editableBody}
            onChange={body => handleContentChange(writeBack(body))}
            title={note.title}
            onTitleChange={handleTitleChange}
            editorMode={editorMode}
            focusMode={focusMode}
            typewriterMode={typewriterMode}
            showFindReplace={showFindReplace}
            onToggleFindReplace={() => setShowFindReplace(false)}
            onStatsChange={setStats}
            onHeadingsChange={setHeadings}
            documentWide={rightPanelWide}
            onWikiLinksChange={handleWikiLinksChange}
            currentFilePath={fp}
            editorRef={editorRef}
            onActiveHeadingChange={handleActiveHeadingChange}
            scrollSyncTarget={splitScrollRef}
            onWikiLinkClick={handleWikiLinkNavigate}
            onTagClick={(tag: string) => handleTagClick(tag)}
            wikiTargets={wikiTargets}
          />
        </>
      );
    }

    // 其他类型 viewer
    switch (kind) {
      case 'image':
        return <ImageViewer filePath={fp} dataUrl={dataUrl || ''} mime={mime} />;
      case 'video':
        return <VideoPlayer filePath={fp} dataUrl={dataUrl || ''} mime={mime} />;
      case 'audio':
        return <AudioPlayer filePath={fp} dataUrl={dataUrl || ''} mime={mime} />;
      case 'code':
        return <CodeViewer filePath={fp} content={note.content} />;
      case 'csv':
        return <CsvViewer filePath={fp} content={note.content} />;
      case 'pdf':
        return <PdfViewer filePath={fp} dataUrl={dataUrl || ''} mime={mime} />;
      case 'docx':
        return <DocxViewer filePath={fp} dataUrl={dataUrl || ''} mime={mime} />;
      case 'xlsx':
        return <XlsxViewer filePath={fp} dataUrl={dataUrl || ''} mime={mime} />;
      case 'binary':
      default:
        return (
          <BinaryViewer
            filePath={fp}
            size={note.fileSize || 0}
            modified={note.fileMtime || ''}
            mime={mime}
          />
        );
    }
  };

  // ---------- WAL 暂存内容的恢复入口 ----------
  const refreshWal = useCallback(() => {
    setWalEntries(Object.values(walStore.readAll()).sort((a, b) => b.ts - a.ts));
  }, []);

  useEffect(() => {
    refreshWal();
  }, [refreshWal]);

  // 把暂存内容塞回标签：已打开的原地覆盖并标脏；未打开的直接用暂存内容建标签
  // （不从磁盘读，避免"读盘失败却已经把 WAL 清掉"造成二次丢失）
  const restoreWalEntry = useCallback(async (entry: WalEntry) => {
    if (openTabsRef.current.some(t => t.id === entry.filePath)) {
      setOpenTabs(prev => prev.map(t =>
        t.id === entry.filePath ? { ...t, content: entry.content, isDirty: true } : t
      ));
    } else {
      const { kindOf, isEditable } = await import('./lib/fileTypes');
      const kind = kindOf(entry.filePath);
      openNote({
        id: entry.filePath,
        filePath: entry.filePath,
        title: displayName(entry.filePath),
        content: entry.content,
        fileType: kind,
        isReadonly: !isEditable(kind),
        isDirty: true,
      });
    }
    setActiveTabId(entry.filePath);
    walStore.clear(entry.filePath);
    refreshWal();
    showToast('已恢复暂存内容，请检查后保存');
  }, [openNote, refreshWal]);

  const restoreAllWal = useCallback(async () => {
    const pending = Object.values(walStore.readAll());
    for (const entry of pending) {
      await restoreWalEntry(entry);
    }
  }, [restoreWalEntry]);

  const discardWalEntry = useCallback((filePath: string) => {
    walStore.clear(filePath);
    refreshWal();
  }, [refreshWal]);

  const discardAllWal = useCallback(() => {
    for (const filePath of Object.keys(walStore.readAll())) {
      walStore.clear(filePath);
    }
    refreshWal();
    showToast('已丢弃本地暂存内容');
  }, [refreshWal, showToast]);

  const handleSave = useCallback(async () => {
    if (!currentNote || !currentNote.isDirty) return;
    if (currentNote.filePath) {
      setMainSaveState('saving');
      try {
        await writeFile(currentNote.filePath, currentNote.content);
      } catch (e) {
        // 写入失败：不更新 isDirty，写 WAL 兜底，toast 告知用户
        walStore.write(currentNote.filePath, currentNote.content);
        setMainSaveState('error');
        refreshWal();
        showToast(`保存失败（${errText(e)}），内容已暂存，可在顶部横幅恢复`, 'error');
        return;
      }
      // 写入成功后再清理 WAL（refreshWal：横幅读的是 state，不清的话它会一直挂着
      // 一条已经落盘的"未写入"提示，点「恢复」还会把旧内容盖回编辑器）
      walStore.clear(currentNote.filePath);
      refreshWal();
      setMainSaveState('saved');
      // 创建备份（版本历史）—— 节流：同文件 5 分钟内不重复备份
      if (shouldCreateBackup(currentNote.filePath)) {
        try {
          mustSucceed(await electronAPI.invoke('create-backup', currentNote.filePath, currentNote.content));
          markBackedUp(currentNote.filePath);
        } catch (e) {
          console.warn('创建备份失败:', errText(e));
        }
      }
      updateActiveTab({ isDirty: false });
      await syncMtime(currentNote.filePath, { isCurrent: true, afterSave: true });
      showToast('已保存', 'success');
      // Refresh knowledge index since tags/links may have changed
      if (currentDir) {
        refreshKnowledgeIndex(currentDir);
        refreshBacklinks();
      }
    } else {
      handleSaveAs();
    }
  }, [currentNote, writeFile, currentDir, refreshKnowledgeIndex, refreshBacklinks, updateActiveTab, showToast, syncMtime]);
  handleSaveRef.current = handleSave;

  const handleSaveAs = useCallback(async () => {
    if (!currentNote) return;
    const title = currentNote.title || '未命名';
    const result = await showSaveDialog(`~/Documents/${title}.md`);
    if (!result.canceled && result.filePath) {
      try {
        await writeFile(result.filePath, currentNote.content);
      } catch (e) {
        // 没写成就不改标签指向：否则一条不存在的文件被当成已保存（脏标记清掉后
        // 关标签就全没了，WAL 又只在写失败那条路径里兜底）
        showToast(`另存为失败（${errText(e)}），内容仍未保存`, 'error');
        return;
      }
      updateActiveTab({
        filePath: result.filePath,
        isDirty: false,
        title: displayName(result.filePath) || title,
      });
      // 另存为之后也要对上时间戳：状态栏「已保存 HH:MM」和外部修改检测都读它
      await syncMtime(result.filePath, { isCurrent: true, afterSave: true });
      showToast('已保存', 'success');
    }
  }, [currentNote, writeFile, showSaveDialog, showToast, updateActiveTab, syncMtime]);

  const handleExportHtml = useCallback(async () => {
    if (!currentNote) return;
    const filePath = currentNote.filePath || `~/Documents/${currentNote.title}.md`;
    const result = await exportHtml(currentNote.content, filePath);
    if (result.success) {
      showToast(`已导出 HTML：${result.filePath}`, 'success');
    } else {
      showToast(`导出失败: ${result.error || '未知错误'}`, 'error');
    }
  }, [currentNote, exportHtml, showToast]);

  const handleExportPdf = useCallback(async () => {
    if (!currentNote) return;
    const filePath = currentNote.filePath || `~/Documents/${currentNote.title}.md`;
    const result = await exportPdf(currentNote.content, filePath);
    if (result.success) {
      showToast(`已导出 PDF：${result.filePath}`, 'success');
    } else {
      showToast(`导出失败: ${result.error || '未知错误'}`, 'error');
    }
  }, [currentNote, exportPdf, showToast]);

  const handleContentChange = useCallback((content: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    updateActiveTab({ content, isDirty: true });
    debounceTimer.current = setTimeout(() => handleSaveRef.current(), 2000);
  }, [updateActiveTab]);

  const handleTitleChange = useCallback((title: string) => {
    updateActiveTab({ title, isDirty: true });
  }, [updateActiveTab]);

  // 分屏右窗格的保存（独立防抖）
  const splitDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSaveSplit = useCallback(async () => {
    if (!splitNote || !splitNote.isDirty || !splitNote.filePath) return;
    setSplitSaveState('saving');
    try {
      await writeFile(splitNote.filePath, splitNote.content);
    } catch (e) {
      walStore.write(splitNote.filePath, splitNote.content);
      setSplitSaveState('error');
      refreshWal();
      showToast(`分屏保存失败（${errText(e)}），内容已暂存，可在顶部横幅恢复`, 'error');
      return;
    }
    walStore.clear(splitNote.filePath);
    refreshWal();
    setSplitSaveState('saved');
    // 分屏同样需要版本历史（之前漏掉，P0 缺陷）
    if (shouldCreateBackup(splitNote.filePath)) {
      try {
        mustSucceed(await electronAPI.invoke('create-backup', splitNote.filePath, splitNote.content));
        markBackedUp(splitNote.filePath);
      } catch (e) {
        console.warn('分屏创建备份失败:', errText(e));
      }
    }
    updateNote(splitNote.id, { isDirty: false });
    await syncMtime(splitNote.filePath, { isCurrent: false, isSplit: true, afterSave: true });
    if (currentDir) {
      refreshKnowledgeIndex(currentDir);
      refreshBacklinks();
    }
  }, [splitNote, writeFile, currentDir, refreshKnowledgeIndex, refreshBacklinks, updateNote, showToast, syncMtime]);
  handleSaveSplitRef.current = handleSaveSplit;

  const handleSplitContentChange = useCallback((content: string) => {
    if (!splitNote) return;
    updateNote(splitNote.id, { content, isDirty: true });
    if (splitDebounce.current) clearTimeout(splitDebounce.current);
    splitDebounce.current = setTimeout(() => handleSaveSplitRef.current(), 2000);
  }, [splitNote, updateNote]);

  const handleSplitTitleChange = useCallback((title: string) => {
    if (!splitNote) return;
    updateNote(splitNote.id, { title, isDirty: true });
  }, [splitNote, updateNote]);

  // Wiki links are now tracked globally via refreshKnowledgeIndex (reads all notes).
  // This handler is kept for the Editor's prop interface but does not mutate graph state
  // (the previous implementation duplicated links on every keystroke).
  const handleWikiLinksChange = useCallback((_links: WikiLinkItem[]) => {
    // no-op: graph is rebuilt by refreshKnowledgeIndex after save / folder open
  }, []);

  const handleJumpToHeading = useCallback((pos: number) => {
    editorRef.current?.jumpToHeading?.(pos);
  }, []);

  // 分屏右窗格标题跳转（使用 editorRefSplit）
  const handleJumpToHeadingSplit = useCallback((pos: number) => {
    editorRefSplit.current?.jumpToHeading?.(pos);
  }, []);

  // Track active heading based on cursor position（由 Editor 通过 onActiveHeadingChange 上报）
  const handleActiveHeadingChange = useCallback((id: string | null) => {
    setActiveHeading(id);
  }, []);

  // 分屏右窗格的活跃标题变化
  const handleSplitActiveHeadingChange = useCallback((id: string | null) => {
    setSplitActiveHeading(id);
  }, []);

  // ===== 原生菜单栏事件分发（Rust 侧 emit 的 "zennote-menu"）=====
  // 动作表每次渲染刷新到 ref，确保菜单触发时调用的是最新闭包（依赖 currentNote 等状态）。
  // 注意：必须位于所有被引用 handler 声明之后（useMemo factory 在渲染时立即执行，避免 TDZ）。
  const openWelcomeGuide = useCallback(() => {
    openNote({
      id: 'demo-welcome',
      title: '使用指南',
      content: DEMO_CONTENT,
      filePath: '',
      fileType: 'markdown',
      lastModified: new Date().toISOString(),
      isDirty: false,
    });
  }, [openNote]);
  const menuActions: Record<string, () => void> = useMemo(() => ({
    'new-note': handleNewNote,
    'open-folder': handleOpenFolderDialog,
    'save': () => handleSaveRef.current(),
    'save-as': handleSaveAs,
    'export-html': handleExportHtml,
    'export-pdf': handleExportPdf,
    'create-daily': handleCreateDaily,
    'version-history': () => setShowVersionHistory(true),
    'close-tab': () => { if (activeTabIdRef.current) closeTab(activeTabIdRef.current); },
    'find': () => setShowFindReplace(true),
    'toggle-sidebar': () => setSidebarOpen(prev => !prev),
    'toggle-outline': () => setOutlineOpen(prev => !prev),
    'toggle-backlinks': () => setShowBacklinks(prev => !prev),
    'toggle-graph': () => setShowKnowledgeGraph(prev => !prev),
    'toggle-ai': () => setShowAIPanel(prev => !prev),
    'toggle-source': () => setEditorMode(prev => prev === 'wysiwyg' ? 'source' : 'wysiwyg'),
    'toggle-focus': () => setFocusMode(prev => !prev),
    'toggle-typewriter': () => setTypewriterMode(prev => !prev),
    'cycle-theme': cycleTheme,
    'quick-switch': () => setShowQuickSwitcher(true),
    'command-palette': () => setShowCommandPalette(true),
    'command-palette-help': () => setShowCommandPalette(true),
    'prev-tab': () => switchTab(-1),
    'next-tab': () => switchTab(1),
    'open-settings': () => setShowSettings(true),
    'welcome-guide': openWelcomeGuide,
  }), [handleNewNote, handleOpenFolderDialog, handleSaveAs, handleExportHtml, handleExportPdf, handleCreateDaily, cycleTheme, closeTab, switchTab, openWelcomeGuide]);
  const menuActionsRef = useRef(menuActions);
  menuActionsRef.current = menuActions;

  useEffect(() => {
    if (!electronAPI.isTauri) return;
    let unlisten: (() => void) | undefined;
    listen<string>('zennote-menu', (event) => {
      menuActionsRef.current[event.payload]?.();
    }).then(fn => { unlisten = fn; }).catch(console.warn);
    return () => { unlisten?.(); };
  }, []);

  // Build command palette commands
  // 标题/分类统一中文（与应用其余 UI 一致），id 保留英文以支持英文前缀检索
  const commands: Command[] = useMemo(() => [
    { id: 'new-note', title: '新建笔记', shortcut: 'Cmd+N', category: '文件', action: handleNewNote },
    { id: 'save', title: '保存', shortcut: 'Cmd+S', category: '文件', action: handleSave },
    { id: 'save-as', title: '另存为', shortcut: 'Cmd+Shift+S', category: '文件', action: handleSaveAs },
    { id: 'daily-note', title: '今日日记', shortcut: 'Cmd+Shift+D', category: '文件', action: handleCreateDaily },
    { id: 'open-folder', title: '打开文件夹', shortcut: 'Cmd+Shift+O', category: '文件', action: handleOpenFolderDialog },
    { id: 'version-history', title: '版本历史', shortcut: 'Cmd+Shift+H', category: '文件', action: () => setShowVersionHistory(true) },
    { id: 'insert-template', title: '从模板插入', shortcut: 'Cmd+Shift+I', category: '插入', action: () => setShowQuickInsert(true) },
    { id: 'export-html', title: '导出为 HTML', category: '导出', action: handleExportHtml },
    { id: 'export-pdf', title: '导出为 PDF', category: '导出', action: handleExportPdf },
    { id: 'toggle-source', title: '切换源码模式', shortcut: 'Cmd+/', category: '视图', action: () => setEditorMode(prev => prev === 'wysiwyg' ? 'source' : 'wysiwyg') },
    { id: 'toggle-focus', title: '切换专注模式', category: '视图', action: () => setFocusMode(prev => !prev) },
    { id: 'toggle-typewriter', title: '切换打字机模式', category: '视图', action: () => setTypewriterMode(prev => !prev) },
    { id: 'toggle-sidebar', title: '切换侧边栏', shortcut: 'Cmd+B', category: '视图', action: () => setSidebarOpen(prev => !prev) },
    { id: 'toggle-outline', title: '切换大纲', category: '视图', action: () => setOutlineOpen(prev => !prev) },
    { id: 'toggle-graph', title: '切换知识图谱', shortcut: 'Cmd+Shift+G', category: '视图', action: () => setShowKnowledgeGraph(prev => !prev) },
    { id: 'toggle-backlinks', title: '切换反向链接', category: '视图', action: () => setShowBacklinks(prev => !prev) },
    { id: 'toggle-split', title: '切换分屏', shortcut: 'Cmd+\\', category: '视图', action: toggleSplit },
    { id: 'cycle-theme', title: '切换主题', category: '视图', action: cycleTheme },
    { id: 'close-tab', title: '关闭标签页', shortcut: 'Cmd+W', category: '视图', action: () => { if (activeTabIdRef.current) closeTab(activeTabIdRef.current); } },
    { id: 'next-tab', title: '下一个标签页', shortcut: 'Cmd+Shift+]', category: '视图', action: () => switchTab(1) },
    { id: 'prev-tab', title: '上一个标签页', shortcut: 'Cmd+Shift+[', category: '视图', action: () => switchTab(-1) },
    { id: 'toggle-ai', title: '切换 AI 助手', shortcut: 'Cmd+J', category: 'AI', action: () => setShowAIPanel(prev => !prev) },
    { id: 'toggle-find', title: '查找与替换', shortcut: 'Cmd+F', category: '编辑', action: () => setShowFindReplace(true) },
    { id: 'quick-switch', title: '快速切换文件', shortcut: 'Cmd+P', category: '跳转', action: () => setShowQuickSwitcher(true) },
    { id: 'open-settings', title: '打开设置', shortcut: 'Cmd+,', category: '设置', action: () => setShowSettings(true) },
    { id: 'welcome-guide', title: '打开新手引导', category: '设置', action: openWelcomeGuide },
  ], [handleNewNote, handleSave, handleSaveAs, handleCreateDaily, handleOpenFolderDialog, handleExportHtml, handleExportPdf, cycleTheme, closeTab, switchTab, toggleSplit, openWelcomeGuide]);

  const handleTagClick = useCallback((tag: string) => {
    setActiveTag(prev => prev === tag ? null : tag);
  }, []);

  // 右侧面板"宽/窄"切换：窄 = 300px(可拖拽微调)；宽 = 占满除侧边栏外的剩余宽度(隐藏编辑器)
  const toggleRightPanelWide = useCallback(() => {
    setRightPanelWide(prev => {
      const next = !prev;
      localStorage.setItem('rightPanelWide', next ? '1' : '0');
      return next;
    });
  }, []);

  // 当前打开的右侧面板（按优先级：KnowledgeGraph > AIPanel > Backlinks > Outline）
  const activeRightPanel: 'graph' | 'ai' | 'backlinks' | 'outline' | null =
    showKnowledgeGraph && currentNote ? 'graph'
    : showAIPanel ? 'ai'
    : showBacklinks && currentNote ? 'backlinks'
    : outlineOpen && currentNote ? 'outline'
    : null;

  // When a tag is active, filter the quick switcher-style file list to that tag's notes
  // 嵌套标签：选中父标签时包含所有后代标签的笔记（前缀匹配 "tag/" 或完全相等）
  const taggedFiles = useMemo(() => {
    if (!activeTag) return allFiles;
    return Array.from(new Set(
      tags
        .filter(t => t.name === activeTag || t.name.startsWith(activeTag + '/'))
        .flatMap(t => t.notes)
    )).map(p => ({
      path: p,
      name: displayName(p) || p,
      lastModified: Date.now(),
    }));
  }, [activeTag, tags, allFiles]);

  return (
    <I18nProvider>
    <ErrorBoundary>
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden' }}>
      <Sidebar
        isOpen={sidebarOpen}
        currentDir={currentDir}
        currentNote={currentNote}
        onOpenFile={handleOpenFile}
        onNewNote={handleNewNote}
        onOpenFolder={handleOpenFolder}
        refreshKey={treeVersion}
        onRefresh={refreshFileTree}
        onRename={handleFileRenamed}
        onDelete={handleFileDeleted}
        tags={tags}
        onTagClick={handleTagClick}
        activeTag={activeTag}
        onOpenSettings={() => setShowSettings(true)}
        onOpenAI={() => setShowAIPanel(true)}
        onCreateDaily={handleCreateDaily}
        width={sidebarWidth}
      />
      {sidebarOpen && (
        <Resizer
          side="left"
          size={sidebarWidth}
          min={180}
          max={480}
          onResize={(w) => {
            setSidebarWidth(w);
            localStorage.setItem('sidebarWidth', String(w));
          }}
        />
      )}

      <div style={{ flex: 1, flexDirection: 'column', overflow: 'hidden', display: 'flex' }}>
        <RecoveryBanner
          entries={walEntries}
          onRestore={entry => { void restoreWalEntry(entry); }}
          onRestoreAll={() => { void restoreAllWal(); }}
          onDiscard={discardWalEntry}
          onDiscardAll={discardAllWal}
        />
        <TabsBar
          tabs={openTabs}
          activeId={activeTabId}
          splitId={splitNote?.id || null}
          onSelect={(id) => {
            setActiveTabId(id);
            // 切换标签时把这篇的 mtime 对进状态栏（拿不到就留着上一份，别报个假时间）
            const tab = openTabs.find(t => t.id === id);
            if (tab?.filePath) void syncMtime(tab.filePath, { isCurrent: true });
            else setLastSaved(null);
          }}
          onClose={closeTab}
          onOpenInSplit={openInSplit}
          onToggleSplit={toggleSplit}
          isSplit={!!splitNote}
          onCloseOthers={closeOtherTabs}
          onCloseToRight={closeTabsToRight}
          onReorder={reorderTabs}
        />
        {openTabs.length === 0 ? (
          <Welcome
            onNewNote={handleNewNote}
            onOpenFolder={handleOpenFolderDialog}
            onCreateDaily={handleCreateDaily}
            onOpenGuide={openWelcomeGuide}
            onOpenFile={handleOpenFile}
            currentDir={currentDir}
          />
        ) : (
          <div className={`editor-area ${splitNote ? 'split' : ''}`}>
            <div className="editor-pane editor-pane-main">
              {isLoading && (
                <div className="editor-loading">
                  <div className="loading-spinner" />
                </div>
              )}
              {currentNote && (
                <>
                  <Breadcrumb
                    filePath={currentNote.filePath}
                    noteTitle={currentNote.title}
                    headings={headings}
                    activeHeadingId={activeHeading}
                    onHeadingClick={handleJumpToHeading}
                  />
                  {renderFileContent(currentNote)}
                  {currentNote.fileType === 'markdown' && (
                    <StatusBar
                      theme={theme}
                      onCycleTheme={cycleTheme}
                      isDirty={currentNote.isDirty}
                      lastSaved={lastSaved}
                      saveState={mainSaveState}
                      stats={stats}
                      editorMode={editorMode}
                      focusMode={focusMode}
                      typewriterMode={typewriterMode}
                      documentWide={rightPanelWide}
                      onToggleEditorMode={() => setEditorMode((prev: EditorMode) => prev === 'wysiwyg' ? 'source' : 'wysiwyg')}
                      onToggleFocusMode={() => setFocusMode((prev: boolean) => !prev)}
                      onToggleTypewriterMode={() => setTypewriterMode((prev: boolean) => !prev)}
                      onToggleDocumentWide={toggleRightPanelWide}
                    />
                  )}
                </>
              )}
            </div>
            {splitNote && (
              <div className="editor-pane editor-pane-split">
                <Breadcrumb
                  filePath={splitNote.filePath}
                  noteTitle={splitNote.title}
                  headings={splitHeadings}
                  activeHeadingId={splitActiveHeading}
                  onHeadingClick={handleJumpToHeadingSplit}
                />
                {renderFileContent(splitNote, /* split */ true)}
                {splitNote.fileType === 'markdown' && (
                  <StatusBar
                    theme={theme}
                    onCycleTheme={cycleTheme}
                    isDirty={splitNote.isDirty}
                    lastSaved={lastSavedSplit}
                    saveState={splitSaveState}
                    stats={splitStats}
                    editorMode={editorMode}
                    focusMode={focusMode}
                    typewriterMode={typewriterMode}
                    documentWide={rightPanelWide}
                    onToggleEditorMode={() => setEditorMode((prev: EditorMode) => prev === 'wysiwyg' ? 'source' : 'wysiwyg')}
                    onToggleFocusMode={() => setFocusMode((prev: boolean) => !prev)}
                    onToggleTypewriterMode={() => setTypewriterMode((prev: boolean) => !prev)}
                    onToggleDocumentWide={toggleRightPanelWide}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {showQuickSwitcher && (
        <QuickSwitcher
          files={taggedFiles}
          onSelect={(filePath) => {
            handleOpenFile(filePath);
            setShowQuickSwitcher(false);
          }}
          onClose={() => setShowQuickSwitcher(false)}
        />
      )}

      {showCommandPalette && (
        <CommandPalette
          commands={commands}
          onClose={() => setShowCommandPalette(false)}
        />
      )}

      {/* 右侧同一时刻只放一个面板，互斥规则就是上面 activeRightPanel 的优先级 */}
      {!rightPanelWide && activeRightPanel === 'outline' && (
        <>
          {!rightPanelWide && (
            <Resizer
              side="right"
              size={rightPanelWidth}
              min={200}
              max={520}
              onResize={(w) => {
                setRightPanelWidth(w);
                localStorage.setItem('rightPanelWidth', String(w));
              }}
            />
          )}
          <div
            className="outline-panel panel-animate"
            style={rightPanelWide ? { flex: 1, minWidth: 0 } : { width: rightPanelWidth, flexShrink: 0 }}
          >
            <PanelHeader
              icon={<ListTree size={14} />}
              title="大纲"
              wide={rightPanelWide}
              onToggleWide={toggleRightPanelWide}
              onClose={() => setOutlineOpen(false)}
            />
            <div className="outline-list">
              {headings.length === 0 ? (
                <div className="outline-item">暂无标题</div>
              ) : (
                headings.map((heading) => (
                  <button
                    key={heading.id}
                    className={`outline-item${activeHeading === heading.id ? ' active' : ''}`}
                    style={{ paddingLeft: `${12 + (heading.level - 1) * 16}px` }}
                    onClick={() => handleJumpToHeading(heading.pos)}
                    title={heading.text}
                  >
                    {heading.text}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {activeRightPanel === 'backlinks' && (
        <>
          {!rightPanelWide && (
            <Resizer
              side="right"
              size={rightPanelWidth}
              min={200}
              max={520}
              onResize={(w) => {
                setRightPanelWidth(w);
                localStorage.setItem('rightPanelWidth', String(w));
              }}
            />
          )}
          <div
            className="backlinks-panel panel-animate"
            style={rightPanelWide ? { flex: 1, minWidth: 0 } : { width: rightPanelWidth, flexShrink: 0 }}
          >
            <PanelHeader
              icon={<Link2 size={14} />}
              title="反向链接"
              badge={<span className="count-badge">{backlinks.length}</span>}
              wide={rightPanelWide}
              onToggleWide={toggleRightPanelWide}
              onClose={() => setShowBacklinks(false)}
            />
            <div className="backlinks-list">
              {backlinks.length === 0 ? (
                <div className="sidebar-empty">
                  <p>还没有反向链接</p>
                  <p className="hint">其他笔记中用 [[双向链接]] 指向本篇时，会出现在这里</p>
                </div>
              ) : (
                backlinks.map(b => (
                  <button
                    key={b.noteId}
                    className="sidebar-file-item"
                    onClick={() => {
                      handleOpenFile(b.noteId);
                      setShowBacklinks(false);
                    }}
                    title={b.noteId}
                  >
                    <FileText size={14} />
                    <span>{b.title}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {activeRightPanel === 'ai' && (
        <>
          {!rightPanelWide && (
            <Resizer
              side="right"
              size={rightPanelWidth}
              min={280}
              max={600}
              onResize={(w) => {
                setRightPanelWidth(w);
                localStorage.setItem('rightPanelWidth', String(w));
              }}
            />
          )}
          <div
            className="ai-panel panel-animate"
            style={rightPanelWide ? { flex: 1, minWidth: 0 } : { width: rightPanelWidth, flexShrink: 0 }}
          >
            <PanelHeader
              icon={<Sparkles size={14} />}
              title="AI 助手"
              wide={rightPanelWide}
              onToggleWide={toggleRightPanelWide}
              onClose={() => setShowAIPanel(false)}
            />
            <ErrorBoundary>
              <Suspense fallback={<div className="panel-loading">加载中...</div>}>
                <AIPanel
                  onAction={runAIAction}
                  onInsert={handleInsertText}
                  onClose={() => setShowAIPanel(false)}
                  enabled={aiConfig.enabled}
                  onOpenSettings={() => { setShowAIPanel(false); setShowSettings(true); }}
                  width={rightPanelWide ? undefined : rightPanelWidth}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        </>
      )}

      {activeRightPanel === 'graph' && (
        <>
          {!rightPanelWide && (
            <Resizer
              side="right"
              size={rightPanelWidth}
              min={260}
              max={600}
              onResize={(w) => {
                setRightPanelWidth(w);
                localStorage.setItem('rightPanelWidth', String(w));
              }}
            />
          )}
          <div
            className="knowledge-graph-panel panel-animate"
            style={rightPanelWide ? { flex: 1, minWidth: 0 } : { width: rightPanelWidth, flexShrink: 0 }}
          >
            <PanelHeader
              icon={<Network size={14} />}
              title="知识图谱"
              wide={rightPanelWide}
              onToggleWide={toggleRightPanelWide}
              onClose={() => setShowKnowledgeGraph(false)}
            />
            <ErrorBoundary>
              <Suspense fallback={<div className="panel-loading">加载中...</div>}>
                <KnowledgeGraph
                nodes={graphNodes}
                links={graphLinks}
                currentFilePath={currentNote.filePath}
                tags={tags}
                onNodeClick={(node) => {
                  if (node.path && node.path.endsWith('.md')) {
                    handleOpenFile(node.path);
                  }
                  setShowKnowledgeGraph(false);
                }}
              />
              </Suspense>
            </ErrorBoundary>
          </div>
        </>
      )}

      <ErrorBoundary>
        <Suspense fallback={null}>
          <SettingsDialog
          open={showSettings}
          aiConfig={aiConfig}
          templates={templates}
          config={config}
          currentDir={currentDir}
          onSaveAI={(cfg) => {
            setAIConfig(cfg);
            localStorage.setItem('aiConfig', JSON.stringify(cfg));
            showToast(cfg.enabled ? 'AI 助手已启用' : 'AI 助手已关闭');
          }}
          onSaveTemplates={(tpls) => {
            setTemplates(tpls);
            localStorage.setItem('templates', JSON.stringify(tpls));
          }}
          onSaveConfig={(cfg) => {
            setConfig(cfg);
            localStorage.setItem('appConfig', JSON.stringify(cfg));
          }}
          onClose={() => setShowSettings(false)}
        />
        </Suspense>
      </ErrorBoundary>

      <QuickInsert
        open={showQuickInsert}
        templates={templates}
        currentDir={currentDir}
        onInsert={(content) => {
          editorRef.current?.chain().focus().insertContent(content).run();
        }}
        onCreateDaily={async (filePath, content) => {
          if (!filePath) {
            showToast('请先打开一个文件夹');
            return;
          }
          await createAndOpenNote(filePath, content, '今日日记已创建');
          refreshFileList(currentDir);
          refreshKnowledgeIndex(currentDir);
        }}
        onClose={() => setShowQuickInsert(false)}
      />

      {showVersionHistory && currentNote?.filePath && (
        <ErrorBoundary>
          <Suspense fallback={<div className="panel-loading">加载中...</div>}>
            <VersionHistory
            notePath={currentNote.filePath}
            onRestore={(content) => {
              updateActiveTab({ content, isDirty: true });
              setShowVersionHistory(false);
            }}
            onClose={() => setShowVersionHistory(false)}
          />
          </Suspense>
        </ErrorBoundary>
      )}

      <ToastHost />
      <DialogHost />
    </div>
    </ErrorBoundary>
    </I18nProvider>
  );
};

export default App;
