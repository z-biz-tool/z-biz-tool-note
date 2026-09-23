import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * 应用内确认/输入弹窗。
 *
 * Why: 原来 15 处地方直接用 window.confirm/prompt/alert —— 原生对话框不跟主题、
 * 会阻塞整个窗口（自动保存/文件监听都停在原地），而且 macOS 上标题栏写的是
 * "127.0.0.1:5231 说"，对用户毫无意义。这里给一个 await 形式的替代：
 * confirmDialog() → Promise<boolean>，promptDialog() → Promise<string|null>，
 * 语义与原生一致，调用点改动最小。
 */

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  /** 破坏性动作用红色确认按钮 */
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  /** 返回错误文案则留在弹窗里继续改，返回空才提交；可以是异步的（比如查一次文件是否存在） */
  validate?: (value: string) => string | null | Promise<string | null>;
}

type Dialog =
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: any) => void }
  | { kind: 'prompt'; opts: PromptOptions; resolve: (v: any) => void };

let current: Dialog | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => fn());

function settle(value: any) {
  const dialog = current;
  if (!dialog) return;
  current = null;
  emit();
  dialog.resolve(value);
}

function show(kind: Dialog['kind'], opts: any): Promise<any> {
  return new Promise(resolve => {
    // 同一时刻只留一个弹窗：后来者把前一个按"取消"结算，避免调用方永远 await 下去
    if (current) settle(kind === 'confirm' ? false : null);
    current = { kind, opts, resolve } as Dialog;
    emit();
  });
}

export const confirmDialog = (opts: ConfirmOptions) => show('confirm', opts) as Promise<boolean>;
export const promptDialog = (opts: PromptOptions) => show('prompt', opts) as Promise<string | null>;

/* ===== 全局 Toast =====
 * Why: 原来 toast 是 App.tsx 里的一个 useState，只有 App 自己能弹，各组件的失败提示
 * 只能退回原生 alert；而且两次连续 showToast 会互相打架——前一条排定的 2.5s 移除定时器
 * 会把刚弹出的后一条直接清掉。放到模块级 store 后任何地方都能 notify，定时器也按 id 管。
 */
export type ToastKind = 'info' | 'success' | 'error';

interface ToastItem { id: number; message: string; kind: ToastKind; exiting: boolean }

let toasts: ToastItem[] = [];
let toastSeq = 0;
const toastListeners = new Set<() => void>();
const toastTimers = new Map<number, ReturnType<typeof setTimeout>[]>();

/** [开始退场 ms, 移除 DOM ms]：错误要多留一会儿，用户得来得及看清失败原因 */
const TOAST_TTL: Record<ToastKind, [number, number]> = {
  info: [2200, 2500],
  success: [2200, 2500],
  error: [5200, 5500],
};
const MAX_TOASTS = 3;

function emitToasts() { toastListeners.forEach(fn => fn()); }

function clearToastTimers(id: number) {
  const timers = toastTimers.get(id);
  if (!timers) return;
  timers.forEach(clearTimeout);
  toastTimers.delete(id);
}

function patchToast(id: number, patch: Partial<ToastItem>) {
  const idx = toasts.findIndex(t => t.id === id);
  if (idx < 0) return;
  toasts = toasts.map((t, i) => (i === idx ? { ...t, ...patch } : t));
  emitToasts();
}

/** 立即收起一条：点掉，或被新 toast 挤掉时走这里 */
function dismissToast(id: number) {
  clearToastTimers(id);
  toasts = toasts.filter(t => t.id !== id);
  emitToasts();
}

export function notify(message: string, kind: ToastKind = 'info') {
  const id = ++toastSeq;
  const next: ToastItem[] = [...toasts, { id, message, kind, exiting: false }];
  // 超出上限时挤掉最老的几条（已在退场的不占额度）：连点导出/保存时不至于糊满屏幕底部
  const alive = next.filter(t => !t.exiting);
  const dropIds = new Set(
    alive.length > MAX_TOASTS ? alive.slice(0, alive.length - MAX_TOASTS).map(t => t.id) : []
  );
  dropIds.forEach(clearToastTimers);
  toasts = next.filter(t => !dropIds.has(t.id));
  emitToasts();
  const [exitAt, removeAt] = TOAST_TTL[kind];
  toastTimers.set(id, [
    setTimeout(() => patchToast(id, { exiting: true }), exitAt),
    setTimeout(() => dismissToast(id), removeAt),
  ]);
}

/** 挂在 App 根部即可，任何模块 import notify 都能弹 */
export function ToastHost() {
  const items = useSyncExternalStore(
    (fn) => { toastListeners.add(fn); return () => { toastListeners.delete(fn); }; },
    () => toasts,
    () => toasts,
  );
  if (items.length === 0) return null;
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {items.map(t => (
        <div
          key={t.id}
          className={`toast toast-${t.kind}${t.exiting ? ' toast-exit' : ''}`}
          role={t.kind === 'error' ? 'alert' : 'status'}
          onClick={() => dismissToast(t.id)}
          title="点击关闭"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

export function DialogHost() {
  const dialog = useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    () => current,
    () => current,
  );
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // 键盘监听只挂一次，处理函数读 ref 才拿得到最新的输入值
  const dialogRef = useRef(dialog);
  dialogRef.current = dialog;
  const valueRef = useRef(value);
  valueRef.current = value;
  const busyRef = useRef(false);

  const finish = useCallback(async (mode: 'cancel' | 'submit') => {
    const active = dialogRef.current;
    if (!active) return;
    if (mode === 'cancel') return settle(active.kind === 'confirm' ? false : null);
    if (active.kind === 'confirm') return settle(true);
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const trimmed = valueRef.current.trim();
    // validate 可以异步（重名要问一次磁盘），期间按钮禁用，免得回车连发提交两次
    const msg = active.opts.validate ? await active.opts.validate(trimmed) : null;
    busyRef.current = false;
    setBusy(false);
    if (msg) return setError(msg);
    settle(trimmed);
  }, []);

  useEffect(() => {
    if (!dialog) return;
    const next = dialog.kind === 'prompt' ? (dialog.opts.defaultValue ?? '') : '';
    setError(null);
    setBusy(false);
    busyRef.current = false;
    setValue(next);
    // 用 setTimeout 而不是 rAF：窗口被遮挡/最小化时 rAF 压根不触发，弹窗会连焦点都拿不到
    const timer = setTimeout(() => {
      if (dialog.kind === 'confirm') {
        // 破坏性动作把焦点放在「取消」上，回车不会顺手把废纸篓确认掉
        (dialog.opts.danger ? cancelRef : primaryRef).current?.focus();
        return;
      }
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      // 读 DOM 真实值再定选区：只选中扩展名之前的部分，改名时直接打字就能换掉名字、留下 .md
      const dot = el.value.lastIndexOf('.');
      el.setSelectionRange(0, dot > 0 ? dot : el.value.length);
    }, 0);
    return () => clearTimeout(timer);
  }, [dialog]);

  useEffect(() => {
    // 挂在 window 上：原生对话框的 Enter/Esc 习惯要保住，而 confirm 弹窗里没有输入框，
    // 焦点不在容器里就收不到键盘事件
    const onKey = (e: KeyboardEvent) => {
      // 没有弹窗时一个字符都不能拦：这是 window 级监听，preventDefault 会把编辑器里
      // 打字的 Enter 一起吞掉
      if (!dialogRef.current) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        // 破坏性确认把焦点停在「取消」上时，Enter 就该等于取消，否则"回车手滑删文件"
        // 的防护形同虚设
        finish(document.activeElement === cancelRef.current ? 'cancel' : 'submit');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish('cancel');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish]);

  if (!dialog) return null;
  const opts = dialog.opts;
  const cancel = () => finish('cancel');
  const submit = () => finish('submit');

  return (
    <div className="modal-overlay" onMouseDown={cancel}>
      <div
        className="modal-dialog app-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={opts.title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{opts.title}</h2>
        </div>
        <div className="modal-body">
          {opts.message && <p className="app-dialog-message">{opts.message}</p>}
          {dialog.kind === 'prompt' && (
            <input
              ref={inputRef}
              className="app-dialog-input"
              value={value}
              placeholder={dialog.opts.placeholder}
              onChange={(e) => { setValue(e.target.value); if (error) setError(null); }}
            />
          )}
          {error && <p className="app-dialog-error">{error}</p>}
        </div>
        <div className="modal-footer">
          <button ref={cancelRef} className="btn-secondary" disabled={busy} onClick={cancel}>{opts.cancelText || '取消'}</button>
          <button ref={primaryRef} disabled={busy} className={dialog.kind === 'confirm' && dialog.opts.danger ? 'btn-primary danger' : 'btn-primary'} onClick={submit}>
            {opts.confirmText || (dialog.kind === 'confirm' ? '确定' : (busy ? '检查中…' : '好'))}
          </button>
        </div>
      </div>
    </div>
  );
}
