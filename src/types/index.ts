export interface Note {
  id: string;
  title: string;
  content: string;
  created: string;
  modified: string;
  tags: string[];
  filePath?: string;
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
export type EditorMode = 'wysiwyg' | 'source' | 'split';
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
  label: string;
  group?: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface AIConfig {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  content: string;
}

export interface Tag {
  name: string;
  count: number;
}

export interface Backlink {
  noteId: string;
  title: string;
  preview: string;
}

export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
}

export interface FileItem {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: string;
}

export interface NoteStats {
  words: number;
  characters: number;
  lines: number;
  readingTime: number;
}
