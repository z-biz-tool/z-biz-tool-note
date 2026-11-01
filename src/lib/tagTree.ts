// 标签树：过滤、建树、渲染预算。
//
// Why 该抽成纯函数：标签规模可能上万（实测工作区根目录 10169 篇笔记 ⇒ 标签同量级），
// 「点标签右侧白屏」的成因之一就是整棵标签树一次性铺成 DOM。
// 渲染预算（MAX_VISIBLE_TAGS）必须是**有牙齿**的判据：
// 抽成纯函数才能测「预算耗尽后确实停止遍历」，而不是靠肉眼看 DOM 节点数。
//
// 跑法：node --experimental-strip-types --test tests/*.test.ts
import type { Tag } from '../types';

/** 标签树节点：构建 work/project-a / work/project-b 这样的层级 */
export interface TagTreeNode {
  name: string;            // 当前段名称，例如 project-a
  fullPath: string;        // 完整路径，例如 work/project-a
  ownNotes: string[];      // 自身笔记路径
  children: Map<string, TagTreeNode>;
  aggregatedCount: number; // 自身 + 所有后代笔记的去重数量
}

/**
 * 一次最多渲染多少个标签行。
 *
 * Why: 全铺成 DOM 时，光布局就要几百 ms；点标签时父组件 setState
 * ⇒ 浏览器重排上万个节点 ⇒ 主线程占满 ⇒ 白屏。
 *
 * 注意：这只是**渲染**上限，不是数据上限 —— 上限之外的标签仍在过滤框里搜得到，
 * 不会出现「后面的标签永远够不着」的死角。
 */
export const MAX_VISIBLE_TAGS = 300;

/**
 * 按过滤词筛标签（大小写不敏感的子串匹配）。
 *
 * 空词 ⇒ 原样返回（不复制数组）。
 */
export function filterTags(tags: Tag[], query: string): Tag[] {
  const q = query.trim().toLowerCase();
  if (!q) return tags;
  return tags.filter(t => t.name.toLowerCase().includes(q));
}

/**
 * 把扁平 tag 列表构建为树，并预计算聚合 count。
 *
 * Why 后序遍历算 count：父标签的 count 要含所有后代（去重），
 * 否则点父标签看到的篇数比实际少。
 */
export function buildTagTree(tags: Tag[]): TagTreeNode {
  const root: TagTreeNode = {
    name: '',
    fullPath: '',
    ownNotes: [],
    children: new Map(),
    aggregatedCount: 0,
  };

  for (const t of tags) {
    const segments = t.name.split('/').filter(Boolean);
    let node = root;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const isLast = i === segments.length - 1;
      if (!node.children.has(seg)) {
        node.children.set(seg, {
          name: seg,
          fullPath: segments.slice(0, i + 1).join('/'),
          ownNotes: [],
          children: new Map(),
          aggregatedCount: 0,
        });
      }
      node = node.children.get(seg)!;
      if (isLast) {
        node.ownNotes = t.notes;
      }
    }
  }

  const compute = (n: TagTreeNode): Set<string> => {
    const noteSet = new Set<string>(n.ownNotes);
    n.children.forEach(c => {
      compute(c).forEach(p => noteSet.add(p));
    });
    n.aggregatedCount = noteSet.size;
    return noteSet;
  };
  compute(root);

  return root;
}

/** 子节点按名称排序（中文用 zh-CN 排序规则）。 */
export function sortedChildren(node: TagTreeNode): TagTreeNode[] {
  return Array.from(node.children.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'zh-CN')
  );
}

/**
 * 可见行数（尊重折叠状态）。
 *
 * Why: 「显示全部 N 行」里那个 N 要是真实行数，不能是标签总数 ——
 * 折叠起来的子树不占行，用户看到的行数远少于标签数。
 */
export function countVisibleRows(
  node: TagTreeNode,
  collapsed: ReadonlySet<string>
): number {
  let total = 0;
  for (const child of node.children.values()) {
    total += 1;
    if (!collapsed.has(child.fullPath)) {
      total += countVisibleRows(child, collapsed);
    }
  }
  return total;
}

/**
 * 按渲染预算摊平出「要渲染的行」。
 *
 * Why 用摊平而不是直接返回 JSX：预算耗尽后要**停止遍历**，
 * 而不是继续 map 出成千上万个 null —— 那点 null 也要花时间构造和 diff。
 *
 * 折叠的节点只出它自己这一行（子树不进预算）。
 */
export interface TagRenderRow {
  node: TagTreeNode;
  depth: number;
}

/**
 * 摊平可见行，受 maxRows 预算约束。
 *
 * maxRows = Infinity 时返回全部可见行（「显示全部」模式）。
 */
export function flattenTagRows(
  root: TagTreeNode,
  collapsed: ReadonlySet<string>,
  maxRows: number
): TagRenderRow[] {
  const rows: TagRenderRow[] = [];
  let budget = maxRows;

  const walk = (node: TagTreeNode, depth: number) => {
    for (const child of sortedChildren(node)) {
      if (budget <= 0) return;
      budget -= 1;
      rows.push({ node: child, depth });
      if (child.children.size > 0 && !collapsed.has(child.fullPath)) {
        walk(child, depth + 1);
      }
    }
  };
  walk(root, 0);
  return rows;
}

/**
 * 判断某个节点是否处于激活状态（自身或任意后代被选中）。
 */
export function isNodeActive(node: TagTreeNode, activeTag?: string | null): boolean {
  if (!activeTag) return false;
  if (node.fullPath === activeTag) return true;
  return activeTag.startsWith(node.fullPath + '/');
}
