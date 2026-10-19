// src/lib/keyboardShortcuts.ts 的纯逻辑回归（T4-05）。
//
// Why 该测：快捷键匹配是「用户按了键 → 应用做什么」的唯一决策点，
// 一旦匹配口径漂了，表现是"某个快捷键突然没反应"或"两个快捷键打架"——
// 这类问题在应用里极难复现和定位（要真的按下那串键，还要看当时焦点在哪）。
// 把它拆成纯函数后，这里的真值表就是它的规格说明：
// 任何一条被改坏，这里立刻红。
//
// 跑法：node --experimental-strip-types --test tests/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { installHooks } from "./helpers/hooks.ts";

installHooks();

const ks = await import("../src/lib/keyboardShortcuts.ts");
const { matchesShortcut, resolveShortcut, attachKeyboardShortcuts, isCmdPressed } = ks;

/** 造一个假的按键事件（只带匹配需要的字段） */
const ev = (over: Record<string, unknown> = {}) => ({
  key: "",
  code: "",
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
});

/** 造一个只记调用、不做事的快捷键 */
const stub = (over: Record<string, unknown> = {}) => ({
  key: "s",
  cmd: true,
  handler: () => {},
  ...over,
});

/* ───────────────────────── 修饰键判定 ───────────────────────── */

test("cmd = metaKey || ctrlKey：macOS 的 ⌘ 与 Windows/Linux 的 Ctrl 都算", () => {
  assert.equal(isCmdPressed(ev({ metaKey: true })), true);
  assert.equal(isCmdPressed(ev({ ctrlKey: true })), true);
  assert.equal(isCmdPressed(ev({ metaKey: true, ctrlKey: true })), true);
  assert.equal(isCmdPressed(ev()), false);
});

/* ───────────────────────── 单条匹配 ───────────────────────── */

test("key 统一转小写比较：Caps Lock 打开时按 ⌘S 拿到的 e.key 是 'S'，仍要命中", () => {
  assert.equal(matchesShortcut(stub(), ev({ key: "S", metaKey: true })), true);
  assert.equal(matchesShortcut(stub(), ev({ key: "s", metaKey: true })), true);
});

test("cmd: true 要求真的按下了 ⌘/Ctrl", () => {
  assert.equal(matchesShortcut(stub(), ev({ key: "s" })), false);
  assert.equal(matchesShortcut(stub(), ev({ key: "s", metaKey: true })), true);
  assert.equal(matchesShortcut(stub(), ev({ key: "s", ctrlKey: true })), true);
});

test("cmd: false 要求**没有**按 ⌘/Ctrl（不能把裸键也吃进来）", () => {
  const s = stub({ cmd: false });
  assert.equal(matchesShortcut(s, ev({ key: "s" })), true);
  assert.equal(matchesShortcut(s, ev({ key: "s", metaKey: true })), false);
});

test("shift 不写 = 不约束；写 false = 必须没按 Shift；写 true = 必须按着", () => {
  assert.equal(matchesShortcut(stub({ shift: undefined }), ev({ key: "s", metaKey: true, shiftKey: true })), true);
  assert.equal(matchesShortcut(stub({ shift: false }), ev({ key: "s", metaKey: true, shiftKey: true })), false);
  assert.equal(matchesShortcut(stub({ shift: false }), ev({ key: "s", metaKey: true })), true);
  assert.equal(matchesShortcut(stub({ shift: true }), ev({ key: "s", metaKey: true })), false);
  assert.equal(matchesShortcut(stub({ shift: true }), ev({ key: "s", metaKey: true, shiftKey: true })), true);
});

test("alt 同 shift 的口径", () => {
  assert.equal(matchesShortcut(stub({ alt: true }), ev({ key: "s", metaKey: true })), false);
  assert.equal(matchesShortcut(stub({ alt: true }), ev({ key: "s", metaKey: true, altKey: true })), true);
});

test("code 按物理键位匹配（Cmd+Shift+[ 在不同键盘布局上 key 各不相同）", () => {
  const s = stub({ key: undefined, code: "BracketLeft", cmd: true, shift: true });
  assert.equal(matchesShortcut(s, ev({ key: "{", code: "BracketLeft", metaKey: true, shiftKey: true })), true);
  assert.equal(matchesShortcut(s, ev({ key: "{", code: "BracketRight", metaKey: true, shiftKey: true })), false);
});

test("key 与 code 都写了时，两个都要对上", () => {
  const s = stub({ key: "s", code: "KeyS" });
  assert.equal(matchesShortcut(s, ev({ key: "s", code: "KeyS", metaKey: true })), true);
  assert.equal(matchesShortcut(s, ev({ key: "s", code: "KeyD", metaKey: true })), false);
});

test("既没写 key 也没写 code 的条目不匹配任何按键（否则它会把后面的全吃掉）", () => {
  const s = { cmd: true, handler: () => {} };
  assert.equal(matchesShortcut(s, ev({ key: "s", metaKey: true })), false);
});

/* ───────────────────────── 命中即止 ───────────────────────── */

test("resolveShortcut 只认第一条命中的（顺序即优先级）", () => {
  // 两条都能命中同一个裸键 s（cmd 不写 = 不约束），谁在前面谁赢
  const first = stub({ cmd: undefined });
  const second = stub({ cmd: undefined });
  assert.equal(resolveShortcut([first, second], ev({ key: "s" })), first);
  assert.equal(resolveShortcut([second, first], ev({ key: "s" })), second);
});

test("前一条没命中时往后找（不是「第一条说了算」）", () => {
  const miss = stub({ key: "p" });
  const hit = stub({ key: "s", cmd: undefined });
  assert.equal(resolveShortcut([miss, hit], ev({ key: "s" })), hit);
});

test("一条都没命中时返回 undefined", () => {
  assert.equal(resolveShortcut([stub({ key: "p" })], ev({ key: "s" })), undefined);
});

/* ───────────────────────── 挂载 / 解绑 ───────────────────────── */

/** 假的 EventTarget：记录注册与派发 */
function fakeTarget() {
  const listeners: Array<{ type: string; fn: (e: unknown) => void; capture: boolean }> = [];
  return {
    listeners,
    target: {
      addEventListener(type: string, fn: (e: unknown) => void, capture?: boolean) {
        listeners.push({ type, fn, capture: !!capture });
      },
      removeEventListener(type: string, fn: (e: unknown) => void, capture?: boolean) {
        const i = listeners.findIndex((l) => l.type === type && l.fn === fn && l.capture === !!capture);
        if (i >= 0) listeners.splice(i, 1);
      },
    } as unknown as EventTarget,
    dispatch(e: Record<string, unknown>) {
      for (const l of [...listeners]) l.fn(e);
    },
  };
}

test("attachKeyboardShortcuts 命中时先 preventDefault 再调 handler", () => {
  const order: string[] = [];
  const fake = fakeTarget();
  const detach = attachKeyboardShortcuts(fake.target, [
    {
      key: "s",
      cmd: true,
      handler: () => order.push("handler"),
    },
  ]);
  fake.dispatch({
    key: "s",
    metaKey: true,
    preventDefault: () => order.push("preventDefault"),
  });
  assert.deepEqual(order, ["preventDefault", "handler"]);
  detach();
});

test("preventDefault: false 的条目不阻止默认行为（Esc 那一支就是它）", () => {
  const order: string[] = [];
  const fake = fakeTarget();
  attachKeyboardShortcuts(fake.target, [
    {
      key: "escape",
      preventDefault: false,
      handler: () => order.push("handler"),
    },
  ]);
  fake.dispatch({ key: "Escape", preventDefault: () => order.push("preventDefault") });
  assert.deepEqual(order, ["handler"]);
});

test("没命中的按键不调 handler，也不 preventDefault", () => {
  const order: string[] = [];
  const fake = fakeTarget();
  attachKeyboardShortcuts(fake.target, [{ key: "s", cmd: true, handler: () => order.push("handler") }]);
  fake.dispatch({ key: "x", metaKey: true, preventDefault: () => order.push("preventDefault") });
  assert.deepEqual(order, []);
});

test("解绑后不再响应（组件卸载时必须真的摘掉监听）", () => {
  let hits = 0;
  const fake = fakeTarget();
  const detach = attachKeyboardShortcuts(fake.target, [{ key: "s", cmd: true, handler: () => { hits++; } }]);
  fake.dispatch({ key: "s", metaKey: true, preventDefault: () => {} });
  assert.equal(hits, 1);
  detach();
  assert.equal(fake.listeners.length, 0, "解绑后不应残留监听");
  fake.dispatch({ key: "s", metaKey: true, preventDefault: () => {} });
  assert.equal(hits, 1, "解绑后不该再触发");
});

test("enabled: false 时不注册任何监听", () => {
  const fake = fakeTarget();
  attachKeyboardShortcuts(fake.target, [{ key: "s", cmd: true, handler: () => {} }], { enabled: false });
  assert.equal(fake.listeners.length, 0);
});

test("默认监听 keydown；可以改事件名", () => {
  const fake = fakeTarget();
  attachKeyboardShortcuts(fake.target, [{ key: "s", cmd: true, handler: () => {} }]);
  assert.equal(fake.listeners[0].type, "keydown");
  const fake2 = fakeTarget();
  attachKeyboardShortcuts(fake2.target, [{ key: "s", cmd: true, handler: () => {} }], { eventName: "keyup" });
  assert.equal(fake2.listeners[0].type, "keyup");
});
