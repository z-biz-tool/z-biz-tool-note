import { useEffect, useRef } from 'react';

const WAL_KEY = 'zennote-wal-v1';
/** 单篇 WAL 条目大小上限：超过此值不写入（localStorage 配额 5MB 兜底） */
const MAX_WAL_ENTRY_BYTES = 2 * 1024 * 1024; // 2MB

export interface WalEntry {
  filePath: string;
  content: string;
  ts: number;
}

type WalMap = Record<string, WalEntry>;

/**
 * Write-Ahead Log 兜底机制。
 *
 * 目标：自动保存去抖窗口（默认 2s）内崩溃/断电 → 重启后从 localStorage 恢复未落盘内容。
 *
 * 设计取舍：
 * - 用 localStorage 而非 IndexedDB：同步 API + 简单无异步依赖
 * - 单篇 > 2MB 时跳过（避免把 5MB 配额填满）
 * - 写入是幂等的：同一 filePath 反复写覆盖旧条目（去抖时反复调用 → 只留最新）
 * - 恢复时一次清空，避免下次启动又重复弹窗
 *
 * 局限性：
 * - localStorage 总配额 ~5MB；超出会抛 QuotaExceededError → 静默降级为仅内存
 * - 跨标签页冲突：不同标签页同时编辑同一文件时，后写者覆盖前者（debounce 由 handleSave 统一管控）
 */
export const walStore = {
  write(filePath: string, content: string): void {
    // 单篇大小限制：超过 2MB 不写 WAL（避免占满 localStorage）
    if (content.length > MAX_WAL_ENTRY_BYTES) {
      console.warn(
        `[WAL] 单篇笔记 ${(content.length / 1024 / 1024).toFixed(1)}MB 超过 ${MAX_WAL_ENTRY_BYTES / 1024 / 1024}MB 限制，跳过 WAL 写入`,
      );
      return;
    }
    try {
      const map = this.readAll();
      map[filePath] = { filePath, content, ts: Date.now() };
      localStorage.setItem(WAL_KEY, JSON.stringify(map));
    } catch (e) {
      // localStorage 满 / 隐私模式禁用：降级为 console 提示，不阻塞保存流程
      console.warn('[WAL] 写入失败:', e);
    }
  },

  clear(filePath: string): void {
    try {
      const map = this.readAll();
      delete map[filePath];
      localStorage.setItem(WAL_KEY, JSON.stringify(map));
    } catch (e) {
      console.warn('[WAL] 清理失败:', e);
    }
  },

  readAll(): WalMap {
    try {
      const raw = localStorage.getItem(WAL_KEY);
      return raw ? (JSON.parse(raw) as WalMap) : {};
    } catch (e) {
      console.warn('[WAL] 解析失败:', e);
      return {};
    }
  },
};

/**
 * 启动节流：同一笔记短时间内多次触发 create_backup 时，仅保留最长一次间隔
 */
export const BACKUP_DEBOUNCE_MS = 5 * 60 * 1000; // 5 分钟
const lastBackupTs: Map<string, number> = (() => {
  try {
    const raw = sessionStorage.getItem('zennote-last-backup-ts');
    return raw ? (JSON.parse(raw) as Map<string, number>) : new Map<string, number>();
  } catch {
    return new Map<string, number>();
  }
})();

function persistLastBackupTs(): void {
  try {
    sessionStorage.setItem('zennote-last-backup-ts', JSON.stringify([...lastBackupTs.entries()]));
  } catch {
    // sessionStorage 不可用不影响备份逻辑
  }
}

/**
 * 应否触发备份？
 *
 * @param filePath 笔记文件路径
 * @returns true → 调用方应触发 create_backup；false → 跳过（间隔未到）
 */
export function shouldCreateBackup(filePath: string): boolean {
  const last = lastBackupTs.get(filePath) ?? 0;
  return Date.now() - last >= BACKUP_DEBOUNCE_MS;
}

/** 标记本次已备份，避免节流窗口内重复 */
export function markBackedUp(filePath: string): void {
  lastBackupTs.set(filePath, Date.now());
  persistLastBackupTs();
}

/**
 * 保存状态机的类型化状态
 *   idle    —— 无脏内容（用户没改 或 已保存成功）
 *   dirty   —— 用户改了但还没到 debounce 时间
 *   saving  —— 已触发 writeFile 但尚未返回
 *   saved   —— 保存成功
 *   error   —— 保存失败（保留脏状态 + WAL 兜底）
 */
export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

interface UseSaveStateOptions {
  /** 状态变更回调（用于联动 StatusBar / Toast 等） */
  onChange?: (state: SaveState, filePath: string | null) => void;
}

/**
 * 通用"保存中..."状态钩子。
 *
 * 提供 setSaving / setSaved / setError 三个动作，
 * 调用方在 writeFile 的 try/catch 分支调用对应 setter。
 */
export function useSaveState(opts: UseSaveStateOptions = {}): {
  state: SaveState;
  setSaving: (filePath: string) => void;
  setSaved: (filePath: string) => void;
  setError: (filePath: string, err: string) => void;
  reset: () => void;
} {
  const stateRef = useRef<SaveState>('idle');
  const lastPathRef = useRef<string | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // 卸载时清理（避免 React StrictMode 重复挂载时的回调闭包问题）
  useEffect(() => {
    return () => {
      optsRef.current = undefined;
    };
  }, []);

  return {
    get state() {
      return stateRef.current;
    },
    setSaving: (filePath) => {
      stateRef.current = 'saving';
      lastPathRef.current = filePath;
      optsRef.current.onChange?.('saving', filePath);
    },
    setSaved: (filePath) => {
      stateRef.current = 'saved';
      lastPathRef.current = filePath;
      optsRef.current.onChange?.('saved', filePath);
    },
    setError: (filePath) => {
      stateRef.current = 'error';
      lastPathRef.current = filePath;
      optsRef.current.onChange?.('error', filePath);
    },
    reset: () => {
      stateRef.current = 'idle';
      lastPathRef.current = null;
      optsRef.current.onChange?.('idle', null);
    },
  };
}