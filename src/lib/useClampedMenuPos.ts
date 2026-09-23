import { useLayoutEffect, useRef, useState } from 'react';

/**
 * 把浮层钉在视口内。
 *
 * Why: 右键菜单原先直接钉在点击坐标上，在列表底部/标签栏右侧右键时半截菜单掉到窗口外，
 * 里面的项一个都点不到。菜单尺寸只有渲染后才知道（「移到文件夹」子菜单展开还会再长高），
 * 所以量实测宽高往回挪，而不是让调用方去猜。
 *
 * 算法用的是"从定位父元素的视口原点换算"，而不是"在上次结果上再补一点"：
 * 这样同一个实例被复用到新坐标、或内容长高后重算，结果都只取决于当前输入，不会越挪越偏。
 *
 * @param x,y 期望位置，相对于浮层的定位父元素
 * @param key 内容变化标记（如子菜单展开、条数变化）：变了才需要重新量一次
 */
export function useClampedMenuPos<T extends HTMLElement>(x: number, y: number, key: unknown = 0) {
  const ref = useRef<T>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // offsetParent 为空说明没有定位祖先，此时绝对定位就以视口（初始块）为原点
    const parent = el.offsetParent as HTMLElement | null;
    const origin = parent ? parent.getBoundingClientRect() : { left: 0, top: 0 };
    const edge = 8;
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    let left = origin.left + x;
    let top = origin.top + y;
    if (left + el.offsetWidth > viewW - edge) left = viewW - edge - el.offsetWidth;
    if (top + el.offsetHeight > viewH - edge) top = viewH - edge - el.offsetHeight;
    // 菜单本身比视口还高时贴着上边，至少前几项能点到
    left = Math.max(edge, left);
    top = Math.max(edge, top);
    const next = { left: left - origin.left, top: top - origin.top };
    setPos(p => (p.left === next.left && p.top === next.top ? p : next));
  }, [x, y, key]);

  return { ref, pos };
}
