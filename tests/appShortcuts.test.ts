// src/lib/appShortcuts.ts 的真值表（T4-05）。
//
// Why 该测：这张表是把 App.tsx 里原来那条 90 行 if/else 链**逐条搬过来**的，
// 搬的过程中最容易出的错是"少搬一条""顺序变了""条件收紧了"——
// 表现都是某个快捷键突然失灵或串台，而且只有真去按那串键才发现得了。
// 这里把改造前的行为写成规格：每个组合键 → 哪个动作，一条不漏。
//
// 特别注意下面几条**看起来不严谨但必须保留**的历史行为（改造前就是这样）：
//   - Cmd+Shift+N 也新建笔记（'n' 那条没排除 Shift）
//   - Cmd+Shift+B 也切侧栏（'b' 那条没排除 Shift）
//   - Cmd+Shift+\ 也切分屏（Backslash 那条没排除 Shift）
//   - Esc 不 preventDefault
// 收紧它们属于行为变更，不在 T4-05 的范围内 —— 但一定要有人盯着，
// 哪天真要改，这里就是该改的地方。
import { test } from "node:test";
import assert from "node:assert/strict";
import { installHooks } from "./helpers/hooks.ts";

installHooks();

const { createAppShortcuts } = await import("../src/lib/appShortcuts.ts");
const { resolveShortcut, attachKeyboardShortcuts } = await import("../src/lib/keyboardShortcuts.ts");

/** 表里所有动作名（与 AppShortcutActions 一一对应） */
const ACTION_NAMES = [
  "save",
  "openQuickSwitcher",
  "openCommandPalette",
  "newNote",
  "saveAs",
  "toggleSidebar",
  "openTemplate",
  "openFindReplace",
  "toggleEditorMode",
  "openFolder",
  "toggleAiPanel",
  "openSettings",
  "createDailyNote",
  "toggleKnowledgeGraph",
  "reopenClosedTab",
  "openVersionHistory",
  "closeTab",
  "prevTab",
  "nextTab",
  "toggleSplit",
  "closeOverlays",
] as const;

/** 造一份"每个动作都会记账"的快捷键表 */
function tableWithCalls(calls: string[]) {
  const actions: Record<string, () => void> = {};
  for (const name of ACTION_NAMES) {
    actions[name] = () => calls.push(name);
  }
  return createAppShortcuts(actions as never);
}

/** 按一次键，返回被触发的动作名（没命中任何条目则空数组） */
function press(over: Record<string, unknown>): string[] {
  const calls: string[] = [];
  const shortcuts = tableWithCalls(calls);
  const e = {
    key: "",
    code: "",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...over,
  };
  const hit = resolveShortcut(shortcuts, e);
  if (hit) hit.handler(e as never);
  return calls;
}

/** macOS 风格的组合键 ⌘ + 可选 Shift + 逻辑键 */
const cmd = (key: string, shift = false) => ({ key, metaKey: true, shiftKey: shift });
/** Windows / Linux 风格：Ctrl 同样算 cmd */
const ctrl = (key: string, shift = false) => ({ key, ctrlKey: true, shiftKey: shift });

/* ───────────────────── 每个组合键 → 哪个动作 ───────────────────── */

test("⌘+S 保存（不带 Shift）", () => {
  assert.deepEqual(press(cmd("s")), ["save"]);
});

test("⌘+Shift+S 另存为（不能同时触发保存）", () => {
  assert.deepEqual(press(cmd("s", true)), ["saveAs"]);
});

test("⌘+P 快速切换 / ⌘+Shift+P 命令面板", () => {
  assert.deepEqual(press(cmd("p")), ["openQuickSwitcher"]);
  assert.deepEqual(press(cmd("p", true)), ["openCommandPalette"]);
});

test("⌘+N 新建笔记", () => {
  assert.deepEqual(press(cmd("n")), ["newNote"]);
});

test("⌘+Shift+N 也新建笔记（改造前 'n' 那条没排除 Shift，保留现状）", () => {
  assert.deepEqual(press(cmd("n", true)), ["newNote"]);
});

test("⌘+B 切侧栏；⌘+Shift+B 也切（改造前没排除 Shift，保留现状）", () => {
  assert.deepEqual(press(cmd("b")), ["toggleSidebar"]);
  assert.deepEqual(press(cmd("b", true)), ["toggleSidebar"]);
});

test("⌘+Shift+I 从模板插入", () => {
  assert.deepEqual(press(cmd("i", true)), ["openTemplate"]);
});

test("⌘+F 查找替换", () => {
  assert.deepEqual(press(cmd("f")), ["openFindReplace"]);
});

test("⌘+/ 切换编辑器模式（key 是斜杠，不是 code）", () => {
  assert.deepEqual(press(cmd("/")), ["toggleEditorMode"]);
});

test("⌘+Shift+O 打开文件夹", () => {
  assert.deepEqual(press(cmd("o", true)), ["openFolder"]);
});

test("⌘+J 切换 AI 面板", () => {
  assert.deepEqual(press(cmd("j")), ["toggleAiPanel"]);
});

test("⌘+, 打开设置（key 是逗号）", () => {
  assert.deepEqual(press(cmd(",")), ["openSettings"]);
});

test("⌘+Shift+D 今日日记", () => {
  assert.deepEqual(press(cmd("d", true)), ["createDailyNote"]);
});

test("⌘+Shift+G 知识图谱", () => {
  assert.deepEqual(press(cmd("g", true)), ["toggleKnowledgeGraph"]);
});

test("⌘+Shift+T 恢复刚关掉的标签", () => {
  assert.deepEqual(press(cmd("t", true)), ["reopenClosedTab"]);
});

test("⌘+Shift+H 版本历史", () => {
  assert.deepEqual(press(cmd("h", true)), ["openVersionHistory"]);
});

test("⌘+W 关闭当前标签；⌘+Shift+W 不该命中任何条目", () => {
  assert.deepEqual(press(cmd("w")), ["closeTab"]);
  assert.deepEqual(press(cmd("w", true)), []);
});

test("⌘+Shift+[ / ⌘+Shift+] 切标签（按物理键位 BracketLeft/Right 匹配）", () => {
  assert.deepEqual(press({ key: "{", code: "BracketLeft", metaKey: true, shiftKey: true }), ["prevTab"]);
  assert.deepEqual(press({ key: "}", code: "BracketRight", metaKey: true, shiftKey: true }), ["nextTab"]);
});

test("⌘+\\ 切分屏；⌘+Shift+\\ 也切（改造前没排除 Shift，保留现状）", () => {
  assert.deepEqual(press({ key: "\\", code: "Backslash", metaKey: true }), ["toggleSplit"]);
  assert.deepEqual(press({ key: "\\", code: "Backslash", metaKey: true, shiftKey: true }), ["toggleSplit"]);
});

test("Esc 关闭所有浮层（不带任何修饰键）", () => {
  assert.deepEqual(press({ key: "Escape" }), ["closeOverlays"]);
});

test("⌘+Esc 也关浮层（Esc 那条不约束修饰键）", () => {
  assert.deepEqual(press({ key: "Escape", metaKey: true }), ["closeOverlays"]);
});

/* ───────────────────── 修饰键口径 ───────────────────── */

test("Windows / Linux 的 Ctrl 与 macOS 的 ⌘ 等价（同一张表两边都能用）", () => {
  assert.deepEqual(press(ctrl("s")), ["save"]);
  assert.deepEqual(press(ctrl("p", true)), ["openCommandPalette"]);
  assert.deepEqual(press(ctrl("w")), ["closeTab"]);
});

test("没有修饰键的裸键不该命中任何快捷键（不能把 's' 单独绑成保存）", () => {
  assert.deepEqual(press({ key: "s" }), []);
  assert.deepEqual(press({ key: "p" }), []);
  assert.deepEqual(press({ key: "/" }), []);
  assert.deepEqual(press({ key: "," }), []);
});

test("Caps Lock 打开时 e.key 是大写，仍要命中（key 统一转小写）", () => {
  assert.deepEqual(press(cmd("S")), ["save"]);
  assert.deepEqual(press(cmd("P")), ["openQuickSwitcher"]);
});

/* ───────────────────── Esc 的 preventDefault 口径 ───────────────────── */

test("Esc 不 preventDefault（改造前那一支就没调）", () => {
  const calls: string[] = [];
  const shortcuts = tableWithCalls(calls);
  let prevented = 0;
  const fake = {
    addEventListener(_t: string, fn: (e: unknown) => void) { (fake as any).fn = fn; },
    removeEventListener() {},
  } as unknown as EventTarget;
  attachKeyboardShortcuts(fake, shortcuts);
  (fake as any).fn({ key: "Escape", preventDefault: () => { prevented++; } });
  assert.deepEqual(calls, ["closeOverlays"]);
  assert.equal(prevented, 0, "Esc 不该阻止默认行为");
});

test("其它快捷键都 preventDefault（避免浏览器的 Cmd+S 另存为弹窗抢走）", () => {
  const calls: string[] = [];
  const shortcuts = tableWithCalls(calls);
  let prevented = 0;
  const fake = {
    addEventListener(_t: string, fn: (e: unknown) => void) { (fake as any).fn = fn; },
    removeEventListener() {},
  } as unknown as EventTarget;
  attachKeyboardShortcuts(fake, shortcuts);
  (fake as any).fn({ key: "s", metaKey: true, preventDefault: () => { prevented++; } });
  assert.deepEqual(calls, ["save"]);
  assert.equal(prevented, 1);
});

/* ───────────────────── 表本身的形状 ───────────────────── */

test("表里 21 条，一条不多一条不少（多一条就是重复绑定，少一条就是漏搬）", () => {
  const shortcuts = tableWithCalls([]);
  assert.equal(shortcuts.length, ACTION_NAMES.length);
  assert.equal(new Set(shortcuts.map((s) => s.handler)).size, ACTION_NAMES.length, "动作不该重复");
});

test("每个动作都恰好被一条快捷键绑定（没有孤立的 action，也就没有点不到的死代码）", () => {
  const calls: string[] = [];
  const actions: Record<string, () => void> = {};
  for (const name of ACTION_NAMES) actions[name] = () => calls.push(name);
  const shortcuts = createAppShortcuts(actions as never);
  const bound = new Set(shortcuts.map((s) => s.handler));
  for (const name of ACTION_NAMES) {
    assert.ok(bound.has(actions[name]), `动作 ${name} 没有被任何快捷键绑定`);
  }
});
