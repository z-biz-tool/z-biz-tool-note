// src/lib/selfWrites.ts 的回归。
//
// Why 该测：文件监听不认识人 —— 我们自己 atomic_write 完不到一秒，
// 同一个 .md 就会以「文件变了」广播回来。前端必须能分清
// 「这次变化是我自己造成的」与「用户在外面改了文件」，
// 否则每存一次盘都会冒出「已加载外部修改」，把刚打的字覆盖掉。
//
// decideExternalChange 是这个判断的唯一决策点（纯函数），
// 这里把它的真值表全列出来。
//
// 跑法：node --experimental-strip-types --test tests/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { installHooks } from "./helpers/hooks.ts";

installHooks();

const { markSelfWrite, selfWriteOf, forgetSelfWrite, decideExternalChange } = await import(
  "../src/lib/selfWrites.ts"
);

/* ───────────────────── decideExternalChange 真值表 ───────────────────── */

test("盘上内容与本地完全一致 → ignore（无事发生）", () => {
  assert.equal(
    decideExternalChange({ disk: "A", local: "A", recorded: null, isDirty: false }),
    "ignore",
  );
});

test("盘上内容就是我们刚写出去的那份 → ignore（这是我们自己的回声）", () => {
  assert.equal(
    decideExternalChange({ disk: "A", local: "B", recorded: "A", isDirty: true }),
    "ignore",
  );
});

test("真的被人改了、本地还有没保存的改动 → confirm（必须先问用户）", () => {
  assert.equal(
    decideExternalChange({ disk: "A", local: "B", recorded: "C", isDirty: true }),
    "confirm",
  );
});

test("真的被人改了、本地没改动 → reload（直接换上并提示一句）", () => {
  assert.equal(
    decideExternalChange({ disk: "A", local: "B", recorded: "C", isDirty: false }),
    "reload",
  );
});

test("本地是 null（本地没这个文件）也算有未保存内容那一侧要确认", () => {
  // local 为 null 时不能当成「内容一样」—— 那会把用户的改动直接吃掉
  assert.equal(
    decideExternalChange({ disk: "A", local: null, recorded: null, isDirty: true }),
    "confirm",
  );
  assert.equal(
    decideExternalChange({ disk: "A", local: null, recorded: null, isDirty: false }),
    "reload",
  );
});

test("recorded 为 null 表示没记过（这个文件的盘上变化与我们无关）", () => {
  assert.equal(
    decideExternalChange({ disk: "A", local: "B", recorded: null, isDirty: true }),
    "confirm",
  );
});

/* ───────────────────── 自写对账表 ───────────────────── */

test("记下的内容能原样取回", () => {
  markSelfWrite("/a.md", "内容 A");
  assert.equal(selfWriteOf("/a.md"), "内容 A");
  forgetSelfWrite("/a.md");
});

test("没记过的文件取回 undefined", () => {
  assert.equal(selfWriteOf("/never-written.md"), undefined);
});

test("forget 之后取回 undefined", () => {
  markSelfWrite("/b.md", "内容 B");
  forgetSelfWrite("/b.md");
  assert.equal(selfWriteOf("/b.md"), undefined);
});

test("重写同一个文件时以最后一次为准", () => {
  markSelfWrite("/c.md", "第一次");
  markSelfWrite("/c.md", "第二次");
  assert.equal(selfWriteOf("/c.md"), "第二次");
  forgetSelfWrite("/c.md");
});

test("记的条数有上限，超出后淘汰最旧的一条（不能让内存无限涨）", () => {
  // 上限 100：写 150 个文件，第 1 个应被淘汰，最后一个还在
  for (let i = 0; i < 150; i++) markSelfWrite(`/many-${i}.md`, `x${i}`);
  assert.equal(selfWriteOf("/many-0.md"), undefined, "最旧的应被淘汰");
  assert.equal(selfWriteOf("/many-149.md"), "x149", "最新的必须还在");
  for (let i = 0; i < 150; i++) forgetSelfWrite(`/many-${i}.md`);
});
