import { useState, useEffect, useCallback, useRef } from 'react';
import { ipcRenderer } from 'electron';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { StatusBar } from './components/StatusBar';
import type { Note } from './types';
import { useFileOperations } from './hooks/useFileOperations';
import './index.css';

const App = () => {
  const { writeFile, showSaveDialog, exportHtml, createNewNote, readFile } = useFileOperations();
  
  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  
  const contentRef = useRef<string>('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      const isDark = savedTheme === 'dark';
      setDarkMode(isDark);
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    }
    
    setCurrentNote(createNewNote());
  }, []);

  useEffect(() => {
    ipcRenderer.on('new-note', () => handleNewNote());
    ipcRenderer.on('open-file', (_event, filePath) => handleOpenFile(filePath));
    ipcRenderer.on('save-file', () => handleSave());
    ipcRenderer.on('save-file-as', () => handleSaveAs());
    ipcRenderer.on('export-html', () => handleExportHtml());
    ipcRenderer.on('toggle-dark-mode', () => toggleDarkMode());
    ipcRenderer.on('toggle-sidebar', () => setSidebarOpen(prev => !prev));

    return () => {
      ipcRenderer.removeAllListeners('new-note');
      ipcRenderer.removeAllListeners('open-file');
      ipcRenderer.removeAllListeners('save-file');
      ipcRenderer.removeAllListeners('save-file-as');
      ipcRenderer.removeAllListeners('export-html');
      ipcRenderer.removeAllListeners('toggle-dark-mode');
      ipcRenderer.removeAllListeners('toggle-sidebar');
    };
  }, []);

  const toggleDarkMode = useCallback(() => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    document.documentElement.setAttribute('data-theme', newMode ? 'dark' : 'light');
    localStorage.setItem('theme', newMode ? 'dark' : 'light');
  }, [darkMode]);

  const handleNewNote = () => {
    setCurrentNote(createNewNote());
    setLastSaved(null);
  };

  const handleOpenFile = async (filePath: string) => {
    const result = await readFile(filePath);
    if (result.success && result.content) {
      setCurrentNote({
        id: filePath,
        title: filePath.split('/').pop()?.replace('.md', '') || 'Untitled',
        content: result.content,
        filePath,
        lastModified: new Date(),
        isDirty: false,
      });
      setLastSaved(new Date());
    }
  };

  const handleSave = async () => {
    if (!currentNote || !currentNote.isDirty) return;
    
    if (currentNote.filePath) {
      await writeFile(currentNote.filePath, currentNote.content);
      setCurrentNote(prev => prev ? { ...prev, isDirty: false } : null);
      setLastSaved(new Date());
    } else {
      handleSaveAs();
    }
  };

  const handleSaveAs = async () => {
    if (!currentNote) return;
    
    const title = currentNote.title || 'Untitled';
    const defaultPath = `~/Documents/${title}.md`;
    const result = await showSaveDialog(defaultPath);
    
    if (!result.canceled && result.filePath) {
      await writeFile(result.filePath, currentNote.content);
      setCurrentNote({
        ...currentNote,
        filePath: result.filePath,
        isDirty: false,
        title: result.filePath.split('/').pop()?.replace('.md', '') || title,
      });
      setLastSaved(new Date());
    }
  };

  const handleExportHtml = async () => {
    if (!currentNote) return;
    
    const filePath = currentNote.filePath || `~/Documents/${currentNote.title}.md`;
    const result = await exportHtml(currentNote.content, filePath);
    
    if (result.success) {
      alert(`Exported to: ${result.filePath}`);
    }
  };

  const handleContentChange = (content: string) => {
    contentRef.current = content;
    
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
    setCurrentNote(prev => prev ? {
      ...prev,
      content,
      isDirty: true,
    } : null);
    
    debounceTimer.current = setTimeout(() => {
      handleSave();
    }, 2000);
  };

  const handleTitleChange = (title: string) => {
    setCurrentNote(prev => prev ? {
      ...prev,
      title,
      isDirty: true,
    } : null);
  };

  const handleSelectNote = (note: Note) => {
    setCurrentNote(note);
    setLastSaved(new Date());
  };

  return (
    <div style={styles.app}>
      <Sidebar
        isOpen={sidebarOpen}
        currentNote={currentNote}
        onSelectNote={handleSelectNote}
        onNewNote={handleNewNote}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      
      <div style={styles.mainContent}>
        {currentNote ? (
          <>
            <Editor
              content={currentNote.content}
              onChange={handleContentChange}
              title={currentNote.title}
              onTitleChange={handleTitleChange}
            />
            <StatusBar
              darkMode={darkMode}
              onToggleDarkMode={toggleDarkMode}
              isDirty={currentNote.isDirty}
              lastSaved={lastSaved}
            />
          </>
        ) : (
          <div style={styles.emptyState}>
            <h1>Welcome to ZenNote</h1>
            <p>Select a folder to start writing notes</p>
          </div>
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  app: {
    display: 'flex',
    height: '100vh',
    width: '100%',
    overflow: 'hidden',
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-muted)',
  },
};

export default App;