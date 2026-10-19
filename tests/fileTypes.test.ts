// src/lib/fileTypes.ts 的纯逻辑回归。
//
// Why 该测：文件类型判定决定了「点开一个文件用什么查看器、能不能编辑」。
// 判错的后果分两种：markdown 判成了别的类型 → 双击笔记打不开；
// 非 markdown 判成了 markdown → 用编辑器打开一个二进制文件，
// 存一次就把文件写坏（最严重的一类）。
// 而扩展名表是手写的、几十个条目，迟早有人加扩展名时写错一个字母。
//
// 这套口径必须与 Rust 侧对齐（src-tauri/src/commands.rs 的 is_markdown_path）：
// 前端是 .md/.markdown 都算笔记，Rust 也必须一样，否则文件树里能点开、
// 却搜不到、进不了图谱和反链（那正是 Rust 侧踩过的坑）。
//
// 跑法：node --experimental-strip-types --test tests/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { installHooks } from "./helpers/hooks.ts";

installHooks();

const { extOf, baseName, displayName, kindOf, isMarkdownPath, codeLangOf, mimeOf, isEditable, KIND_LABEL } =
  await import("../src/lib/fileTypes.ts");

/* ─────────────────────────── extOf ─────────────────────────── */

test("取扩展名并转小写", () => {
  assert.equal(extOf("a.MD"), "md");
  assert.equal(extOf("/x/y/note.Markdown"), "markdown");
  assert.equal(extOf("a.tar.gz"), "gz");
});

test("没有扩展名的文件返回空串", () => {
  assert.equal(extOf("Makefile"), "");
  assert.equal(extOf("README"), "");
});

test("点开头文件（.gitignore）算有扩展名 —— 实现按「最后一个点」取，不特判隐藏文件", () => {
  // 实测行为：`.gitignore` 的扩展名是 "gitignore"（→ binary），`.env` 是 "env"（→ code）。
  // 这里只锁住现状，不是在说它对。
  assert.equal(extOf(".gitignore"), "gitignore");
  assert.equal(extOf(".env"), "env");
});

test("目录名里的点不算扩展名（只认最后一个点且要在最后一段路径里）", () => {
  assert.equal(extOf("/a.b/c"), "");
  assert.equal(extOf("/a.b/c.md"), "md");
});

test("Windows 路径的斜杠同样处理", () => {
  assert.equal(extOf("C:\\notes\\a.MD"), "md");
});

/* ─────────────────────────── baseName / displayName ─────────────────────────── */

test("取文件名（两种斜杠都认）", () => {
  assert.equal(baseName("/a/b/note.md"), "note.md");
  assert.equal(baseName("C:\\a\\b\\note.md"), "note.md");
  assert.equal(baseName("note.md"), "note.md");
});

test("笔记显示名去掉 .md / .markdown（标签与文件树要同名，[[X]] 才匹配得到）", () => {
  assert.equal(displayName("/a/b/Getting Started.md"), "Getting Started");
  assert.equal(displayName("/a/b/Getting Started.markdown"), "Getting Started");
});

test("非笔记保留扩展名（那正是「点开用什么查看器」的线索）", () => {
  assert.equal(displayName("/a/b/pic.png"), "pic.png");
  assert.equal(displayName("/a/b/main.ts"), "main.ts");
});

/* ─────────────────────────── kindOf ─────────────────────────── */

test("markdown：.md 与 .markdown 都算（与 Rust 侧 is_markdown_path 对齐）", () => {
  assert.equal(kindOf("a.md"), "markdown");
  assert.equal(kindOf("a.markdown"), "markdown");
  assert.equal(kindOf("a.MD"), "markdown");
  assert.equal(kindOf("a.MarkDown"), "markdown");
  assert.equal(isMarkdownPath("a.md"), true);
  assert.equal(isMarkdownPath("a.markdown"), true);
});

test(".mdx 不是 markdown（不认）", () => {
  assert.equal(isMarkdownPath("a.mdx"), false);
});

test("图片 / 音视频 / 文档 / 表格各自归类", () => {
  assert.equal(kindOf("a.png"), "image");
  assert.equal(kindOf("a.svg"), "image");
  assert.equal(kindOf("a.mp4"), "video");
  assert.equal(kindOf("a.mp3"), "audio");
  assert.equal(kindOf("a.pdf"), "pdf");
  assert.equal(kindOf("a.docx"), "docx");
  assert.equal(kindOf("a.xlsx"), "xlsx");
  assert.equal(kindOf("a.csv"), "csv");
  assert.equal(kindOf("a.tsv"), "csv");
});

test("代码与文本统一归 code", () => {
  assert.equal(kindOf("a.ts"), "code");
  assert.equal(kindOf("a.rs"), "code");
  assert.equal(kindOf("a.txt"), "code");
  assert.equal(kindOf("a.json"), "code");
});

test("认不出的扩展名归 binary（不是 code，避免拿文本查看器打开二进制）", () => {
  assert.equal(kindOf("a.bin"), "binary");
  assert.equal(kindOf("Makefile"), "binary");
  assert.equal(kindOf("a"), "binary");
});

/* ─────────────────────────── codeLangOf / mimeOf ─────────────────────────── */

test("代码文件给出高亮语言", () => {
  assert.equal(codeLangOf("a.ts"), "typescript");
  assert.equal(codeLangOf("a.rs"), "rust");
  assert.equal(codeLangOf("a.py"), "python");
});

test("认不出的语言退化成 plaintext（高亮器不能瞎猜）", () => {
  assert.equal(codeLangOf("a.unknown"), "plaintext");
});

test("mime 推断：图片 / 音视频 / 文档", () => {
  assert.equal(mimeOf("a.png"), "image/png");
  assert.equal(mimeOf("a.jpg"), "image/jpeg");
  assert.equal(mimeOf("a.pdf"), "application/pdf");
  assert.equal(mimeOf("a.mp4"), "video/mp4");
  assert.equal(mimeOf("a.mp3"), "audio/mpeg");
});

test("认不出的 mime 归 application/octet-stream", () => {
  assert.equal(mimeOf("a.unknown"), "application/octet-stream");
});

/* ─────────────────────────── isEditable / KIND_LABEL ─────────────────────────── */

test("只有 markdown 可编辑（其它一律只读）", () => {
  assert.equal(isEditable("markdown"), true);
  assert.equal(isEditable("code"), false);
  assert.equal(isEditable("binary"), false);
});

test("每种类型都有中文标签（状态栏/文件树要用）", () => {
  for (const kind of Object.keys(KIND_LABEL)) {
    assert.ok(KIND_LABEL[kind as keyof typeof KIND_LABEL], `${kind} 缺标签`);
  }
  assert.equal(KIND_LABEL.markdown, "Markdown");
});
