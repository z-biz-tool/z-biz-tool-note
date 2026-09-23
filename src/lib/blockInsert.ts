import { TextSelection } from '@tiptap/pm/state';

/**
 * 在**当前这条 tr** 上插一个块级 atom 节点，并把光标放到它**之后**、保证那里能打字。
 *
 * Why: 用 `chain().insertContent({type:...})` 插 atom 有两件坏事 —— 一是它会另起一次 dispatch，
 * 想在这条 tr 上找刚插入的节点根本找不到（实测 `end < 0`，改动被丢掉）；二是插完节点处于
 * NodeSelection，用户接着打的下一个字符会把整块替换掉，看起来就是"刚插的东西闪一下就没了"。
 * 位置也不能靠 `at + 1` 猜：块节点插入会把所在段落切开，节点起点比插入点大 1，
 * 所以直接扫 tr.doc 找节点的真实末尾。
 *
 * 调用方：命令里 `insertBlockWithCaret(tr, schema, 'image', attrs)` 之后自己 dispatch(tr)；
 * InputRule 里要先 `tr.delete(range.from, range.to)` 再把 `range.from` 当第 5 个参数传进来
 * （命中的文本区间和选区不是一回事）。
 */
export function placeCaretAfterBlock(tr: any, typeName: string, nearPos: number) {
  let end = -1;
  let bestDist = Infinity;
  tr.doc.forEach((n: any, offset: number) => {
    if (n.type.name !== typeName) return;
    const dist = Math.abs(offset - nearPos);
    if (dist < bestDist) {
      bestDist = dist;
      end = offset + n.nodeSize;
    }
  });
  if (end < 0) return;
  // 节点后面什么都没有时（它正好是最后一块）补一个空段落，否则光标无处可去，
  // near() 只会被拽回节点前面那段文字里，用户就没法在它之后继续写。
  const after = tr.doc.resolve(end).nodeAfter;
  // 段落类型只能从 doc 自己的 schema 上取：Transaction 上没有 .schema，写成
  // tr.schema.nodes.paragraph 会当场抛异常，把整条命令（甚至 InputRule）带崩。
  if (!after || !after.isTextblock) tr.insert(end, tr.doc.type.schema.nodes.paragraph.create());
  // bias 1 = 往后找，正好落到节点后面那个段落开头
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(end, tr.doc.content.size)), 1));
}

export function insertBlockWithCaret(tr: any, schema: any, typeName: string, attrs: any, at?: number) {
  const type = schema.nodes[typeName];
  if (!type) return false;
  // 有选区时先吃掉它：tiptap 的 insertContent 也是这个语义，否则插完选区里的字还在原地
  if (!tr.selection.empty) tr.deleteSelection();
  const pos = at ?? tr.selection.from;
  tr.insert(pos, type.create(attrs));
  placeCaretAfterBlock(tr, typeName, pos);
  tr.scrollIntoView();
  return true;
}
