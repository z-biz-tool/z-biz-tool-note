// note 仓深链语义层的单测。
//
// Why 该测：语义层是纯函数（不碰 React 状态、不碰 Tauri），
// 所以「深链到底让 note 打开什么、定位到哪」这件事可以脱离界面钉住。
//
// 特别要钉住的是「note 的 id 就是文件路径」这个事实 —— 协议里说不清楚的话，
// 跨仓对接时发送方会以为能传短 id，结果 note 侧拿到一个打不开的路径。
//
// 跑法：node --experimental-strip-types --test tests/deepLink.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveNoteDeepLink } from "../src/_shared/deepLink.ts";
import type { Handoff } from "z-biz-tool-shared/protocol";

function handoff(action: string, params: Record<string, string> = {}): Handoff {
  return { product: "note", action, params };
}

test("open 带 file：打开该文件", () => {
  const out = resolveNoteDeepLink(handoff("open", { file: "/notes/a.md" }));
  assert.equal(out.problem, null);
  assert.equal(out.file, "/notes/a.md");
  assert.equal(out.query, null);
  assert.equal(out.line, null);
});

test("action 缺省按 open 处理", () => {
  const out = resolveNoteDeepLink(handoff("", { file: "/notes/a.md" }));
  assert.equal(out.file, "/notes/a.md");
});

test("open 带 query：打开后定位到那段文本", () => {
  const out = resolveNoteDeepLink(handoff("open", { file: "/notes/a.md", query: "预算" }));
  assert.equal(out.file, "/notes/a.md");
  assert.equal(out.query, "预算");
});

test("open 带 line：行号是有效正整数才认", () => {
  const out = resolveNoteDeepLink(handoff("open", { file: "/notes/a.md", line: "42" }));
  assert.equal(out.line, 42);
});

test("行号非法时忽略行号，但不连文件一起丢掉", () => {
  // 0 和负数是无效行号，传它们等于让编辑器滚到不存在的位置。
  // 但行号只是锦上添花，不该因为它坏了连文件都打不开。
  for (const bad of ["0", "-3", "abc", "1.5"]) {
    const out = resolveNoteDeepLink(handoff("open", { file: "/notes/a.md", line: bad }));
    assert.equal(out.line, null, `line=${bad} 不该被当成行号`);
    assert.equal(out.file, "/notes/a.md", `line=${bad} 不该影响打开文件`);
    assert.equal(out.problem, null);
  }
});

test("open 缺 file：接不住并说明原因", () => {
  const out = resolveNoteDeepLink(handoff("open"));
  assert.equal(out.file, null);
  assert.ok(out.problem);
  assert.match(out.problem!, /file/);
});

test("search 带 query：只带搜索意图", () => {
  const out = resolveNoteDeepLink(handoff("search", { query: "TODO" }));
  assert.equal(out.problem, null);
  assert.equal(out.file, null);
  assert.equal(out.query, "TODO");
});

test("search 缺 query：接不住并说明原因", () => {
  const out = resolveNoteDeepLink(handoff("search"));
  assert.ok(out.problem);
  assert.match(out.problem!, /query/);
});

test("search 可限定在某个文件里找", () => {
  const out = resolveNoteDeepLink(handoff("search", { query: "TODO", file: "/notes/a.md" }));
  assert.equal(out.file, "/notes/a.md");
  assert.equal(out.query, "TODO");
});

test("不认识的动作：接不住并说明是哪个动作", () => {
  const out = resolveNoteDeepLink(handoff("delete", { file: "/notes/a.md" }));
  assert.equal(out.file, null);
  assert.ok(out.problem);
  assert.match(out.problem!, /delete/);
});

test("from 参数透传出来（用于提示与日志）", () => {
  const out = resolveNoteDeepLink(handoff("open", { file: "/notes/a.md", from: "box" }));
  assert.equal(out.from, "box");
});

test("路径前后空格被裁掉（深链解析容易带上）", () => {
  const out = resolveNoteDeepLink(handoff("open", { file: "  /notes/a.md  " }));
  assert.equal(out.file, "/notes/a.md");
});
