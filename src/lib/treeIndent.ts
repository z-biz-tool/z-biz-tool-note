/**
 * 文件树节点的缩进量计算。
 *
 * 背景（2026-11-04 修）：原先缩进是 `12 + depth * 16` 的线性累加。
 * 侧边栏宽 280px 时，depth 12 的节点光缩进就吃掉 204px，
 * 剩下的空间放不下文件名 —— 行内 `overflow: hidden` 一裁，
 * 深层目录就变成截图里那样「只剩一个文件夹图标，名字全没了」。
 *
 * 改成压缩式：前几层照常给足 16px（有空间就大方缩进），
 * 超过阈值后每层只加 6px，并封顶。这样 depth 再深，
 * 留给文件名的空间也有下限，层级关系还在、名字看得见。
 *
 * 单独拆成 lib 文件而不是留在 Sidebar.tsx 里：
 * Sidebar.tsx 是 .tsx、带 React 依赖，node --test 直接 import 会炸；
 * 拆出来才能被 tests/ 下的用例覆盖（缩进一旦回退成线性累加，
 * 深层目录又看不见名字 —— 这个坑得用测试钉住）。
 *
 * 层级本身不靠缩进单独表达 —— 文件夹箭头（ChevronDown/ChevronRight）
 * 和 peek 预览按钮都在，缩进只是辅助线索。
 */

/** 基础缩进：对应树根一级 */
const BASE = 12;
/** 前若干层用正常步长 */
const FULL_STEP = 16;
/** 超过阈值后每层只加一点 */
const SOFT_STEP = 6;
/** 从第几层开始进入压缩区 */
const SOFT_FROM = 4;
/**
 * 缩进总量封顶。
 *
 * 数值来源（别随手改，改了会重新吃掉文件名空间）：
 * 默认侧边栏 280px，减去图标+箭头+peek按钮+padding 的开销约 70px，
 * 还要给文件名留 ≥ 98px（≈7 个中文字）。
 * ⇒ 封顶 = 280 - 70 - 98 = 112。
 *
 * 12 + 16*4 + 6*6 = 112 ⇒ 压缩区最多再撑 6 层就封顶。
 */
const MAX_TOTAL = BASE + FULL_STEP * SOFT_FROM + SOFT_STEP * 6;

export function treeIndent(depth: number): number {
  if (depth <= SOFT_FROM) return BASE + depth * FULL_STEP;
  const softDepth = depth - SOFT_FROM;
  return Math.min(MAX_TOTAL, BASE + FULL_STEP * SOFT_FROM + softDepth * SOFT_STEP);
}

/** 缩进的硬上限，测试用 */
export const TREE_INDENT_MAX = MAX_TOTAL;
/** 进入压缩区的起始深度，测试用 */
export const TREE_INDENT_SOFT_FROM = SOFT_FROM;
