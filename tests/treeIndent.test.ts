// src/lib/treeIndent.ts 的回归。
//
// Why 该测（2026-11-04 实测踩到）：侧边栏文件树原先用
// `12 + depth * 16` 的线性缩进。侧边栏 280px 宽时，
// depth 12 的节点光缩进就吃掉 204px，剩下的宽度放不下文件名，
// 行内 overflow:hidden 一裁 —— 深层目录只剩一个文件夹图标，名字全没了。
//
// 这个坑必须用测试钉住：缩进一旦回退成线性累加，
// 用户看到的还是「层太深都看不到」，但没有任何报错提示。
//
// 跑法：node --experimental-strip-types --test tests/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { installHooks } from "./helpers/hooks.ts";

installHooks();

const { treeIndent, TREE_INDENT_MAX, TREE_INDENT_SOFT_FROM } = await import(
  "../src/lib/treeIndent.ts"
);

test("前几层按正常步长缩进（层级关系清晰可辨）", () => {
  assert.equal(treeIndent(0), 12);
  assert.equal(treeIndent(1), 28);
  assert.equal(treeIndent(2), 44);
  assert.equal(treeIndent(3), 60);
  assert.equal(treeIndent(TREE_INDENT_SOFT_FROM), 12 + 16 * 4);
});

test("深层缩进被压缩，不再线性累加", () => {
  // 压缩区的步长必须明显小于正常步长
  const stepNormal = treeIndent(2) - treeIndent(1);
  const stepDeep = treeIndent(10) - treeIndent(9);
  assert.ok(
    stepDeep < stepNormal,
    `深层步长 ${stepDeep} 应小于正常步长 ${stepNormal}`
  );
});

test("缩进总量封顶，深层也留得出文件名空间", () => {
  // 关键断言：深度 30 的缩进不能超过封顶值 ——
  // 这保证「名字可见宽度」有下限，不会再出现只剩图标的情况
  assert.equal(treeIndent(30), TREE_INDENT_MAX);
  assert.equal(treeIndent(100), TREE_INDENT_MAX);
  assert.ok(
    TREE_INDENT_MAX <= 112,
    `缩进封顶 ${TREE_INDENT_MAX} 偏大，280px 宽的侧边栏放不下文件名`
  );
});

test("缩进单调不减（不会出现层级越深反而靠左）", () => {
  let prev = treeIndent(0);
  for (let d = 1; d <= 40; d++) {
    const cur = treeIndent(d);
    assert.ok(cur >= prev, `depth ${d} 的缩进 ${cur} < 上一层的 ${prev}`);
    prev = cur;
  }
});

test("侧边栏 280px 时，最深一层的缩进后仍留得下文件名", () => {
  const SIDEBAR_WIDTH = 280;
  const indent = treeIndent(30);
  // 文件名至少要能显示 7 个中文字（13px/字 ⇒ 91px）
  const MIN_NAME_SPACE = 91;  // 图标 + peek 按钮 + padding 的开销
  const overhead = 70;
  const available = SIDEBAR_WIDTH - indent - overhead;
  assert.ok(
    available >= MIN_NAME_SPACE,
    `深度 30 时只剩 ${available}px 给文件名，少于 ${MIN_NAME_SPACE}px`
  );
});
