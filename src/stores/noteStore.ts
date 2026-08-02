import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Note, Config, SortBy } from '../types';

interface NoteState {
  // 笔记列表
  notes: Note[];
  currentNoteId: string | null;
  currentContent: string;
  searchQuery: string;
  selectedTag: string | null;
  sortBy: SortBy;
  allTags: string[];

  // 配置
  config: Config;

  // 回收站
  trashNotes: Note[];
  showTrash: boolean;

  // 设置面板
  showSettings: boolean;

  // Actions
  loadNotes: () => Promise<void>;
  loadNote: (id: string) => Promise<void>;
  saveNote: (id: string, content: string) => Promise<void>;
  createNote: (title: string) => Promise<string>;
  deleteNote: (id: string) => Promise<void>;
  setCurrentNoteId: (id: string | null) => void;
  setCurrentContent: (content: string) => void;
  setSearchQuery: (query: string) => void;
  setSelectedTag: (tag: string | null) => void;
  setSortBy: (sortBy: SortBy) => void;
  loadConfig: () => Promise<void>;
  saveConfig: (config: Config) => Promise<void>;
  exportNote: (id: string, format: string, path: string) => Promise<string>;
  importNote: (path: string) => Promise<string>;
  loadTrash: () => Promise<void>;
  restoreNote: (id: string) => Promise<void>;
  permanentDeleteNote: (id: string) => Promise<void>;
  setShowTrash: (show: boolean) => void;
  setShowSettings: (show: boolean) => void;
  loadTags: () => Promise<void>;
}

export const useNoteStore = create<NoteState>((set, get) => ({
  notes: [],
  currentNoteId: null,
  currentContent: '',
  searchQuery: '',
  selectedTag: null,
  sortBy: 'modified',
  allTags: [],
  config: {
    theme: 'light',
    fontSize: 16,
    fontFamily: 'system-ui',
    autoSave: true,
    lastNoteId: '',
  },
  trashNotes: [],
  showTrash: false,
  showSettings: false,

  loadNotes: async () => {
    const notes = await invoke<Note[]>('list_notes');
    set({ notes });
  },

  loadNote: async (id: string) => {
    const content = await invoke<string>('read_note', { id });
    set({ currentNoteId: id, currentContent: content });
    // 更新lastNoteId
    const config = get().config;
    if (config.lastNoteId !== id) {
      const newConfig = { ...config, lastNoteId: id };
      set({ config: newConfig });
      await invoke('save_config', { config: newConfig });
    }
  },

  saveNote: async (id: string, content: string) => {
    await invoke('save_note', { id, content });
    // 重新加载笔记列表以更新标题/标签
    await get().loadNotes();
  },

  createNote: async (title: string) => {
    const id = await invoke<string>('create_note', { title });
    await get().loadNotes();
    await get().loadNote(id);
    await get().loadTags();
    return id;
  },

  deleteNote: async (id: string) => {
    await invoke('delete_note', { id });
    if (get().currentNoteId === id) {
      set({ currentNoteId: null, currentContent: '' });
    }
    await get().loadNotes();
    await get().loadTags();
  },

  setCurrentNoteId: (id: string | null) => set({ currentNoteId: id }),
  setCurrentContent: (content: string) => set({ currentContent: content }),
  setSearchQuery: (query: string) => set({ searchQuery: query }),
  setSelectedTag: (tag: string | null) => set({ selectedTag: tag }),
  setSortBy: (sortBy: SortBy) => set({ sortBy }),

  loadConfig: async () => {
    const config = await invoke<Config>('get_config');
    set({ config });
    // 恢复上次打开的笔记
    if (config.lastNoteId) {
      await get().loadNote(config.lastNoteId);
    }
  },

  saveConfig: async (config: Config) => {
    await invoke('save_config', { config });
    set({ config });
  },

  exportNote: async (id: string, format: string, path: string) => {
    return await invoke<string>('export_note', { id, format, path });
  },

  importNote: async (path: string) => {
    const id = await invoke<string>('import_note', { path });
    await get().loadNotes();
    await get().loadTags();
    await get().loadNote(id);
    return id;
  },

  loadTrash: async () => {
    const trashNotes = await invoke<Note[]>('list_trash');
    set({ trashNotes });
  },

  restoreNote: async (id: string) => {
    await invoke('restore_note', { id });
    await get().loadTrash();
    await get().loadNotes();
    await get().loadTags();
  },

  permanentDeleteNote: async (id: string) => {
    await invoke('permanent_delete_note', { id });
    await get().loadTrash();
  },

  setShowTrash: (show: boolean) => {
    set({ showTrash: show });
    if (show) {
      get().loadTrash();
    }
  },

  setShowSettings: (show: boolean) => set({ showSettings: show }),

  loadTags: async () => {
    const allTags = await invoke<string[]>('list_tags');
    set({ allTags });
  },
}));
