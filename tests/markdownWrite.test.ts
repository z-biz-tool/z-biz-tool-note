// src/lib/markdownWrite.ts 的纯逻辑回归。
//
// Why 该测：这是「编辑器里的内容 → 真正写进磁盘的字节」的最后一道关口。
// 两个函数都在**修**别人写坏的东西：
//   - restoreWikiLinkEscapes：把 Tiptap 过度转义出来的 \[\[X\]\] 还原成 [[X]]
//     （不还原的话 Rust 端 extract_links 找不到相邻的 [[ ，反链与图谱静默丢链）
//   - normalizeEmptyTaskItems：给裸 `- [ ]` 补尾空格
//     （不补的话存一次盘会把任务项退化成普通项目符号，还把下一条吞进同一条）
// 这类"修坏"一旦失效，症状都是"存一次盘，笔记里的东西就变样了"——
// 而且当场看不出来，过几天才发现。所以必须钉住。
//
// 跑法：node --experimental-strip-types --test tests/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { installHooks } from "./helpers/hooks.ts";

installHooks();

const { restoreWikiLinkEscapes, normalizeEmptyTaskItems, prepareMarkdownForWrite } = await import(
  "../src/lib/markdownWrite.ts"
);

/* ─────────────────────── restoreWikiLinkEscapes ─────────────────────── */

test("转义的双链还原成 [[X]]", () => {
  assert.equal(restoreWikiLinkEscapes("见 \\[\\[Getting Started\\]\\] 一文"), "见 [[Getting Started]] 一文");
});

test("已经是对的 [[X]] 不动（幂等）", () => {
  assert.equal(restoreWikiLinkEscapes("见 [[Getting Started]] 一文"), "见 [[Getting Started]] 一文");
});

test("双层反斜杠的深层转义也还原", () => {
  assert.equal(restoreWikiLinkEscapes("a \\\\[\\[X\\]\\] b"), "a [[X]] b");
});

test("只有一个 \[ 的普通转义不动（不能把 markdown 的方括号转义一起吃掉）", () => {
  assert.equal(restoreWikiLinkEscapes("数组写法 \\[1\\] 保留"), "数组写法 \\[1\\] 保留");
});

test("一行里多个双链都还原", () => {
  assert.equal(
    restoreWikiLinkEscapes("\\[\\[A\\]\\] 与 \\[\\[B\\]\\]"),
    "[[A]] 与 [[B]]",
  );
});

test("带 #小节 的双链原样保留小节部分", () => {
  assert.equal(restoreWikiLinkEscapes("\\[\\[Note#章节\\]\\]"), "[[Note#章节]]");
});

test("代码围栏里的 \\[[X]]\\ 是用户写的字面量，不能动", () => {
  const md = "示例：\n```\n\\[\\[X\\]\\]\n```\n正文";
  assert.equal(restoreWikiLinkEscapes(md), md);
});

test("围栏外的内容照常还原（围栏只护住围栏内）", () => {
  const md = "```\n\\[\\[X\\]\\]\n```\n\\[\\[Y\\]\\]";
  assert.equal(restoreWikiLinkEscapes(md), "```\n\\[\\[X\\]\\]\n```\n[[Y]]");
});

test("波浪号围栏同样保护内容", () => {
  const md = "~~~\n\\[\\[X\\]\\]\n~~~";
  assert.equal(restoreWikiLinkEscapes(md), md);
});

test("围栏用反引号开、用波浪号闭时不算闭合（CommonMark 口径：只有同种围栏字符能闭合）", () => {
  // ``` 开的围栏遇到 ~~~ 不闭合 → 围栏一直开着，里面的内容受保护不被还原
  const md = "```\n\\[\\[X\\]\\]\n~~~\n";
  assert.equal(restoreWikiLinkEscapes(md), md);
});

test("空串与不含双链的文本原样返回", () => {
  assert.equal(restoreWikiLinkEscapes(""), "");
  assert.equal(restoreWikiLinkEscapes("普通正文"), "普通正文");
});

/* ─────────────────────── normalizeEmptyTaskItems ─────────────────────── */

test("裸 `- [ ]` 补上尾空格", () => {
  assert.equal(normalizeEmptyTaskItems("- [ ]"), "- [ ] ");
});

test("`- [x]` / `- [X]` 同样要补（勾选状态也是空的）", () => {
  assert.equal(normalizeEmptyTaskItems("- [x]"), "- [x] ");
  assert.equal(normalizeEmptyTaskItems("- [X]"), "- [X] ");
});

test("有序列表的任务项也要补（`- [ ]` 那条正则同时覆盖 `1.`）", () => {
  assert.equal(normalizeEmptyTaskItems("1. [ ]"), "1. [ ] ");
});

test("其它符号开头的任务项也补（`*` `+`）", () => {
  assert.equal(normalizeEmptyTaskItems("* [ ]"), "* [ ] ");
  assert.equal(normalizeEmptyTaskItems("+ [ ]"), "+ [ ] ");
});

test("已经有内容或已经有尾空格的任务项不动（幂等）", () => {
  assert.equal(normalizeEmptyTaskItems("- [ ] 买牛奶"), "- [ ] 买牛奶");
  assert.equal(normalizeEmptyTaskItems("- [ ] "), "- [ ] ");
});

test("缩进的任务项也补", () => {
  assert.equal(normalizeEmptyTaskItems("  - [ ]"), "  - [ ] ");
});

test("围栏里的裸 `- [ ]` 不动（那是代码示例）", () => {
  const md = "```\n- [ ]\n```";
  assert.equal(normalizeEmptyTaskItems(md), md);
});

test("普通列表项不动（没有方括号就不是任务项）", () => {
  assert.equal(normalizeEmptyTaskItems("- 普通项"), "- 普通项");
});

test("正文里的 `[ ]` 不动（前面不是列表符号）", () => {
  assert.equal(normalizeEmptyTaskItems("数组 [ ] 占位"), "数组 [ ] 占位");
});

/* ─────────────────────── prepareMarkdownForWrite ─────────────────────── */

test("markdown 路径走还原", () => {
  assert.equal(
    prepareMarkdownForWrite("/notes/a.md", "\\[\\[X\\]\\]"),
    "[[X]]",
  );
  assert.equal(
    prepareMarkdownForWrite("/notes/a.markdown", "\\[\\[X\\]\\]"),
    "[[X]]",
  );
});

test("非 markdown 路径原样写出（代码/CSV 里的 \\[ 不能被改）", () => {
  assert.equal(prepareMarkdownForWrite("/notes/a.ts", "\\[\\[X\\]\\]"), "\\[\\[X\\]\\]");
  assert.equal(prepareMarkdownForWrite("/notes/a.csv", "\\[\\[X\\]\\]"), "\\[\\[X\\]\\]");
});

test("markdown 路径上只做双链还原，不动空任务项（空任务项是进编辑器前的事）", () => {
  assert.equal(prepareMarkdownForWrite("/a.md", "- [ ]"), "- [ ]");
});
