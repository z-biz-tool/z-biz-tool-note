import { invoke } from '@tauri-apps/api/core';

export interface IndexedMatch {
  file_path: string;
  title: string;
  line: number;
  /** 已含 <mark> 高亮标签 */
  snippet: string;
  score: number;
}

export interface IndexStatus {
  total: number;
  indexed: number;
  stale: number;
  index_age_ms: number;
  last_build_ms: number;
}

/**
 * FTS5 搜索索引的类型化 IPC 封装。
 *
 * 所有方法在后端不可用（非 Tauri 环境、路径校验拒绝、索引损坏）时返回 null，
 * 调用方据此降级为全盘扫描，而不是把异常抛到 UI 上。
 */
export const searchNotes = async (query: string, limit = 100): Promise<IndexedMatch[] | null> => {
  try {
    return await invoke<IndexedMatch[]>('search_notes', { query, limit });
  } catch {
    return null;
  }
};

export const getIndexStatus = async (): Promise<IndexStatus | null> => {
  try {
    return await invoke<IndexStatus>('index_status');
  } catch {
    return null;
  }
};

/** 按 mtime 增量对齐 dir 下的 .md（新增/变更/已删除都会被处理） */
export const rebuildIndex = async (dir: string): Promise<IndexStatus | null> => {
  try {
    return await invoke<IndexStatus>('rebuild_index', { dir });
  } catch {
    return null;
  }
};

/** 单篇重新入索引（外部编辑器改文件后调用，后端会自己读盘） */
export const indexNote = async (path: string): Promise<void> => {
  try {
    await invoke('index_upsert_note', { path });
  } catch {
    // 索引是尽力而为：失败时下次 rebuild 会补上
  }
};

export const unindexNote = async (path: string): Promise<void> => {
  try {
    await invoke('index_delete_note', { path });
  } catch {
    // 同上
  }
};
