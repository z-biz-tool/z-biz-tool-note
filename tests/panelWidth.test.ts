// src/lib/panelWidth.ts 的回归。
//
// Why 该测（2026-11-04 实测踩到）：侧边栏 Resizer 的 max 原先写死 480px，
// 而 note 窗口默认宽 900px —— 480 已接近「最多占一半」，
// 用户往右拖想看深层目录时怎么拖都顶到天花板，看起来像"拖不动"。
//
// 上限必须是「窗口的函数」而不是常量，否则窗口放大后仍然拖不宽。
//
// 跑法：node --experimental-strip-types --test tests/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { installHooks } from "./helpers/hooks.ts";

installHooks();

const { sidebarMaxWidth, PANEL_WIDTH_ABSOLUTE_MAX } = await import(
  "../src/lib/panelWidth.ts"
);

test("默认窗口宽度下，上限明显大于旧的写死值 480", () => {
  // 窗口默认 900px ⇒ 上限应为 630px，比旧的 480 宽出 150px
  const max = sidebarMaxWidth(900);
  assert.ok(max > 480, `900px 窗口的上限只有 ${max}px，没比旧的 480 宽`);
  assert.equal(max, 630);
});

test("上限随窗口宽度单调递增", () => {
  let prev = sidebarMaxWidth(400);
  for (const w of [600, 900, 1200, 1600, 2000]) {
    const cur = sidebarMaxWidth(w);
    assert.ok(cur >= prev, `${w}px 窗口的上限 ${cur} < ${w - 200}px 的 ${prev}`);
    prev = cur;
  }
});

test("上限有绝对封顶，不会无限增长", () => {
  assert.equal(sidebarMaxWidth(4000), PANEL_WIDTH_ABSOLUTE_MAX);
  assert.equal(sidebarMaxWidth(100000), PANEL_WIDTH_ABSOLUTE_MAX);
});

test("小窗口下保底 320px，不会算出无意义的负数", () => {
  assert.equal(sidebarMaxWidth(100), 320);
  assert.equal(sidebarMaxWidth(0), 320);
  assert.equal(sidebarMaxWidth(-50), 320);
  assert.equal(sidebarMaxWidth(NaN), 320);
});

test("上限不会吃掉整个窗口（给编辑区留得下空间）", () => {
  for (const w of [400, 900, 1400, 1920]) {
    const max = sidebarMaxWidth(w);
    assert.ok(max < w, `${w}px 窗口里侧边栏上限 ${max} 不该 ≥ 窗口宽`);
  }
});
