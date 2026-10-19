// 应用级快捷键表（T4-05）
//
// Why 单独一个模块：这张表是「什么组合键 → 干什么」的唯一事实来源，
// 抽出来才能被单测直接读（组件里的 useMemo 产物是闭包，测不了）。
// 组件侧只负责把动作接进来（src/App.tsx），匹配规则在 lib/keyboardShortcuts.ts。
//
// 顺序即优先级：第一条命中的生效。
// 下面是改造前 App.tsx 里那条 window keydown if/else 链的**逐条对应**，
// 顺序与判定条件都照搬，包括几条看起来"不严谨"的口径（见每条注释）：
//   - `cmd && key === 'b'` 没排除 Shift → Cmd+Shift+B 也切侧栏
//   - `cmd && key === 'n'` 没排除 Shift → Cmd+Shift+N 也新建笔记
//   - `cmd && e.code === 'Backslash'` 没排除 Shift → Cmd+Shift+\ 也切分屏
//   - Esc 那一支不 preventDefault
// 这几条要么是历史行为、要么无害，收紧它们属于行为变更，不在本次改造范围内。
import type { KeyboardShortcut } from './keyboardShortcuts';

export interface AppShortcutActions {
  /**
   * 保存当前笔记。
   *
   * 注意：改造前 Cmd+S 是**一条**快捷键，内部先看焦点在不在分屏面板里
   * （在就存分屏那篇），所以这里只给一个动作，分屏的判断放在 save 里面。
   */
  save: () => void;
  /** 快速切换文件 */
  openQuickSwitcher: () => void;
  /** 命令面板 */
  openCommandPalette: () => void;
  /** 新建笔记 */
  newNote: () => void;
  /** 另存为 */
  saveAs: () => void;
  /** 切换侧边栏 */
  toggleSidebar: () => void;
  /** 从模板插入 */
  openTemplate: () => void;
  /** 查找替换 */
  openFindReplace: () => void;
  /** 所见即所得 / 源码模式互切 */
  toggleEditorMode: () => void;
  /** 打开文件夹 */
  openFolder: () => void;
  /** AI 助手面板 */
  toggleAiPanel: () => void;
  /** 设置面板 */
  openSettings: () => void;
  /** 今日日记 */
  createDailyNote: () => void;
  /** 知识图谱 */
  toggleKnowledgeGraph: () => void;
  /** 恢复刚关掉的标签 */
  reopenClosedTab: () => void;
  /** 版本历史 */
  openVersionHistory: () => void;
  /** 关闭当前标签 */
  closeTab: () => void;
  /** 上一个标签 */
  prevTab: () => void;
  /** 下一个标签 */
  nextTab: () => void;
  /** 切换分屏 */
  toggleSplit: () => void;
  /** 关闭所有浮层 */
  closeOverlays: () => void;
}

/** 快捷键表：顺序即优先级，与改造前的 if/else 链逐条对应 */
export function createAppShortcuts(a: AppShortcutActions): KeyboardShortcut[] {
  return [
    // Cmd+S 保存（带 Shift 时留给下面的另存为）
    { key: 's', cmd: true, shift: false, handler: a.save },
    // Cmd+P 快速切换
    { key: 'p', cmd: true, shift: false, handler: a.openQuickSwitcher },
    // Cmd+Shift+P 命令面板
    { key: 'p', cmd: true, shift: true, handler: a.openCommandPalette },
    // Cmd+N 新建笔记（改造前没排除 Shift）
    { key: 'n', cmd: true, handler: a.newNote },
    // Cmd+Shift+S 另存为
    { key: 's', cmd: true, shift: true, handler: a.saveAs },
    // Cmd+B 切换侧栏（编辑器内 Cmd+B 被 Tiptap 的加粗拦走，这里只在编辑器之外生效）
    { key: 'b', cmd: true, handler: a.toggleSidebar },
    // Cmd+Shift+I 从模板插入
    { key: 'i', cmd: true, shift: true, handler: a.openTemplate },
    // Cmd+F 查找替换
    { key: 'f', cmd: true, handler: a.openFindReplace },
    // Cmd+/ 切换所见即所得 / 源码模式
    { key: '/', cmd: true, handler: a.toggleEditorMode },
    // Cmd+Shift+O 打开文件夹
    { key: 'o', cmd: true, shift: true, handler: a.openFolder },
    // Cmd+J 切换 AI 助手
    { key: 'j', cmd: true, handler: a.toggleAiPanel },
    // Cmd+, 打开设置（macOS 惯例）
    { key: ',', cmd: true, handler: a.openSettings },
    // Cmd+Shift+D 今日日记（Cmd+D 让给多光标）
    { key: 'd', cmd: true, shift: true, handler: a.createDailyNote },
    // Cmd+Shift+G 知识图谱
    { key: 'g', cmd: true, shift: true, handler: a.toggleKnowledgeGraph },
    // Cmd+Shift+T 恢复刚关掉的标签（和浏览器/编辑器的主流键位一致）
    { key: 't', cmd: true, shift: true, handler: a.reopenClosedTab },
    // Cmd+Shift+H 版本历史
    { key: 'h', cmd: true, shift: true, handler: a.openVersionHistory },
    // Cmd+W 关闭当前标签
    { key: 'w', cmd: true, shift: false, handler: a.closeTab },
    // Cmd+Shift+[ / Cmd+Shift+] 上一个 / 下一个标签（按物理键位匹配）
    { code: 'BracketLeft', cmd: true, shift: true, handler: a.prevTab },
    { code: 'BracketRight', cmd: true, shift: true, handler: a.nextTab },
    // Cmd+\ 切换分屏（改造前没排除 Shift）
    { code: 'Backslash', cmd: true, handler: a.toggleSplit },
    // Esc 关闭所有浮层（改造前这一支不 preventDefault）
    { key: 'escape', preventDefault: false, handler: a.closeOverlays },
  ];
}
