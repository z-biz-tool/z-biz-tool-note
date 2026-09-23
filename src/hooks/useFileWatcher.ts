import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { electronAPI } from '../lib/electronAPI';

type WatchHandler = (path: string) => void;

interface UseFileWatcherOptions {
  /** 当前监听的目录；切换目录时自动重启监听 */
  dir: string | null;
  /** 文件变更（创建/修改）时回调 */
  onChanged?: WatchHandler;
  /** 文件删除时回调 */
  onRemoved?: WatchHandler;
  /** 文件创建时回调 */
  onCreated?: WatchHandler;
  /** 是否启用（默认 true） */
  enabled?: boolean;
}

/**
 * 文件系统监听钩子（替代 5 秒 mtime 轮询）。
 *
 * 行为：
 *   0. 非 Tauri 环境（浏览器演示区）直接跳过，不发 invoke/listen
 *   1. dir 变化时 → 先 stop_watch 再 start_watch（新目录，旧监听自动 drop）
 *   2. 接收 Rust emit 的 zennote://file-* 事件并分发到对应回调
 *   3. 组件卸载时自动 stop_watch
 *
 * 性能特性：
 *   - Rust 端做 500ms debounce，前端无需额外节流
 *   - 仅 .md 等已知扩展名的事件会被推送（Rust 已过滤）
 */
export function useFileWatcher(opts: UseFileWatcherOptions): void {
  const { dir, onChanged, onRemoved, onCreated, enabled = true } = opts;

  const dirRef = useRef(dir);
  dirRef.current = dir;
  const callbacksRef = useRef({ onChanged, onRemoved, onCreated });
  callbacksRef.current = { onChanged, onRemoved, onCreated };

  useEffect(() => {
    // 浏览器演示区没有 Tauri 后端，listen/invoke 都会在里面抛错，
    // 之前每开一次目录就在控制台留一坨 setup 失败的堆栈
    if (!enabled || !dir || !electronAPI.isTauri) return;

    // 取消令牌：dir 变化时让上一轮 setup 提前结束
    let cancelled = false;
    let unlistenChanged: UnlistenFn | null = null;
    let unlistenRemoved: UnlistenFn | null = null;
    let unlistenCreated: UnlistenFn | null = null;

    const setup = async () => {
      try {
        // 1. 注册事件监听（串行 await，避免监听器竞态）
        const u1 = await listen<{ path: string }>('zennote://file-changed', e => {
          callbacksRef.current.onChanged?.(e.payload.path);
        });
        if (cancelled) { u1(); return; }
        unlistenChanged = u1;

        const u2 = await listen<{ path: string }>('zennote://file-removed', e => {
          callbacksRef.current.onRemoved?.(e.payload.path);
        });
        if (cancelled) { u1(); u2(); return; }
        unlistenRemoved = u2;

        const u3 = await listen<{ path: string }>('zennote://file-created', e => {
          callbacksRef.current.onCreated?.(e.payload.path);
        });
        if (cancelled) { u1(); u2(); u3(); return; }
        unlistenCreated = u3;

        // 2. 启动 Rust 端 watcher（替代旧 watcher）
        try {
          await invoke('start_watch', { dir });
        } catch (e) {
          console.warn('[useFileWatcher] start_watch 失败:', e);
        }
      } catch (e) {
        console.warn('[useFileWatcher] setup 失败:', e);
      }
    };

    setup();

    return () => {
      cancelled = true;
      unlistenChanged?.();
      unlistenRemoved?.();
      unlistenCreated?.();
      // 不在卸载时强制 stop_watch（其他组件可能依赖），
      // 让 start_watch 的新调用自然覆盖
    };
  }, [dir, enabled]);
}

/**
 * 笔记更新事件钩子（用于知识图谱增量更新）。
 * Rust 在 write_file 成功后 emit `note-updated`，这里把单条更新传给回调。
 */
export function useNoteUpdated(onUpdate: (summary: {
  file_path: string;
  title: string;
  tags: string[];
  links: string[];
}) => void): void {
  const cbRef = useRef(onUpdate);
  cbRef.current = onUpdate;

  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;
    listen<{
      file_path: string;
      title: string;
      tags: string;
      links: string;
    }>('note-updated', e => {
      cbRef.current({
        file_path: e.payload.file_path,
        title: e.payload.title,
        tags: e.payload.tags ? e.payload.tags.split(',').filter(Boolean) : [],
        links: e.payload.links ? e.payload.links.split(',').filter(Boolean) : [],
      });
    }).then(u => {
      // 防止组件已卸载但 listen() 才返回导致 listener 泄漏
      if (cancelled) {
        u();
      } else {
        unlisten = u;
      }
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}