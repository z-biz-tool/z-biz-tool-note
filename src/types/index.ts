export interface FileItem {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  path: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  filePath: string;
  lastModified: Date;
  isDirty: boolean;
}

export interface AppState {
  currentNote: Note | null;
  notes: Note[];
  sidebarOpen: boolean;
  darkMode: boolean;
  searchQuery: string;
  currentDirectory: string;
}