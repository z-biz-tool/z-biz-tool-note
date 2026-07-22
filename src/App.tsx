import { useState, useEffect, useCallback, useRef } from 'react';
import { electronAPI } from './lib/electronAPI';
import { applyTheme, THEMES } from './lib/themes';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { StatusBar } from './components/StatusBar';
import { Outline } from './components/Outline';
import { QuickSwitcher } from './components/QuickSwitcher';
import { CommandPalette } from './components/CommandPalette';
import { KnowledgeGraph } from './components/KnowledgeGraph';
import type { Note, ThemeName, EditorMode, HeadingItem, Command, WikiLinkItem, GraphNode, GraphLink } from './types';
import { useFileOperations } from './hooks/useFileOperations';
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

  const [currentNote, setCurrentNote] = useState<Note | null>(null);
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
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [allFiles, setAllFiles] = useState<Array<{ path: string; name: string; lastModified: number }>>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphLinks, setGraphLinks] = useState<GraphLink[]>([]);
  const [showKnowledgeGraph, setShowKnowledgeGraph] = useState(false);

  const editorRef = useRef<any>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize
  useEffect(() => {
    const savedTheme = (localStorage.getItem('theme') as ThemeName) || 'light';
    setTheme(savedTheme);
    applyTheme(savedTheme);

    setCurrentNote({
      id: 'demo-welcome',
      title: 'Welcome to ZenNote',
      content: DEMO_CONTENT,
      filePath: '',
      lastModified: new Date(),
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

  // Toast helper
  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  }, []);

  // Electron IPC listeners
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
      } else if (e.key === 'Escape') {
        setShowQuickSwitcher(false);
        setShowCommandPalette(false);
        setShowFindReplace(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const cycleTheme = useCallback(() => {
    setTheme(prev => {
      const idx = THEMES.findIndex(t => t.name === prev);
      const next = THEMES[(idx + 1) % THEMES.length];
      applyTheme(next.name);
      return next.name;
    });
  }, []);

  const handleNewNote = useCallback(() => {
    setCurrentNote(createNewNote());
    setLastSaved(null);
  }, []);

  const handleOpenFile = useCallback(async (filePath: string) => {
    const result = await readFile(filePath);
    if (result.success && result.content !== undefined) {
      setCurrentNote({
        id: filePath,
        title: filePath.split('/').pop()?.replace(/\.md$|\.markdown$/, '') || 'Untitled',
        content: result.content,
        filePath,
        lastModified: new Date(),
        isDirty: false,
      });
      setLastSaved(new Date());
    }
  }, [readFile]);

  const handleOpenFolder = useCallback((dirPath: string) => {
    if (dirPath) {
      refreshFileList(dirPath);
    }
  }, [refreshFileList]);

  const handleOpenFolderDialog = useCallback(async () => {
    const result = await electronAPI.invoke('show-open-dialog');
    if (!result.canceled && result.filePath) {
      refreshFileList(result.filePath);
    }
  }, [refreshFileList]);

  const handleSave = useCallback(async () => {
    if (!currentNote || !currentNote.isDirty) return;
    if (currentNote.filePath) {
      await writeFile(currentNote.filePath, currentNote.content);
      setCurrentNote(prev => prev ? { ...prev, isDirty: false } : null);
      setLastSaved(new Date());
    } else {
      handleSaveAs();
    }
  }, [currentNote, writeFile]);

  const handleSaveAs = useCallback(async () => {
    if (!currentNote) return;
    const title = currentNote.title || 'Untitled';
    const result = await showSaveDialog(`~/Documents/${title}.md`);
    if (!result.canceled && result.filePath) {
      await writeFile(result.filePath, currentNote.content);
      setCurrentNote({
        ...currentNote,
        filePath: result.filePath,
        isDirty: false,
        title: result.filePath.split('/').pop()?.replace(/\.md$/, '') || title,
      });
      setLastSaved(new Date());
      showToast('Saved successfully');
    }
  }, [currentNote, writeFile, showSaveDialog, showToast]);

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
    setCurrentNote(prev => prev ? { ...prev, content, isDirty: true } : null);
    debounceTimer.current = setTimeout(() => handleSave(), 2000);
  }, [handleSave]);

  const handleTitleChange = useCallback((title: string) => {
    setCurrentNote(prev => prev ? { ...prev, title, isDirty: true } : null);
  }, []);

  const handleWikiLinksChange = useCallback((links: WikiLinkItem[]) => {
    const nodes: GraphNode[] = [];
    const linkSet = new Set<string>();

    if (currentNote) {
      nodes.push({
        id: currentNote.filePath || currentNote.id,
        name: currentNote.title,
        path: currentNote.filePath || '',
      });
    }

    links.forEach(link => {
      nodes.push({
        id: link.targetPath,
        name: link.text,
        path: link.targetPath,
      });
      const sourceId = currentNote?.filePath || currentNote?.id || '';
      const linkKey = `${sourceId}->${link.targetPath}`;
      if (!linkSet.has(linkKey)) {
        linkSet.add(linkKey);
        setGraphLinks((prev: GraphLink[]) => [...prev, { source: sourceId, target: link.targetPath }]);
      }
    });

    setGraphNodes(nodes);
  }, [currentNote]);

  const handleSelectNote = useCallback((note: Note) => {
    setCurrentNote(note);
    setLastSaved(new Date());
  }, []);

  const handleJumpToHeading = useCallback((pos: number) => {
    editorRef.current?.jumpToHeading?.(pos);
  }, []);

  // Track active heading based on cursor position
  useEffect(() => {
    if (headings.length === 0) {
      setActiveHeading(null);
      return;
    }
    // Just set the first heading as active for now
    // Real implementation would track scroll position
  }, [headings]);

  // Build command palette commands
  const commands: Command[] = [
    { id: 'new-note', title: 'New Note', shortcut: 'Cmd+N', category: 'File', action: handleNewNote },
    { id: 'save', title: 'Save', shortcut: 'Cmd+S', category: 'File', action: handleSave },
    { id: 'save-as', title: 'Save As', shortcut: 'Cmd+Shift+S', category: 'File', action: handleSaveAs },
    { id: 'export-html', title: 'Export as HTML', category: 'Export', action: handleExportHtml },
    { id: 'export-pdf', title: 'Export as PDF', category: 'Export', action: handleExportPdf },
    { id: 'toggle-source', title: 'Toggle Source Mode', shortcut: 'Cmd+/', category: 'View', action: () => setEditorMode(prev => prev === 'wysiwyg' ? 'source' : 'wysiwyg') },
    { id: 'toggle-focus', title: 'Toggle Focus Mode', category: 'View', action: () => setFocusMode(prev => !prev) },
    { id: 'toggle-typewriter', title: 'Toggle Typewriter Mode', category: 'View', action: () => setTypewriterMode(prev => !prev) },
    { id: 'toggle-sidebar', title: 'Toggle Sidebar', shortcut: 'Cmd+B', category: 'View', action: () => setSidebarOpen(prev => !prev) },
    { id: 'toggle-outline', title: 'Toggle Outline', category: 'View', action: () => setOutlineOpen(prev => !prev) },
    { id: 'toggle-find', title: 'Find & Replace', shortcut: 'Cmd+F', category: 'Edit', action: () => setShowFindReplace(true) },
    { id: 'cycle-theme', title: 'Cycle Theme', category: 'View', action: cycleTheme },
    { id: 'quick-switch', title: 'Quick Switch File', shortcut: 'Cmd+P', category: 'Go', action: () => setShowQuickSwitcher(true) },
    { id: 'toggle-graph', title: 'Toggle Knowledge Graph', category: 'View', action: () => setShowKnowledgeGraph(prev => !prev) },
  ];

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden' }}>
      <Sidebar
        isOpen={sidebarOpen}
        currentNote={currentNote}
        onSelectNote={handleSelectNote}
        onNewNote={handleNewNote}
        onOpenFolder={handleOpenFolder}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {currentNote ? (
          <>
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
        ) : (
          <div className="empty-state">
            <h1>Welcome to ZenNote</h1>
            <p>Select a folder or create a new note to start writing</p>
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

      {showQuickSwitcher && (
        <QuickSwitcher
          files={allFiles}
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
            <button className="toolbar-btn" onClick={() => setShowKnowledgeGraph(false)}>
              ×
            </button>
          </div>
          <KnowledgeGraph
            nodes={graphNodes}
            links={graphLinks}
            currentFilePath={currentNote.filePath}
            onNodeClick={(node) => {
              if (node.path && node.path.endsWith('.md')) {
                handleOpenFile(node.path);
              }
              setShowKnowledgeGraph(false);
            }}
          />
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
};

export default App;
