// src/lib/tagTree.ts 的回归。
//
// Why 该测：标签规模可能上万（实测工作区根目录 10169 篇笔记 ⇒ 标签同量级）。
// 「点标签右侧白屏」的成因之一就是整棵标签树一次性铺成 DOM。
// 渲染预算（MAX_VISIBLE_TAGS）必须是**有牙齿**的判据：
// 测「预算耗尽后确实停止遍历」而不是靠肉眼看 DOM 节点数。
//
// 另外过滤框是「上限之外的标签唯一的出路」——
// 如果过滤坏了，那些标签就永远够不着 ⇒ 必须测。
//
// 跑法：node --experimental-strip-types --test tests/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { installHooks } from "./helpers/hooks.ts";

installHooks();

const {
  MAX_VISIBLE_TAGS,
  buildTagTree,
  countVisibleRows,
  filterTags,
  flattenTagRows,
  isNodeActive,
} = await import("../src/lib/tagTree.ts");

function tag(name: string, noteCount = 1) {
  return {
    name,
    count: noteCount,
    notes: Array.from({ length: noteCount }, (_, i) => `/notes/${name}-${i}.md`),
  };
}

test("空过滤词原样返回（不复制）", () => {
  const tags = [tag("work"), tag("life")];
  const out = filterTags(tags, "");
  assert.equal(out, tags, "空词应原样返回同一个数组引用");
  const out2 = filterTags(tags, "   ");
  assert.equal(out2, tags, "纯空格也视为空");
});

test("过滤按标签名的子串匹配，大小写不敏感", () => {
  const tags = [tag("work/project-a"), tag("life"), tag("Work/Project-B")];
  const out = filterTags(tags, "project");
  assert.deepEqual(out.map(t => t.name), ["work/project-a", "Work/Project-B"]);

  const upper = filterTags(tags, "WORK");
  assert.deepEqual(upper.map(t => t.name), ["work/project-a", "Work/Project-B"]);
});

test("过滤命中的是完整路径里的任意一段，不只是叶子", () => {
  const tags = [tag("work/project-a")];
  // 搜 "work" 要能命中 —— 用户心智是搜路径前缀
  assert.equal(filterTags(tags, "work").length, 1);
});

test("建树：按 / 拆层级，父节点的 count 含后代（去重）", () => {
  const tree = buildTagTree([tag("work/a", 2), tag("work/b", 3)]);
  const work = tree.children.get("work")!;
  assert.ok(work, "应有 work 这一层");
  assert.equal(work.children.size, 2);
  // 父标签 work 自己没有笔记，但 count 应是子标签笔记去重总数
  assert.equal(work.aggregatedCount, 5);
  assert.equal(work.children.get("a")!.aggregatedCount, 2);
  assert.equal(work.children.get("b")!.aggregatedCount, 3);
});

test("聚合 count 去重：同一篇笔记同时挂两个子标签，父标签只算一次", () => {
  const shared = "/notes/same.md";
  const tree = buildTagTree([
    { name: "work/a", count: 1, notes: [shared] },
    { name: "work/b", count: 1, notes: [shared] },
  ]);
  const work = tree.children.get("work")!;
  assert.equal(work.aggregatedCount, 1, "同一篇笔记在父标签下只能算一次");
});

test("渲染预算：行数不超过上限", () => {
  const tags = Array.from({ length: 1000 }, (_, i) => tag(`tag-${i}`));
  const tree = buildTagTree(tags);
  const rows = flattenTagRows(tree, new Set(), MAX_VISIBLE_TAGS);
  assert.equal(rows.length, MAX_VISIBLE_TAGS, "应恰好铺满预算");
});

test("渲染预算：超大标签集也不会溢出（万级）", () => {
  const tags = Array.from({ length: 12000 }, (_, i) => tag(`tag-${i}`));
  const tree = buildTagTree(tags);
  const rows = flattenTagRows(tree, new Set(), MAX_VISIBLE_TAGS);
  assert.equal(rows.length, MAX_VISIBLE_TAGS);
  // 关键：预算耗尽后**不能**继续把剩余标签也铺出来
  assert.ok(rows.length < 12000, "不能把一万个全铺了");
});

test("Infinity 预算 ⇒ 铺全部可见行（「显示全部」模式）", () => {
  const tags = Array.from({ length: 500 }, (_, i) => tag(`tag-${i}`));
  const tree = buildTagTree(tags);
  const rows = flattenTagRows(tree, new Set(), Infinity);
  assert.equal(rows.length, 500);
});

test("折叠的子树不进渲染行（也不占预算）", () => {
  const tree = buildTagTree([tag("work/a"), tag("work/b"), tag("life/c")]);
  const collapsed = new Set(["work"]);
  const rows = flattenTagRows(tree, collapsed, MAX_VISIBLE_TAGS);
  const paths = rows.map(r => r.node.fullPath);
  // 排序用 zh-CN localeCompare ⇒ life 在 work 前。
  // fullPath 是**完整路径**（work/a 而非 a）—— 层级节点的 fullPath 天然是全路径。
  assert.deepEqual(paths, ["life", "life/c", "work"], "work 折叠 ⇒ 只有它自己一行 + 顶层其它");
});

test("countVisibleRows 与折叠状态一致", () => {
  const tree = buildTagTree([tag("work/a"), tag("work/b"), tag("life/c")]);
  // 展开：work, work/a, work/b, life, life/c = 5 行
  assert.equal(countVisibleRows(tree, new Set()), 5);
  // 折叠 work：work, life, life/c = 3 行
  assert.equal(countVisibleRows(tree, new Set(["work"])), 3);
});

test("countVisibleRows 数的是**行**不是标签数（带深度展开）", () => {
  // work/a/x, work/a/y, work/b ⇒ 可见行：work, a, x, y, b = 5
  const tree = buildTagTree([tag("work/a/x"), tag("work/a/y"), tag("work/b")]);
  assert.equal(countVisibleRows(tree, new Set()), 5);
});

test("激活态：自身命中 + 后代命中（父节点应高亮）", () => {
  const tree = buildTagTree([tag("work/a"), tag("life/c")]);
  const work = tree.children.get("work")!;
  const life = tree.children.get("life")!;

  assert.equal(isNodeActive(work, "work"), true);
  assert.equal(isNodeActive(work, "work/a"), true, "选中子标签时父标签也应高亮");
  assert.equal(isNodeActive(life, "work"), false);
  assert.equal(isNodeActive(work, null), false);
  assert.equal(isNodeActive(work, undefined), false);
});

test("激活态：前缀相同但不是后代的不算命中", () => {
  // "work" 与 "workflow" 不是父子关系
  const tree = buildTagTree([tag("work"), tag("workflow")]);
  const work = tree.children.get("work")!;
  assert.equal(isNodeActive(work, "workflow"), false, "workflow 不是 work 的后代");
});

test("过滤 + 预算组合：过滤后的结果仍受预算约束，且保留深路径命中", () => {
  const tags = [
    tag("work/project-alpha"),
    ...Array.from({ length: 1000 }, (_, i) => tag(`other-${i}`)),
  ];
  const filtered = filterTags(tags, "alpha");
  assert.equal(filtered.length, 1);
  const tree = buildTagTree(filtered);
  const rows = flattenTagRows(tree, new Set(), MAX_VISIBLE_TAGS);
  assert.deepEqual(rows.map(r => r.node.fullPath), ["work", "work/project-alpha"]);
});
