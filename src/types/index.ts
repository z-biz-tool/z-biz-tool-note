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
