/**
 * 侧边栏 / 右侧面板的宽度上限计算（纯函数，便于测试）。
 *
 * 背景（2026-11-04 修）：原先 Resizer 的 max 是写死的 480px，
 * 而 note 窗口默认宽度只有 900px —— 480 已经接近「最多能占一半」，
 * 用户往右拖想看深层目录时怎么拖都顶到天花板，看起来像"拖不动"。
 *
 * 改成跟着窗口走：上限 = 窗口宽的 70%，封顶 900px。
 * 窗口越大能拖得越宽；窗口小的时候也不会挤掉编辑区。
 */

/** 面板宽度占窗口宽度的最大比例 */
const MAX_RATIO = 0.7;
/** 上限绝对封顶（再宽也没意义） */
const ABSOLUTE_MAX = 900;
/** 上限绝对下限（窗口很小时也不至于没有可用宽度） */
const ABSOLUTE_MIN = 320;

export function sidebarMaxWidth(windowWidth: number): number {
  if (!Number.isFinite(windowWidth) || windowWidth <= 0) return ABSOLUTE_MIN;
  return Math.max(ABSOLUTE_MIN, Math.min(ABSOLUTE_MAX, Math.round(windowWidth * MAX_RATIO)));
}

/** 面板宽度绝对上限，测试用 */
export const PANEL_WIDTH_ABSOLUTE_MAX = ABSOLUTE_MAX;
