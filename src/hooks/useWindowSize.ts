import { useEffect, useState } from 'react';
import { sidebarMaxWidth } from '../lib/panelWidth';

export { sidebarMaxWidth };

/**
 * 跟踪窗口内容区宽度。
 *
 * 用途：侧边栏 / 右侧面板的可拖拽上限需要跟着窗口走。
 *
 * 背景（2026-11-04 修）：原先 Resizer 的 max 是写死的 480px，
 * 而 note 窗口默认宽度只有 900px —— 480 已经接近「最多能占一半」，
 * 用户想拖宽看深层目录时怎么拖都顶到天花板，看起来像"拖不动"。
 * 现在上限改成「窗口宽度的 70%，且不超过 900px」，
 * 窗口越大能拖得越宽，窗口小的时候也不会挤掉编辑区。
 *
 * 注意用 innerWidth 而不是 outerWidth：outerWidth 含窗口边框/阴影，
 * 会比实际内容区宽出十几像素，导致侧边栏实际比设定值宽。
 */
export function useWindowWidth(): number {
  const [width, setWidth] = useState<number>(() =>
    typeof window === 'undefined' ? 1200 : window.innerWidth
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let raf = 0;
    const onResize = () => {
      // 拖窗口边缘时会连续触发 resize，用 rAF 合并成每帧一次
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setWidth(window.innerWidth));
    };

    window.addEventListener('resize', onResize);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return width;
}
