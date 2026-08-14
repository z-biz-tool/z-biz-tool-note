import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { electronAPI } from './lib/electronAPI';
import { applyTheme, THEMES } from './lib/themes';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { StatusBar } from './components/StatusBar';
import { Outline } from './components/Outline';
import { QuickSwitcher } from './components/QuickSwitcher';
import { CommandPalette } from './components/CommandPalette';
import { KnowledgeGraph } from './components/KnowledgeGraph';
import { BacklinksPanel } from './components/BacklinksPanel';
import { AIPanel, type AIAction } from './components/AIPanel';
import { SettingsDialog } from './components/SettingsDialog';
import { QuickInsert } from './components/QuickInsert';
import { Breadcrumb } from './components/Breadcrumb';
import { TabsBar } from './components/TabsBar';
import VersionHistory from './components/VersionHistory';
import type { Note, ThemeName, EditorMode, HeadingItem, Command, WikiLinkItem, GraphNode, GraphLink, AIConfig, AIMessage, Template, Tag, Backlink } from './types';
import { useFileOperations } from './hooks/useFileOperations';
import { BUILTIN_TEMPLATES, applyTemplate, dailyNotePath, todayTitle } from './lib/templates';
import './index.css';

const DEMO_CONTENT = `# Welcome to ZenNote v2.0

A powerful cross-platform WYSIWYG Markdown note-taking app, inspired by Typora, Obsidian, and Notion.

## What's New

### Editor Modes
- **WYSIWYG Mode** — What you see is what you get
- **Source Mode** — Toggle with Cmd+/ to edit raw Markdown
- **Focus Mode** — Dim surrounding paragraphs for distraction-free writing
- **Typewriter Mode** — Keep the cursor centered on screen

### Rich Content
- **Math Formulas** — Full KaTeX support for inline and block math
- **Code Highlighting** — 12+ languages with syntax highlighting
- **Tables** — Resizable tables with full editing
- **Task Lists** — Interactive checkboxes
- **Images** — Paste from clipboard or drag & drop
- **Emoji Picker** — Built-in emoji selection

### File Management
- **Recursive File Tree** — Browse nested folders
- **Recent Files** — Quick access to recently opened notes
- **Global Search** — Search across all notes in a folder
- **Quick Switcher** — Press Cmd+P to jump between files

### Productivity
- **Outline Panel** — Navigate by headings
- **Find & Replace** — Press Cmd+F to search within notes
- **Command Palette** — Press Cmd+Shift+P for all commands
- **6 Themes** — Light, Dark, Sepia, Solarized, Dracula, Nord

### Export
- **HTML Export** — Export notes as styled HTML
- **PDF Export** — Export notes as PDF documents

## Math Example

Inline math: $E = mc^2$

Block math:

$$
\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
$$

## Code Example

\`\`\`typescript
interface Note {
  id: string;
  title: string;
  content: string;
  tags?: string[];
}

function createNote(title: string): Note {
  return {
    id: crypto.randomUUID(),
    title,
    content: '',
  };
}
\`\`\`

## Task List

- [x] WYSIWYG editor with Tiptap
- [x] Source mode toggle
- [x] Focus & typewriter modes
- [x] Math formula support (KaTeX)
- [x] Find & replace
- [x] Outline panel
- [x] Quick switcher (Cmd+P)
- [x] Command palette (Cmd+Shift+P)
- [x] 6 built-in themes
- [x] Global search
- [ ] Cloud sync
- [ ] Plugin system

> "The palest ink is better than the best memory." — Chinese Proverb

---

*Start writing your notes now!*`;

const App = () => {
  const { writeFile, showSaveDialog, exportHtml, exportPdf, createNewNote, readFile } = useFileOperations();

  // 多标签 + 分屏：openTabs 为所有打开的笔记，activeTabId 为左窗格当前笔记，
  // splitNote 为右窗格笔记（null 表示无分屏）。currentNote 由 activeTabId 派生，
  // 保留为派生值以兼容既有 save/AI/graph 逻辑。
  const [openTabs, setOpenTabs] = useState<Note[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [splitNote, setSplitNote] = useState<Note | null>(null);
  const currentNote = openTabs.find(t => t.id === activeTabId) || null;

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeName>('light');
  const [editorMode, setEditorMode] = useState<EditorMode>('wysiwyg');
  const [focusMode, setFocusMode] = useState(false);
  const [typewriterMode, setTypewriterMode] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [stats, setStats] = useState({ words: 0, characters: 0, lines: 0, readingTime: 0 });
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  // 分屏右窗格独立的标题/统计状态
  const [splitHeadings, setSplitHeadings] = useState<HeadingItem[]>([]);
  const [splitActiveHeading, setSplitActiveHeading] = useState<string | null>(null);
  const [splitStats, setSplitStats] = useState({ words: 0, characters: 0, lines: 0, readingTime: 0 });
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [allFiles, setAllFiles] = useState<Array<{ path: string; name: string; lastModified: number }>>([]);
  const [toast, setToast] = useState<string | null>(null);
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

  // Templates state
  const [templates, setTemplates] = useState<Template[]>(BUILTIN_TEMPLATES);
  const [showQuickInsert, setShowQuickInsert] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  const editorRef = useRef<any>(null);
  const editorRefSplit = useRef<any>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 用于避免防抖回调中的过期闭包问题（声明，在对应函数定义后赋值）
  const handleSaveRef = useRef<() => void>(() => {});
  const handleSaveSplitRef = useRef<() => void>(() => {});
  const openTabsRef = useRef(openTabs);
  openTabsRef.current = openTabs;
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

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
  const closeTab = useCallback((id: string) => {
    const tab = openTabsRef.current.find(t => t.id === id);
    if (tab?.isDirty && !window.confirm(`"${tab.title}" 有未保存的更改，确定关闭吗？`)) {
      return;
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
  const closeOtherTabs = useCallback((keepId: string) => {
    setOpenTabs(prev => prev.filter(t => t.id === keepId));
    setActiveTabId(keepId);
    setSplitNote(null);
  }, []);

  // 关闭右侧标签
  const closeTabsToRight = useCallback((tabId: string) => {
    setOpenTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId);
      if (idx < 0) return prev;
      return prev.slice(0, idx + 1);
    });
  }, []);

  // 切换标签（方向 -1 = 上一个，1 = 下一个）
  const switchTab = useCallback((direction: 1 | -1) => {
    setOpenTabs(prev => {
      if (prev.length === 0) return prev;
      const idx = prev.findIndex(t => t.id === activeTabId);
      const newIdx = (idx + direction + prev.length) % prev.length;
      setActiveTabId(prev[newIdx].id);
      return prev;
    });
  }, [activeTabId]);

  // 切换分屏：开 → 关；关 → 开（右窗格初始展示当前笔记）
  const toggleSplit = useCallback(() => {
    setSplitNote(prev => {
      if (prev) return null;
      return currentNote;
    });
  }, [currentNote]);

  // 在分屏中打开指定标签
  const openInSplit = useCallback((id: string) => {
    const note = openTabs.find(t => t.id === id);
    if (note) setSplitNote(note);
  }, [openTabs]);

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

    openNote({
      id: 'demo-welcome',
      title: 'Welcome to ZenNote',
      content: DEMO_CONTENT,
      filePath: '',
      lastModified: new Date().toISOString(),
      isDirty: false,
    });
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
      throw new Error('AI is not enabled. Open Settings → AI Provider to configure.');
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
      throw new Error(result.error || 'AI request failed');
    }
    return result.content || '(empty response)';
  }, [aiConfig, currentNote, allFiles]);

  const handleInsertText = useCallback((text: string) => {
    if (!editorRef.current) return;
    editorRef.current.chain().focus().insertContent('\n\n' + text + '\n').run();
    setShowAIPanel(false);
  }, []);

  // Toast helper
  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  }, []);

  // 文件监听：检测外部修改
  useEffect(() => {
    if (!currentNote?.filePath || !currentDir) return;
    const interval = setInterval(async () => {
      try {
        const mtime = await invoke('get_file_modified', { path: currentNote.filePath }) as string;
        if (lastSaved && mtime !== lastSaved) {
          if (window.confirm('文件已被外部修改，是否重新加载？')) {
            // 重新加载文件内容
            try {
              const result = await invoke('read_file', { path: currentNote.filePath }) as string;
              if (result) {
                updateActiveTab({ content: result, isDirty: false });
              }
            } catch (e) {
              console.warn('重新加载失败:', e);
            }
          }
          setLastSaved(mtime); // 更新记录，避免重复提示
        }
      } catch {
        // 文件可能已被删除，忽略
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [currentNote?.filePath, currentDir, lastSaved, showToast, updateActiveTab]);

  // Create today's daily note
  const handleCreateDaily = useCallback(async () => {
    if (!currentDir) {
      showToast('Open a folder first');
      return;
    }
    const filePath = dailyNotePath(currentDir);
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    try {
      await invoke('ensure_dir', { path: dir });
    } catch (e) { console.warn('创建目录失败:', dir, e); }
    const tpl = templates.find(t => t.id === 'tpl-daily') || templates.find(t => /daily/i.test(t.name));
    const content = applyTemplate(tpl?.content || `# ${todayTitle()}\n\n## Plan\n- [ ]\n`, todayTitle());

    try {
      await invoke('write_text_file', { path: filePath, content });
    } catch (e) { console.warn('写入每日笔记失败:', filePath, e); }
    const result = await readFile(filePath);
    if (result.success && result.content !== undefined) {
      openNote({
        id: filePath,
        title: todayTitle(),
        content: result.content,
        filePath,
        lastModified: new Date().toISOString(),
        isDirty: false,
      });
      // 保存后记录文件修改时间（用于外部修改检测）
      try {
        const mtime = await invoke('get_file_modified', { path: filePath }) as string;
        setLastSaved(mtime);
      } catch {}
      showToast('Daily note opened');
    }
    refreshFileList(currentDir);
    refreshKnowledgeIndex(currentDir);
  }, [currentDir, templates, readFile, refreshFileList, refreshKnowledgeIndex, showToast, openNote]);

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
      'insert-image': () => {
        const url = window.prompt('Image URL:');
        if (url) editorRef.current?.chain().focus().setImage({ src: url }).run();
      },
      'insert-link': () => {
        const url = window.prompt('Link URL:');
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
      // Cmd+S 保存
      if (cmd && e.key === 's') {
        e.preventDefault();
        if (document.activeElement?.closest('.editor-pane-split')) {
          handleSaveSplitRef.current();
        } else {
          handleSaveRef.current();
        }
        return;
      }
      if (cmd && e.key === 'p' && !e.shiftKey) {
        e.preventDefault();
        setShowQuickSwitcher(true);
      } else if (cmd && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setShowCommandPalette(true);
      } else if (cmd && e.key === 'f') {
        e.preventDefault();
        setShowFindReplace(true);
      } else if (cmd && e.key === '/') {
        e.preventDefault();
        setEditorMode(prev => prev === 'wysiwyg' ? 'source' : 'wysiwyg');
      } else if (cmd && e.shiftKey && e.key === 'O') {
        e.preventDefault();
        handleOpenFolderDialog();
      } else if (cmd && e.key === 'j') {
        e.preventDefault();
        setShowAIPanel(prev => !prev);
      } else if (cmd && e.shiftKey && e.key === 'D') {
        // 每日笔记移至 Cmd+Shift+D（Cmd+D 让给多光标）
        e.preventDefault();
        handleCreateDaily();
      } else if (cmd && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        setShowKnowledgeGraph(prev => !prev);
      } else if (cmd && e.shiftKey && e.key === 'H') {
        // Cmd+Shift+H：版本历史
        e.preventDefault();
        setShowVersionHistory(true);
      } else if (cmd && e.key === 'w' && !e.shiftKey) {
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
    // handleCreateDaily / handleOpenFolderDialog 声明在 effect 之后，但均为稳定 useCallback，捕获首帧即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeTab, switchTab, toggleSplit]);

  const cycleTheme = useCallback(() => {
    setTheme(prev => {
      const idx = THEMES.findIndex(t => t.name === prev);
      const next = THEMES[(idx + 1) % THEMES.length];
      applyTheme(next.name);
      return next.name;
    });
  }, []);

  const handleNewNote = useCallback(() => {
    openNote(createNewNote());
    setLastSaved(null);
  }, [openNote]);

  const handleOpenFile = useCallback(async (filePath: string) => {
    // 若标签已打开，仅聚焦，避免覆盖未保存编辑
    if (openTabs.some(t => t.id === filePath)) {
      setActiveTabId(filePath);
      // 记录文件修改时间（用于外部修改检测）
      try {
        const mtime = await invoke('get_file_modified', { path: filePath }) as string;
        setLastSaved(mtime);
      } catch {}
      return;
    }
    const result = await readFile(filePath);
    if (result.success && result.content !== undefined) {
      openNote({
        id: filePath,
        title: filePath.split('/').pop()?.replace(/\.md$|\.markdown$/, '') || 'Untitled',
        content: result.content,
        filePath,
        lastModified: new Date().toISOString(),
        isDirty: false,
      });
      // 记录文件修改时间（用于外部修改检测）
      try {
        const mtime = await invoke('get_file_modified', { path: filePath }) as string;
        setLastSaved(mtime);
      } catch {}
    }
  }, [readFile, openNote, openTabs]);

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

  const handleSave = useCallback(async () => {
    if (!currentNote || !currentNote.isDirty) return;
    if (currentNote.filePath) {
      await writeFile(currentNote.filePath, currentNote.content);
      // 创建备份（版本历史）
      try {
        await invoke('create_backup', { notePath: currentNote.filePath, content: currentNote.content });
      } catch (e) {
        console.warn('创建备份失败:', e);
      }
      updateActiveTab({ isDirty: false });
      // 保存后记录文件修改时间（用于外部修改检测）
      try {
        const mtime = await invoke('get_file_modified', { path: currentNote.filePath }) as string;
        setLastSaved(mtime);
      } catch {}
      // Refresh knowledge index since tags/links may have changed
      if (currentDir) {
        refreshKnowledgeIndex(currentDir);
        refreshBacklinks();
      }
    } else {
      handleSaveAs();
    }
  }, [currentNote, writeFile, currentDir, refreshKnowledgeIndex, refreshBacklinks, updateActiveTab]);
  handleSaveRef.current = handleSave;

  const handleSaveAs = useCallback(async () => {
    if (!currentNote) return;
    const title = currentNote.title || 'Untitled';
    const result = await showSaveDialog(`~/Documents/${title}.md`);
    if (!result.canceled && result.filePath) {
      await writeFile(result.filePath, currentNote.content);
      updateActiveTab({
        filePath: result.filePath,
        isDirty: false,
        title: result.filePath.split('/').pop()?.replace(/\.md$/, '') || title,
      });
      // 保存后记录文件修改时间（用于外部修改检测）
      try {
        const mtime = await invoke('get_file_modified', { path: result.filePath }) as string;
        setLastSaved(mtime);
      } catch {}
      showToast('Saved successfully');
    }
  }, [currentNote, writeFile, showSaveDialog, showToast, updateActiveTab]);

  const handleExportHtml = useCallback(async () => {
    if (!currentNote) return;
    const filePath = currentNote.filePath || `~/Documents/${currentNote.title}.md`;
    const result = await exportHtml(currentNote.content, filePath);
    if (result.success) {
      showToast(`Exported to: ${result.filePath}`);
    }
  }, [currentNote, exportHtml, showToast]);

  const handleExportPdf = useCallback(async () => {
    if (!currentNote) return;
    const filePath = currentNote.filePath || `~/Documents/${currentNote.title}.md`;
    const result = await exportPdf(currentNote.content, filePath);
    if (result.success) {
      showToast(`PDF exported to: ${result.filePath}`);
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
    await writeFile(splitNote.filePath, splitNote.content);
    updateNote(splitNote.id, { isDirty: false });
    if (currentDir) {
      refreshKnowledgeIndex(currentDir);
      refreshBacklinks();
    }
  }, [splitNote, writeFile, currentDir, refreshKnowledgeIndex, refreshBacklinks, updateNote]);
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

  const handleSelectNote = useCallback((note: Note) => {
    openNote(note);
    // 记录文件修改时间（用于外部修改检测）
    if (note.filePath) {
      invoke('get_file_modified', { path: note.filePath }).then((mtime: string) => {
        setLastSaved(mtime);
      }).catch(() => {});
    } else {
      setLastSaved(null);
    }
  }, [openNote]);

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

  // Build command palette commands
  const commands: Command[] = [
    { id: 'new-note', title: 'New Note', shortcut: 'Cmd+N', category: 'File', action: handleNewNote },
    { id: 'save', title: 'Save', shortcut: 'Cmd+S', category: 'File', action: handleSave },
    { id: 'save-as', title: 'Save As', shortcut: 'Cmd+Shift+S', category: 'File', action: handleSaveAs },
    { id: 'daily-note', title: "Today's Daily Note", shortcut: 'Cmd+Shift+D', category: 'File', action: handleCreateDaily },
    { id: 'insert-template', title: 'Insert from Template', shortcut: 'Cmd+Shift+I', category: 'Insert', action: () => setShowQuickInsert(true) },
    { id: 'export-html', title: 'Export as HTML', category: 'Export', action: handleExportHtml },
    { id: 'export-pdf', title: 'Export as PDF', category: 'Export', action: handleExportPdf },
    { id: 'toggle-source', title: 'Toggle Source Mode', shortcut: 'Cmd+/', category: 'View', action: () => setEditorMode(prev => prev === 'wysiwyg' ? 'source' : 'wysiwyg') },
    { id: 'toggle-focus', title: 'Toggle Focus Mode', category: 'View', action: () => setFocusMode(prev => !prev) },
    { id: 'toggle-typewriter', title: 'Toggle Typewriter Mode', category: 'View', action: () => setTypewriterMode(prev => !prev) },
    { id: 'toggle-sidebar', title: 'Toggle Sidebar', shortcut: 'Cmd+B', category: 'View', action: () => setSidebarOpen(prev => !prev) },
    { id: 'toggle-outline', title: 'Toggle Outline', category: 'View', action: () => setOutlineOpen(prev => !prev) },
    { id: 'toggle-graph', title: 'Toggle Knowledge Graph', shortcut: 'Cmd+Shift+G', category: 'View', action: () => setShowKnowledgeGraph(prev => !prev) },
    { id: 'toggle-backlinks', title: 'Toggle Backlinks', category: 'View', action: () => setShowBacklinks(prev => !prev) },
    { id: 'toggle-ai', title: 'Toggle AI Assistant', shortcut: 'Cmd+J', category: 'AI', action: () => setShowAIPanel(prev => !prev) },
    { id: 'open-settings', title: 'Open Settings', category: 'AI', action: () => setShowSettings(true) },
    { id: 'toggle-find', title: 'Find & Replace', shortcut: 'Cmd+F', category: 'Edit', action: () => setShowFindReplace(true) },
    { id: 'cycle-theme', title: 'Cycle Theme', category: 'View', action: cycleTheme },
    { id: 'quick-switch', title: 'Quick Switch File', shortcut: 'Cmd+P', category: 'Go', action: () => setShowQuickSwitcher(true) },
    { id: 'close-tab', title: 'Close Tab', shortcut: 'Cmd+W', category: 'View', action: () => activeTabId && closeTab(activeTabId) },
    { id: 'next-tab', title: 'Next Tab', shortcut: 'Cmd+Shift+]', category: 'View', action: () => switchTab(1) },
    { id: 'prev-tab', title: 'Previous Tab', shortcut: 'Cmd+Shift+[', category: 'View', action: () => switchTab(-1) },
    { id: 'toggle-split', title: 'Toggle Split Pane', shortcut: 'Cmd+\\', category: 'View', action: toggleSplit },
    { id: 'version-history', title: '版本历史', shortcut: 'Cmd+Shift+H', category: '文件', action: () => setShowVersionHistory(true) },
  ];

  const handleTagClick = useCallback((tag: string) => {
    setActiveTag(prev => prev === tag ? null : tag);
  }, []);

  // When a tag is active, filter the quick switcher-style file list to that tag's notes
  // 嵌套标签：选中父标签时包含所有后代标签的笔记（前缀匹配 "tag/" 或完全相等）
  const taggedFiles = activeTag
    ? Array.from(new Set(
        tags
          .filter(t => t.name === activeTag || t.name.startsWith(activeTag + '/'))
          .flatMap(t => t.notes)
      )).map(p => ({
        path: p,
        name: p.split('/').pop()?.replace(/\.md$|\.markdown$/, '') || p,
        lastModified: Date.now(),
      }))
    : allFiles;

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden' }}>
      <Sidebar
        isOpen={sidebarOpen}
        currentNote={currentNote}
        onSelectNote={handleSelectNote}
        onNewNote={handleNewNote}
        onOpenFolder={handleOpenFolder}
        tags={tags}
        onTagClick={handleTagClick}
        activeTag={activeTag}
        onOpenSettings={() => setShowSettings(true)}
        onOpenAI={() => setShowAIPanel(true)}
        onCreateDaily={handleCreateDaily}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TabsBar
          tabs={openTabs}
          activeId={activeTabId}
          splitId={splitNote?.id || null}
          onSelect={(id) => {
            setActiveTabId(id);
            // 切换标签时记录文件修改时间（用于外部修改检测）
            const tab = openTabs.find(t => t.id === id);
            if (tab?.filePath) {
              invoke('get_file_modified', { path: tab.filePath }).then((mtime: string) => {
                setLastSaved(mtime);
              }).catch(() => {});
            } else {
              setLastSaved(null);
            }
          }}
          onClose={closeTab}
          onOpenInSplit={openInSplit}
          onToggleSplit={toggleSplit}
          isSplit={!!splitNote}
          onCloseOthers={closeOtherTabs}
          onCloseToRight={closeTabsToRight}
        />
        {openTabs.length === 0 ? (
          <div className="empty-state">
            <h1>Welcome to ZenNote</h1>
            <p>Select a folder or create a new note to start writing</p>
          </div>
        ) : (
          <div className={`editor-area ${splitNote ? 'split' : ''}`}>
            <div className="editor-pane editor-pane-main">
              {currentNote && (
                <>
                  <Breadcrumb
                    filePath={currentNote.filePath}
                    noteTitle={currentNote.title}
                    headings={headings}
                    activeHeadingId={activeHeading}
                    onHeadingClick={handleJumpToHeading}
                  />
                  <Editor
                    content={currentNote.content}
                    onChange={handleContentChange}
                    title={currentNote.title}
                    onTitleChange={handleTitleChange}
                    editorMode={editorMode}
                    focusMode={focusMode}
                    typewriterMode={typewriterMode}
                    showFindReplace={showFindReplace}
                    onToggleFindReplace={() => setShowFindReplace(false)}
                    onStatsChange={setStats}
                    onHeadingsChange={setHeadings}
                    onWikiLinksChange={handleWikiLinksChange}
                    currentFilePath={currentNote.filePath}
                    editorRef={editorRef}
                    onActiveHeadingChange={handleActiveHeadingChange}
                    onWikiLinkClick={(href: string) => {
                      // 在已打开的标签中查找，或打开文件
                      const targetTitle = href.replace(/#.*$/, '').trim();
                      const targetNote = openTabs.find(t => t.title === targetTitle);
                      if (targetNote) {
                        setActiveTabId(targetNote.id);
                      } else {
                        // 尝试在文件系统中查找
                        handleOpenFile(href);
                      }
                    }}
                    onTagClick={(tag: string) => {
                      handleTagClick(tag);
                    }}
                  />
                  <StatusBar
                    theme={theme}
                    onCycleTheme={cycleTheme}
                    isDirty={currentNote.isDirty}
                    lastSaved={lastSaved}
                    stats={stats}
                    editorMode={editorMode}
                    focusMode={focusMode}
                    typewriterMode={typewriterMode}
                    onToggleEditorMode={() => setEditorMode((prev: EditorMode) => prev === 'wysiwyg' ? 'source' : 'wysiwyg')}
                    onToggleFocusMode={() => setFocusMode((prev: boolean) => !prev)}
                    onToggleTypewriterMode={() => setTypewriterMode((prev: boolean) => !prev)}
                  />
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
                <Editor
                  content={splitNote.content}
                  onChange={handleSplitContentChange}
                  title={splitNote.title}
                  onTitleChange={handleSplitTitleChange}
                  editorMode={editorMode}
                  focusMode={focusMode}
                  typewriterMode={typewriterMode}
                  showFindReplace={false}
                  onToggleFindReplace={() => {}}
                  onStatsChange={setSplitStats}
                  onHeadingsChange={setSplitHeadings}
                  onWikiLinksChange={() => {}}
                  currentFilePath={splitNote.filePath || ''}
                  editorRef={editorRefSplit}
                  onActiveHeadingChange={handleSplitActiveHeadingChange}
                  onWikiLinkClick={(href: string) => {
                    const targetTitle = href.replace(/#.*$/, '').trim();
                    const targetNote = openTabs.find(t => t.title === targetTitle);
                    if (targetNote) {
                      setActiveTabId(targetNote.id);
                    } else {
                      handleOpenFile(href);
                    }
                  }}
                  onTagClick={(tag: string) => {
                    handleTagClick(tag);
                  }}
                />
                <StatusBar
                  theme={theme}
                  onCycleTheme={cycleTheme}
                  isDirty={splitNote.isDirty}
                  lastSaved={lastSaved}
                  stats={splitStats}
                  editorMode={editorMode}
                  focusMode={focusMode}
                  typewriterMode={typewriterMode}
                  onToggleEditorMode={() => setEditorMode((prev: EditorMode) => prev === 'wysiwyg' ? 'source' : 'wysiwyg')}
                  onToggleFocusMode={() => setFocusMode((prev: boolean) => !prev)}
                  onToggleTypewriterMode={() => setTypewriterMode((prev: boolean) => !prev)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {outlineOpen && currentNote && (
        <Outline
          headings={headings}
          activeId={activeHeading}
          onJump={handleJumpToHeading}
          onClose={() => setOutlineOpen(false)}
        />
      )}

      {showBacklinks && currentNote && (
        <BacklinksPanel
          backlinks={backlinks}
          onJump={(filePath) => {
            handleOpenFile(filePath);
            setShowBacklinks(false);
          }}
          onClose={() => setShowBacklinks(false)}
        />
      )}

      {showAIPanel && (
        <AIPanel
          onAction={runAIAction}
          onInsert={handleInsertText}
          onClose={() => setShowAIPanel(false)}
          enabled={aiConfig.enabled}
          onOpenSettings={() => { setShowAIPanel(false); setShowSettings(true); }}
        />
      )}

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

      {showKnowledgeGraph && currentNote && (
        <div className="knowledge-graph-panel">
          <div className="outline-header">
            <span>Knowledge Graph</span>
            <button className="toolbar-btn" onClick={() => setShowKnowledgeGraph(false)}>×</button>
          </div>
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
        </div>
      )}

      <SettingsDialog
        open={showSettings}
        aiConfig={aiConfig}
        templates={templates}
        onSaveAI={(cfg) => {
          setAIConfig(cfg);
          localStorage.setItem('aiConfig', JSON.stringify(cfg));
          showToast(cfg.enabled ? 'AI enabled' : 'AI disabled');
        }}
        onSaveTemplates={(tpls) => {
          setTemplates(tpls);
          localStorage.setItem('templates', JSON.stringify(tpls));
        }}
        onClose={() => setShowSettings(false)}
      />

      <QuickInsert
        open={showQuickInsert}
        templates={templates}
        currentDir={currentDir}
        onInsert={(content) => {
          editorRef.current?.chain().focus().insertContent(content).run();
        }}
        onCreateDaily={async (filePath, content) => {
          if (!filePath) {
            showToast('Open a folder first');
            return;
          }
          const dir = filePath.substring(0, filePath.lastIndexOf('/'));
          try { await invoke('ensure_dir', { path: dir }); } catch (e) { console.warn('创建目录失败:', dir, e); }
          try { await invoke('write_text_file', { path: filePath, content }); } catch (e) { console.warn('写入每日笔记失败:', filePath, e); }
          const res = await readFile(filePath);
          if (res.success && res.content !== undefined) {
            openNote({
              id: filePath,
              title: todayTitle(),
              content: res.content,
              filePath,
              lastModified: new Date().toISOString(),
              isDirty: false,
            });
            // 保存后记录文件修改时间（用于外部修改检测）
            try {
              const mtime = await invoke('get_file_modified', { path: filePath }) as string;
              setLastSaved(mtime);
            } catch {}
            showToast('Daily note created');
          }
          refreshFileList(currentDir);
          refreshKnowledgeIndex(currentDir);
        }}
        onClose={() => setShowQuickInsert(false)}
      />

      {showVersionHistory && currentNote?.filePath && (
        <VersionHistory
          notePath={currentNote.filePath}
          onRestore={(content) => {
            updateActiveTab({ content, isDirty: true });
            setShowVersionHistory(false);
          }}
          onClose={() => setShowVersionHistory(false)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
};

export default App;
