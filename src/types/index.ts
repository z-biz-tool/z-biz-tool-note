export interface Note {
  id: string;
  title: string;
  created: string;
  modified: string;
  tags: string[];
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
