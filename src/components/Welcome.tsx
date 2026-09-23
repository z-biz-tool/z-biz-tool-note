import { useState, useEffect } from 'react';
import { Plus, FolderOpen, Calendar, BookOpen, Clock, Sparkles, FileText, ArrowRight } from 'lucide-react';
import type { RecentFile } from '../types';
import { modKeys } from '../lib/modifier';

interface WelcomeProps {
  onNewNote: () => void;
  onOpenFolder: () => void;
  onCreateDaily: () => void;
  onOpenGuide: () => void;
  onOpenFile: (path: string) => void;
  currentDir: string;
}

/**
 * VS Code 风格欢迎首屏：左侧「开始」快速操作，右侧「最近打开」。
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
          <div className="welcome-logo-glow">
            <span className="welcome-logo">📝</span>
          </div>
          <h1 className="welcome-title">ZenNote</h1>
          <p className="welcome-subtitle">一款沿用 Typora / Obsidian / Notion 思路的 Markdown 笔记应用。</p>
        </div>

        <div className="welcome-body">
          <div className="welcome-section">
            <h2 className="section-title">
              <Sparkles size={16} />
              <span>开始</span>
            </h2>
            <button className="welcome-action" onClick={onNewNote}>
              <Plus size={18} />
              <span>新建笔记</span>
              <ArrowRight size={14} />
            </button>
            <button className="welcome-action" onClick={onOpenFolder}>
              <FolderOpen size={18} />
              <span>打开文件夹…</span>
              <ArrowRight size={14} />
            </button>
            <button className="welcome-action" onClick={onCreateDaily}>
              <Calendar size={18} />
              <span>今日日记</span>
              <ArrowRight size={14} />
            </button>
            <button className="welcome-action" onClick={onOpenGuide}>
              <BookOpen size={18} />
              <span>使用指南</span>
              <ArrowRight size={14} />
            </button>
            {currentDir && (
              <div className="welcome-current-dir" title={currentDir}>
                <FileText size={14} />
                当前文件夹：{currentDir.split('/').pop() || currentDir}
              </div>
            )}
          </div>

          <div className="welcome-section">
            <h2 className="section-title">
              <Clock size={16} />
              <span>最近打开</span>
            </h2>
            {recentFiles.length === 0 ? (
              <div className="welcome-hint">
                <div className="hint-icon">📂</div>
                <p>还没有最近打开的文件</p>
                <p className="hint-sub">先打开一个文件夹，之后这里会列出最近编辑的笔记</p>
              </div>
            ) : (
              recentFiles.slice(0, 10).map(f => (
                <button key={f.path} className="welcome-recent-item" onClick={() => onOpenFile(f.path)} title={f.path}>
                  <Clock size={14} />
                  <div className="recent-content">
                    <span className="welcome-recent-name">{f.name}</span>
                    <span className="welcome-recent-path">{f.path.substring(0, f.path.lastIndexOf('/'))}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="welcome-footer">
          <span className="shortcut-hint"><kbd>{modKeys('Cmd+N')}</kbd> 新建笔记</span>
          <span className="shortcut-hint"><kbd>{modKeys('Cmd+P')}</kbd> 快速切换</span>
          <span className="shortcut-hint"><kbd>{modKeys('Cmd+Shift+P')}</kbd> 命令面板</span>
          <span className="shortcut-hint"><kbd>{modKeys('Cmd+,')}</kbd> 设置</span>
        </div>
      </div>
    </div>
  );
};
