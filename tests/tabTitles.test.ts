// src/lib/tabTitles.ts 的回归。
//
// Why 该测：同名笔记（两篇都叫 Code）在标签栏里必须能分清。
// 这里的"分清"不是加后缀就完事 —— 它只改**显示用的名字**，
// 绝不能动 tab.title（那是搜索/双链匹配用的名字，
// 被后缀污染就再也对不上 [[Code]] 了）。
// 一旦把 title 也改了，双链会静默失效 —— 很难定位。
//
// 跑法：node --experimental-strip-types --test tests/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { installHooks } from "./helpers/hooks.ts";

installHooks();

const { disambiguateTabTitles } = await import("../src/lib/tabTitles.ts");

test("没有重名时原样返回", () => {
  const out = disambiguateTabTitles([
    { title: "Code", filePath: "/a/Code.md" },
    { title: "Notes", filePath: "/a/Notes.md" },
  ]);
  assert.deepEqual(out, ["Code", "Notes"]);
});

test("同名时逐级往上补目录段", () => {
  const out = disambiguateTabTitles([
    { title: "Code", filePath: "/lib/Code.md" },
    { title: "Code", filePath: "/demo/Code.md" },
  ]);
  assert.deepEqual(out, ["Code · lib", "Code · demo"]);
});

test("同目录里还同名时再往上补一级", () => {
  const out = disambiguateTabTitles([
    { title: "Code", filePath: "/x/Examples/Code.md" },
    { title: "Code", filePath: "/y/Examples/Code.md" },
  ]);
  assert.deepEqual(out, ["Code · x/Examples", "Code · y/Examples"]);
});

test("补到最外层仍分不开时保留同名（不能编出一个不存在的名字）", () => {
  const out = disambiguateTabTitles([
    { title: "Code", filePath: "/Code.md" },
    { title: "Code", filePath: "/Code.md" },
  ]);
  assert.equal(out.length, 2);
  assert.ok(out[0].startsWith("Code"));
});

test("空标题按「未命名」处理", () => {
  const out = disambiguateTabTitles([
    { title: "", filePath: "/a/x.md" },
    { title: "", filePath: "/b/x.md" },
  ]);
  assert.equal(out.length, 2);
  assert.ok(out[0].startsWith("未命名"));
});

test("只有文件路径没有标题的条目也能参与判重", () => {
  const out = disambiguateTabTitles([
    { title: "", filePath: "/a/x.md" },
    { title: "", filePath: "/b/x.md" },
  ]);
  assert.notDeepEqual(out[0], out[1], "同名同空标题的应该被区分开");
});

test("返回长度与输入一致（不能少返回或多返回）", () => {
  const items = [
    { title: "A", filePath: "/1/A.md" },
    { title: "A", filePath: "/2/A.md" },
    { title: "B", filePath: "/3/B.md" },
  ];
  assert.equal(disambiguateTabTitles(items).length, items.length);
});

test("不改动传入的 title（双链匹配靠的是原名）", () => {
  const items = [
    { title: "Code", filePath: "/a/Code.md" },
    { title: "Code", filePath: "/b/Code.md" },
  ];
  disambiguateTabTitles(items);
  assert.equal(items[0].title, "Code");
  assert.equal(items[1].title, "Code");
});

test("空数组返回空数组", () => {
  assert.deepEqual(disambiguateTabTitles([]), []);
});
