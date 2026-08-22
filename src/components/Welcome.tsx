import { useState, useEffect } from 'react';
import { Plus, FolderOpen, Calendar, BookOpen, Clock } from 'lucide-react';
import type { RecentFile } from '../types';

interface WelcomeProps {
  onNewNote: () => void;
  onOpenFolder: () => void;
  onCreateDaily: () => void;
  onOpenGuide: () => void;
  onOpenFile: (path: string) => void;
  currentDir: string;
}

/**
 * VS Code 风格欢迎首屏：左侧 Start 快速操作，右侧 Recent 最近文件。
 * 每次挂载时从 localStorage 读取最近文件（Sidebar 打开文件时会更新）。
 */
export const Welcome = ({ onNewNote, onOpenFolder, onCreateDaily, onOpenGuide, onOpenFile, currentDir }: WelcomeProps) => {
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('recentFiles');
      if (saved) setRecentFiles(JSON.parse(saved));
    } catch { /* 忽略损坏的 localStorage 数据 */ }
  }, []);

  return (
    <div className="welcome-page">
      <div className="welcome-container">
        <div className="welcome-header">
          <div className="welcome-logo">📝</div>
          <h1>ZenNote</h1>
          <p className="welcome-subtitle">A beautiful Markdown note-taking app, inspired by Typora, Obsidian, and Notion.</p>
        </div>

        <div className="welcome-body">
          <div className="welcome-section">
            <h2>Start</h2>
            <button className="welcome-action" onClick={onNewNote}>
              <Plus size={16} />
              <span>New Note</span>
            </button>
            <button className="welcome-action" onClick={onOpenFolder}>
              <FolderOpen size={16} />
              <span>Open Folder…</span>
            </button>
            <button className="welcome-action" onClick={onCreateDaily}>
              <Calendar size={16} />
              <span>Today's Daily Note</span>
            </button>
            <button className="welcome-action" onClick={onOpenGuide}>
              <BookOpen size={16} />
              <span>Welcome Guide</span>
            </button>
            {currentDir && (
              <div className="welcome-current-dir" title={currentDir}>
                Current folder: {currentDir.split('/').pop() || currentDir}
              </div>
            )}
          </div>

          <div className="welcome-section">
            <h2>Recent</h2>
            {recentFiles.length === 0 ? (
              <div className="welcome-hint">
                No recent files yet.<br />
                Open a folder to get started.
              </div>
            ) : (
              recentFiles.slice(0, 10).map(f => (
                <button key={f.path} className="welcome-recent-item" onClick={() => onOpenFile(f.path)} title={f.path}>
                  <Clock size={14} />
                  <span className="welcome-recent-name">{f.name}</span>
                  <span className="welcome-recent-path">{f.path.substring(0, f.path.lastIndexOf('/'))}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="welcome-footer">
          <span className="shortcut-hint"><kbd>Cmd+N</kbd> New Note</span>
          <span className="shortcut-hint"><kbd>Cmd+P</kbd> Quick Switch</span>
          <span className="shortcut-hint"><kbd>Cmd+Shift+P</kbd> Command Palette</span>
          <span className="shortcut-hint"><kbd>Cmd+,</kbd> Settings</span>
        </div>
      </div>
    </div>
  );
};
