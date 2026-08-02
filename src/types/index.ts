export interface FileItem {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  path: string;
  children?: FileItem[];
}

export interface Note {
  id: string;
  title: string;
  content: string;
  filePath: string;
  lastModified: Date;
  isDirty: boolean;
  tags?: string[];
}

export interface HeadingItem {
  id: string;
  level: number;
  text: string;
  pos: number;
}

export interface RecentFile {
  path: string;
  name: string;
  lastOpened: number;
}

export type ThemeName = 'light' | 'dark' | 'sepia' | 'solarized' | 'dracula' | 'nord';

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

export type EditorMode = 'wysiwyg' | 'source';

export interface Command {
  id: string;
  title: string;
  shortcut?: string;
  category: string;
  action: () => void;
}

export interface SearchResult {
  filePath: string;
  fileName: string;
  snippet: string;
  line: number;
}

export interface WikiLinkItem {
  sourcePath: string;
  targetPath: string;
  text: string;
}

export interface GraphNode {
  id: string;
  name: string;
  path: string;
  group?: string;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface FolderContextMenu {
  x: number;
  y: number;
  item: FileItem | null;
  type: 'file' | 'folder' | 'empty';
}

/* ---------- Knowledge Management ---------- */

export interface Tag {
  name: string;
  count: number;
  notes: string[]; // file paths
}

export interface Backlink {
  sourcePath: string;
  sourceTitle: string;
  snippet: string;
  line: number;
}

export interface BlockRef {
  targetNote: string;
  targetHeading?: string;
  targetBlockId?: string;
  text: string;
}

/* ---------- AI ---------- */

export interface AIConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  enabled: boolean;
}

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIResult {
  success: boolean;
  content?: string;
  error?: string;
}

/* ---------- Templates ---------- */

export interface Template {
  id: string;
  name: string;
  content: string;
  builtin?: boolean;
}

/* ---------- Graph Enhancements ---------- */

export type LinkType = 'wiki' | 'tag' | 'backlink';

export interface GraphLinkTyped {
  source: string;
  target: string;
  type: LinkType;
}

export interface GraphFilter {
  tag?: string | null;
  query?: string;
  linkTypes?: LinkType[];
}
