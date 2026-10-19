// useKeyboard —— 快捷键集中注册（T4-05）
//
// Why: App.tsx 里原本是一段 90 行的 window keydown if/else 链，
// SettingsDialog / FolderContextMenu 又各写了一遍 Escape。
// 快捷键散在各处的结果是：加一条要改好几个文件、删一条没人知道还有没有别处留着、
// 而且整段逻辑没法单测。
//
// 这个 hook 把「快捷键表」变成数据：一张表写清「什么组合键 → 干什么」，
// 挂载由本 hook 统一负责（挂 window 还是 document 都可以），卸载自动解绑。
// 匹配规则在 lib/keyboardShortcuts.ts（纯函数，可单测）。
//
// 用法：
//   const shortcuts = useMemo(() => [
//     { key: 's', cmd: true, shift: false, handler: () => save() },
//     { key: 'escape', handler: () => closeAll(), preventDefault: false },
//   ], [save]);
//   useKeyboard(shortcuts);
//
// 注意：shortcuts 数组请用 useMemo 包住 —— 引用一变就会重新解绑重挂。
// 数组元素里的 handler 若要读最新 state，走 ref（App.tsx 就是这么做的）。
import { useEffect } from 'react';
import {
  attachKeyboardShortcuts,
  type KeyboardListenerOptions,
  type KeyboardShortcut,
} from '../lib/keyboardShortcuts';

export interface UseKeyboardOptions extends KeyboardListenerOptions {
  /** 监听目标，默认 window（组件里想监听 document 时传 document） */
  target?: EventTarget | null;
}

/**
 * 注册一组快捷键，组件卸载时自动解绑。
 *
 * @param shortcuts 快捷键表；顺序即优先级，第一条命中的生效
 * @param options   监听目标 / 是否启用 / 捕获阶段 / 事件名
 */
export function useKeyboard(
  shortcuts: readonly KeyboardShortcut[],
  options: UseKeyboardOptions = {},
): void {
  const { target, enabled = true, capture = false, eventName = 'keydown' } = options;

  useEffect(() => {
    if (!enabled) return;
    const el = target ?? (typeof window !== 'undefined' ? window : null);
    if (!el) return;
    return attachKeyboardShortcuts(el, shortcuts, { enabled, capture, eventName });
  }, [shortcuts, target, enabled, capture, eventName]);
}

export type { KeyboardShortcut, KeyboardListenerOptions };
