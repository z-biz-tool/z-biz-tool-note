// 快捷键「怎么匹配」「怎么挂监听」的纯逻辑（不依赖 React，也不依赖真实 DOM）。
//
// Why 单独拆一个 lib：
//   - App.tsx 里那段 90 行的 if/else 链是全仓最长的键盘处理，但它没法单测
//     （要真 DOM 事件），也没法复用 —— SettingsDialog / FolderContextMenu
//     各自又写了一遍 Escape。
//   - 拆成「匹配规则（纯函数）+ 绑定（一个 effect）」之后，匹配规则可以拿假的
//     事件对象直接跑真值表（tests/keyboardShortcuts.test.ts），
//     快捷键表也变成**数据**：谁注册、注册在哪、命中什么，看表就知道。
//
// 与改造前 App.tsx 那条 if/else 链严格对齐的语义（改这里必须同步看 App.tsx）：
//   1. e.key 统一转小写再比：Caps Lock 打开时 e.key 是大写字母，
//      原实现靠 toLowerCase 兜住，否则这批快捷键会整片静默失效。
//   2. 一次按键只命中一条：原实现是一条 else-if 链，命中即止。
//      这里的「第一条命中」等价于那条链的短路顺序。
//   3. cmd = metaKey || ctrlKey（Windows / Linux 上是 Ctrl）。
//   4. cmd / shift / alt 不写 = 不约束；写了 true/false = 必须满足 / 必须不满足。
//      （原实现里 `cmd && key==='b'` 没排除 Shift，所以 Cmd+Shift+B 也切侧栏；
//        这里保持同样的「不写就不约束」，不额外收紧。）

export interface KeyboardShortcut {
  /** 逻辑键名（对应 event.key，统一小写匹配），如 's'、'/'、','、'escape' */
  key?: string;
  /** 物理键位（对应 event.code），如 'BracketLeft'、'Backslash' */
  code?: string;
  /** 是否要求 ⌘ / Ctrl 修饰键 */
  cmd?: boolean;
  /** 是否要求 Shift */
  shift?: boolean;
  /** 是否要求 Alt / Option */
  alt?: boolean;
  /** 命中后执行 */
  handler: (e: KeyboardEvent) => void;
  /** 命中后是否阻止默认行为，默认 true */
  preventDefault?: boolean;
  /** 描述，给快捷键帮助 / 提示用 */
  description?: string;
}

/** 匹配时只需要事件上的这几个字段（真 KeyboardEvent 与测试里的假事件都满足） */
export interface KeyEventLike {
  key: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  preventDefault?: () => void;
}

/** ⌘ / Ctrl：macOS 用 metaKey，Windows / Linux 用 ctrlKey，两者都收 */
export const isCmdPressed = (e: KeyEventLike): boolean => !!(e.metaKey || e.ctrlKey);

/** 单条快捷键是否命中这次按键 */
export function matchesShortcut(shortcut: KeyboardShortcut, e: KeyEventLike): boolean {
  // 既没写 key 也没写 code 的条目等于「匹配所有按键」，这类条目一定是写错了，
  // 直接判不命中，免得它把后面所有快捷键都吃掉。
  if (shortcut.key === undefined && shortcut.code === undefined) return false;

  if (shortcut.key !== undefined) {
    const pressed = typeof e.key === 'string' ? e.key.toLowerCase() : '';
    if (pressed !== shortcut.key.toLowerCase()) return false;
  }
  if (shortcut.code !== undefined && e.code !== shortcut.code) return false;

  if (shortcut.cmd !== undefined && isCmdPressed(e) !== shortcut.cmd) return false;
  if (shortcut.shift !== undefined && !!e.shiftKey !== shortcut.shift) return false;
  if (shortcut.alt !== undefined && !!e.altKey !== shortcut.alt) return false;

  return true;
}

/**
 * 从快捷键表里找出第一条命中的。
 *
 * 顺序即优先级：表怎么排，冲突时谁赢就怎么定
 * （对应改造前那条 if/else 链的短路顺序）。
 */
export function resolveShortcut(
  shortcuts: readonly KeyboardShortcut[],
  e: KeyEventLike,
): KeyboardShortcut | undefined {
  return shortcuts.find((s) => matchesShortcut(s, e));
}

export interface KeyboardListenerOptions {
  /** 是否启用，默认 true */
  enabled?: boolean;
  /** 捕获阶段注册，默认 false（与原来 window.addEventListener('keydown', h) 一致） */
  capture?: boolean;
  /** 监听的事件名，默认 'keydown' */
  eventName?: 'keydown' | 'keyup';
}

/**
 * 把快捷键表挂到某个事件目标上，返回解绑函数。
 *
 * 命中时：先 preventDefault（条目显式写 preventDefault: false 才跳过），
 * 再调用 handler。**命中即止** —— 后面的条目不再看，
 * 与改造前 else-if 链的语义一致。
 */
export function attachKeyboardShortcuts(
  target: EventTarget,
  shortcuts: readonly KeyboardShortcut[],
  options: KeyboardListenerOptions = {},
): () => void {
  const { enabled = true, capture = false, eventName = 'keydown' } = options;
  if (!enabled) return () => {};

  const handler = (ev: Event) => {
    const keyboardEvent = ev as KeyboardEvent;
    const hit = resolveShortcut(shortcuts, keyboardEvent);
    if (!hit) return;
    if (hit.preventDefault !== false) keyboardEvent.preventDefault();
    hit.handler(keyboardEvent);
  };

  target.addEventListener(eventName, handler, capture);
  return () => target.removeEventListener(eventName, handler, capture);
}
