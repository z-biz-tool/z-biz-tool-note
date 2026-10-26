// src/lib/noteResolve.ts 的回归。
//
// Why 该测（2026-10-25 实测出来的真 bug）：
//   `[[双链]]` 在**当前笔记库的文件清单**里按名字找文件；
//   `![[嵌入]]` 却调后端 `read_note` ⇒ 读的是**上一代架构**的
//   `~/.z-note/notes/{name}.md` ⇒ **嵌入永远显示「找不到这篇笔记」**，
//   而双链却能跳 —— 同一对孪生功能，两套解析。
//
//   ⇒ 修法是把「笔记名 → 文件路径」收成**一条真源**（本模块），
//     双链与嵌入都用它。本测试钉住这条真源的**匹配口径**：
//     口径一改，两个功能的解析就会同时变 ⇒ 必须显式改这里，不能默默漂移。
//
// 跑法：node --experimental-strip-types --test tests/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

const { resolveNotePath, normalizeNoteTarget } = await import("../src/lib/noteResolve.ts");

const FILES = [
  { name: "Code", path: "/vault/Code.md" },
  { name: "Note", path: "/vault/sub/Note.md" },
  { name: "Deep", path: "/vault/Deep.markdown" },
];

test("按清单里的名字命中", () => {
  assert.equal(resolveNotePath(FILES, "Code"), "/vault/Code.md");
});

test("同名文件在不同子目录 ⇒ 按路径后缀命中", () => {
  assert.equal(resolveNotePath(FILES, "Note"), "/vault/sub/Note.md");
});

test(".markdown 扩展名也算", () => {
  assert.equal(resolveNotePath(FILES, "Deep"), "/vault/Deep.markdown");
});

test("带 #锚点 / |别名 的引用先归一化再找", () => {
  assert.equal(resolveNotePath(FILES, "Code#第2节"), "/vault/Code.md");
  assert.equal(resolveNotePath(FILES, "Code|别名"), "/vault/Code.md");
});

test("找不到就是 null（不猜）", () => {
  assert.equal(resolveNotePath(FILES, "不存在"), null);
  assert.equal(resolveNotePath(FILES, ""), null);
  assert.equal(resolveNotePath([], "Code"), null);
});

test("归一化：锚点与别名都砍掉", () => {
  assert.equal(normalizeNoteTarget("目标#锚点|别名"), "目标");
  assert.equal(normalizeNoteTarget("  目标  "), "目标");
  assert.equal(normalizeNoteTarget(""), "");
});

/**
 * 反向钉：**双链与嵌入必须走同一条真源**。
 *
 * Why：这两个功能历史上分过家（一个查笔记库、一个查 ~/.z-note/notes）。
 * 纯函数测试盯不住"谁在调用它" ⇒ 这里静态核对源码里**没有**残留的
 * `read-note` 调用 —— 那是废弃存储的入口，一旦回来，嵌入又会解析错地方。
 */
test("嵌入不再走后端 read_note（废弃存储的入口）", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");
  const here = fileURLToPath(new URL(".", import.meta.url));
  const embedSrc = readFileSync(
    path.resolve(here, "../src/lib/EmbedExtension.tsx"),
    "utf8",
  );
  assert.ok(
    !/invoke\(\s*['"]read-note['"]/.test(embedSrc),
    "嵌入块又调回 read-note 了（那是上一代架构的 ~/.z-note/notes）",
  );
  assert.ok(
    /resolvePath/.test(embedSrc),
    "嵌入块应当用共享解析器 resolvePath",
  );
});
