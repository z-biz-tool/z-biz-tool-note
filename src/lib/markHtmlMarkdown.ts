import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';

/**
 * 给上标/下标补 markdown 序列化。
 *
 * Why: 这两个 mark 是 tiptap 包直接注册的，没有任何 markdown 支持，实测工具栏点"上标"、
 * 自动保存一次之后 `x²` 就变回 `x2`（mark 没 renderMarkdown 时序列化器按空串处理，只留文本）。
 *
 * 解析方向不用自己写：`H<sub>2</sub>O` 走 marked 的 inline html token，tiptap 再按 parseHTML
 * 规则还原成 mark，实测已经是正确的。所以只需要把渲染改成同一套 HTML 写法，就能双向对上。
 *
 * 为什么不用 pandoc 的 `~x~` / `^x^`：实测 `H~2~O` 被 marked 当成删除线吃掉（还回写成
 * `H~~2~~O`，把用户的化学式改成了带删除线的 2），单波浪号这条根本抢不过内置规则。
 */
function withHtmlMarkdown(extension: any, tag: string) {
  return extension.extend({
    renderMarkdown: (node: any, h: any) => `<${tag}>${h.renderChildren(node.content)}</${tag}>`,
  });
}

export const SubscriptMark = withHtmlMarkdown(Subscript, 'sub');

export const SuperscriptMark = withHtmlMarkdown(Superscript, 'sup');
