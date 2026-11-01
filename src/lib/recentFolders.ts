// 「最近打开的文件夹」的唯一真源（与 lib/recentFiles.ts 同一套范式）。
//
// Why: currentDir 只有一格，切走就忘。工具类产品的惯例（VS Code / Obsidian）
// 都是记住最近的工作区列表供快速进入 —— 尤其配合 2026-10-31 的「授权工作区根」
// 机制：登记过的根重启后仍然有效，列表里的条目都是能直接打开的。
//
// 记账只有一个入口：App 的 handleOpenFolder / handleOpenFolderDialog /
// 冷启动恢复。侧栏和欢迎页只读。

const STORAGE_KEY = 'recentFolders';
const MAX_ENTRIES = 8;

export interface RecentFolder {
  path: string;
  lastOpened: number;
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeRecentFolders(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function writeEntries(entries: RecentFolder[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // 存储写满/隐私模式：列表是锦上添花，不能卡住打开文件夹的流程
  }
  listeners.forEach(l => l());
}

function readEntries(): RecentFolder[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(raw)) throw new Error('shape changed');
    return raw
      .filter((e: any) => e && typeof e.path === 'string')
      .map((e: any) => ({ path: e.path, lastOpened: Number(e.lastOpened) || 0 }))
      .slice(0, MAX_ENTRIES);
  } catch {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* 忽略 */ }
    return [];
  }
}

export function listRecentFolders(): RecentFolder[] {
  return readEntries();
}

/** 打开或切到某个工作区时记一笔；重复打开只把它挪回最前 */
export function recordRecentFolder(path: string): void {
  if (!path) return;
  const rest = readEntries().filter(e => e.path !== path);
  writeEntries([{ path, lastOpened: Date.now() }, ...rest].slice(0, MAX_ENTRIES));
}

/** 整列划走：只动这份列表，磁盘上的文件夹一个不碰 */
export function clearRecentFolders(): void {
  writeEntries([]);
}

/** 文件夹在侧栏的名字：末段路径。纯函数，测试友好 */
export function folderDisplayName(path: string): string {
  return path.split('/').filter(Boolean).pop() || path;
}
