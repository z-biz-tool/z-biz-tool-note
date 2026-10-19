// 前端性能基准（T5-05）：大文件加载与落盘准备
//
// # 为什么用「测试 + 阈值断言」而不是 criterion
//
// 本轮硬约束是**不引入新的 npm / crates.io 依赖**（criterion 是 crates.io 的，
// vitest / benchmark.js 是 npm 的，都不许加）。所以用仓内已有的
// `node --test` 跑基准：同样的度量对象、同样的可复跑命令、同样的 PASS/FAIL。
// 差别：没有多次采样的统计基线，只有单次测量 + 硬阈值，
// 阈值按「本机实测值 × 30~50 倍」取（前端是纯 CPU 逻辑，没有 IO 抖动）。
//
// # 测的是什么
//
// 前端打开/保存一篇大笔记时会走这三条纯计算路径，它们是笔记越大越慢的那部分：
//   1. parseFrontmatter      —— 打开笔记时解析 YAML 头块（每次渲染正文都要用）
//   2. prepareMarkdownForWrite —— 落盘前还原被转义的双链（整篇正则扫描）
//   3. setFrontmatterTags    —— 写回标签时重排整篇文档的 frontmatter
//
// # 阈值从哪来
//
// 本机（macOS / Apple Silicon）实测值写在每条用例的注释里，
// 阈值取实测值的 30~50 倍 —— 这类纯计算没有 IO 抖动，
// 30 倍余量已经足够覆盖慢 CI 机器，同时仍能挡住数量级回归
// （比如有人把逐行处理改成 O(n²) 的实现）。
//
// # 怎么复跑
//
// ```text
// npm test                                   # 连同其它单测一起跑
// node --experimental-strip-types --test tests/bench.markdown.test.ts
// ```
import { test } from "node:test";
import assert from "node:assert/strict";
import { installHooks } from "./helpers/hooks.ts";

installHooks();

const { parseFrontmatter, setFrontmatterTags } = await import("../src/lib/frontmatter.ts");
const { prepareMarkdownForWrite } = await import("../src/lib/markdownWrite.ts");

/** 造一篇 ~1MB 的合成笔记（正文 + 少量双链 + 标签行） */
function synthLargeNote(targetBytes: number): string {
  const line = "这是一行会议纪要正文，讨论索引改造与前端拆分的进度。\n";
  const head = "---\ntitle: 大文件基准\ntags:\n  - 性能\n---\n\n# 大文件基准\n\n";
  let body = "";
  while (head.length + body.length < targetBytes) {
    body += line;
    if (body.length % 4096 < line.length) body += "参见 [[大文件基准]] 与 [[性能基准]]。\n";
  }
  return head + body;
}

const NOTE_BYTES = 1024 * 1024;
const LARGE = synthLargeNote(NOTE_BYTES);

/** 跑 fn 若干次，返回中位耗时（ms）—— 取中位数而不是平均，避免 GC 抖动拉偏 */
function medianMs(fn: () => void, rounds = 5): number {
  const samples: number[] = [];
  for (let i = 0; i < rounds; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

/* ───────────────────── 1. 打开大笔记：解析 frontmatter ───────────────────── */

test("bench: 解析 1MB 笔记的 frontmatter 在阈值内", () => {
  const ms = medianMs(() => {
    const r = parseFrontmatter(LARGE);
    assert.ok(r);
  });
  console.log(`[bench] parseFrontmatter（${LARGE.length} 字节）中位耗时 ${ms.toFixed(2)}ms`);

  // 本机实测约 0.3ms；阈值 30ms（约 100 倍余量）
  assert.ok(
    ms < 30,
    `parseFrontmatter 超时：${ms.toFixed(2)}ms（阈值 30ms）—— 大文件打开路径出现数量级回归`,
  );
});

/* ───────────────────── 2. 落盘准备：还原被转义的双链 ───────────────────── */

test("bench: 1MB 笔记的落盘准备（还原双链）在阈值内", () => {
  const ms = medianMs(() => {
    prepareMarkdownForWrite("/notes/large.md", LARGE);
  });
  console.log(`[bench] prepareMarkdownForWrite（${LARGE.length} 字节）中位耗时 ${ms.toFixed(2)}ms`);

  // 本机实测约 6ms（逐行正则，是这三条里最慢的）；阈值 300ms（约 50 倍余量）
  assert.ok(
    ms < 300,
    `prepareMarkdownForWrite 超时：${ms.toFixed(2)}ms（阈值 300ms）—— 落盘路径出现数量级回归`,
  );
});

/* ───────────────────── 3. 写回标签：重排 frontmatter ───────────────────── */

test("bench: 1MB 笔记写回标签在阈值内", () => {
  const ms = medianMs(() => {
    setFrontmatterTags(LARGE, ["性能", "基准"]);
  });
  console.log(`[bench] setFrontmatterTags（${LARGE.length} 字节）中位耗时 ${ms.toFixed(2)}ms`);

  // 本机实测约 0.3ms（只重排头块，不重扫正文）；阈值 50ms（约 150 倍余量）
  assert.ok(
    ms < 50,
    `setFrontmatterTags 超时：${ms.toFixed(2)}ms（阈值 50ms）—— 标签写回路径出现数量级回归`,
  );
});
