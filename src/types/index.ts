import type { FileKind } from '../lib/fileTypes';

export interface Note {
  id: string;
  title: string;
  content: string;
  created?: string;
  modified?: string;
  lastModified?: string;
  tags?: string[];
  filePath?: string;
  isDirty?: boolean;
  // 文件类型路由扩展字段
  fileType?: FileKind;        // 当前文件形态
  dataUrl?: string;           // 二进制文件用 base64 dataUrl
  fileSize?: number;          // 文件大小(byte)
  fileMtime?: string;         // 修改时间
  fileMime?: string;          // MIME 类型
  isReadonly?: boolean;       // 非 markdown 文件一律只读
}

export interface Config {
  theme: string;
  fontSize: number;
  fontFamily: string;
  autoSave: boolean;
  lastNoteId: string;
}

export type SortBy = 'modified' | 'created' | 'title';
export type ViewMode = 'list' | 'grid';
export type EditorMode = 'wysiwyg' | 'source';
export type ThemeName = 'light' | 'dark' | 'sepia' | 'dracula' | 'nord' | 'solarized';

export interface HeadingItem {
  id: string;
  level: number;
  text: string;
  pos: number;
}

export interface WikiLinkItem {
  sourcePath: string;
  targetPath: string;
  text: string;
}

export interface GraphNode {
  id: string;
  name: string;
  label?: string;
  path?: string;
  group?: number | string;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface AIConfig {
  provider?: string;
  apiKey: string;
  model: string;
  baseURL: string;
  enabled?: boolean;
}

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Template {
  id: string;
  name: string;
  description?: string;
  content: string;
  builtin?: boolean;
}

export interface Tag {
  name: string;
  count: number;
  notes: string[];
}

export interface Backlink {
  noteId: string;
  title: string;
  preview: string;
}

export interface Command {
  id: string;
  title: string;
  shortcut?: string;
  category?: string;
  action: () => void;
}

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size?: number;
  modified?: string;
  children?: FileItem[];
}

export interface NoteStats {
  words: number;
  characters: number;
  lines: number;
  readingTime: number;
}

// 之前缺失的类型定义
export interface RecentFile {
  path: string;
  name: string;
  lastOpened: number;
}

export interface ThemeOption {
  name: ThemeName;
  label: string;
  colors: {
    bgPrimary: string;
    bgSecondary: string;
    bgTertiary: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    borderColor: string;
    accentColor: string;
    accentHover: string;
    codeBg: string;
  };
}
