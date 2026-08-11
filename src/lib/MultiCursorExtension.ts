import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { Transaction, EditorState } from '@tiptap/pm/state';
import type { ResolvedPos, Node as PmNode } from '@tiptap/pm/model';
import { Slice } from '@tiptap/pm/model';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { ReplaceStep } from '@tiptap/pm/transform';

// 多光标插件：在 plugin state 中维护额外的选区（除原生 selection 外），
// 通过 decorations 绘制；输入/删除时通过 appendTransaction 同步到所有光标。
const multiCursorKey = new PluginKey<MultiCursorState>('multiCursor');

interface ExtraRange {
  from: number;
  to: number;
}

interface MultiCursorState {
  ranges: ExtraRange[]; // 额外选区（不含原生 selection）
}

const SYNC_META = 'multiCursorSynced'; // 标记本插件产生的同步事务，防止 appendTransaction 死循环

// ---------- 工具函数 ----------

// 取光标所在单词的范围
function getWordRange($pos: ResolvedPos): { from: number; to: number } | null {
  const text = $pos.parent.textContent;
  const offset = $pos.parentOffset;
  const isWordChar = (c: string) => /[\w\u4e00-\u9fa5]/.test(c);
  let from = offset;
  while (from > 0 && isWordChar(text[from - 1])) from--;
  let to = offset;
  while (to < text.length && isWordChar(text[to])) to++;
  if (from === to) return null;
  const base = $pos.pos - $pos.parentOffset;
  return { from: base + from, to: base + to };
}

// 在整篇文档中查找所有出现位置（按文本节点遍历，不做跨节点匹配）
function findOccurrences(doc: PmNode, query: string): ExtraRange[] {
  if (!query) return [];
  const results: ExtraRange[] = [];
  doc.descendants((node: PmNode, pos: number) => {
    if (node.isText && node.text) {
      const text = node.text;
      let idx = 0;
      while ((idx = text.indexOf(query, idx)) !== -1) {
        results.push({ from: pos + idx, to: pos + idx + query.length });
        idx += query.length;
      }
    }
    return true;
  });
  return results.sort((a, b) => a.from - b.from);
}

// ---------- ProseMirror 插件 ----------

const multiCursorPlugin = new Plugin<MultiCursorState>({
  key: multiCursorKey,

  state: {
    init() {
      return { ranges: [] };
    },
    apply(tr, value): MultiCursorState {
      const meta = tr.getMeta(multiCursorKey);
      if (meta) {
        if (meta.type === 'clear') return { ranges: [] };
        if (meta.type === 'set') return { ranges: meta.ranges as ExtraRange[] };
        if (meta.type === 'add') return { ranges: [...value.ranges, meta.range as ExtraRange] };
        if (meta.type === 'undo') return { ranges: value.ranges.slice(0, -1) };
      }
      // 文档变更且无显式 meta：通过 mapping 重映射额外选区位置
      if (tr.docChanged && value.ranges.length > 0) {
        const ranges = value.ranges
          .map(r => ({ from: tr.mapping.map(r.from), to: tr.mapping.map(r.to) }))
          .filter(r => r.from != null && r.to != null);
        return { ranges };
      }
      return value;
    },
  },

  props: {
    decorations(state: EditorState) {
      const ps = multiCursorKey.getState(state);
      if (!ps || ps.ranges.length === 0) return null;
      const decos: Decoration[] = [];
      for (const r of ps.ranges) {
        if (r.from === r.to) {
          // 光标：用一个细竖线 widget 表示
          decos.push(
            Decoration.widget(r.from, () => {
              const el = document.createElement('span');
              el.className = 'multi-cursor-widget';
              return el;
            }, { side: -1 })
          );
        } else {
          decos.push(Decoration.inline(r.from, r.to, { class: 'multi-cursor-selection' }));
        }
      }
      return DecorationSet.create(state.doc, decos);
    },

    // Alt+Click 添加光标
    handleClick(view, pos, event) {
      if (!event.altKey) return false;
      const ps = multiCursorKey.getState(view.state);
      const currentSel = {
        from: view.state.selection.from,
        to: view.state.selection.to,
      };
      const newExtra = [...(ps?.ranges || []), currentSel];
      const tr = view.state.tr;
      tr.setMeta(multiCursorKey, { type: 'set', ranges: newExtra });
      tr.setSelection(TextSelection.create(view.state.doc, pos));
      view.dispatch(tr);
      return true;
    },
  },

  appendTransaction(transactions: readonly Transaction[], _oldState: EditorState, newState: EditorState): Transaction | null {
    // 避免处理本插件自己产生的同步事务
    if (transactions.some(tr => tr.getMeta(SYNC_META))) return null;

    const ps = multiCursorKey.getState(newState);
    if (!ps || ps.ranges.length === 0) return null;

    const docChanged = transactions.some(tr => tr.docChanged);
    if (!docChanged) return null;

    const lastTr = transactions[transactions.length - 1];
    const replaceSteps = lastTr.steps.filter(s => s instanceof ReplaceStep) as ReplaceStep[];
    if (replaceSteps.length === 0) return null;

    const tr = newState.tr;
    // 额外光标按位置降序处理，避免先插入影响后续位置
    const sortedCursors = [...ps.ranges].sort((a, b) => b.from - a.from);

    for (const cursor of sortedCursors) {
      let pos = lastTr.mapping.map(cursor.from);
      const posEnd = lastTr.mapping.map(cursor.to);

      for (const step of replaceSteps) {
        if (step.from === step.to && step.slice.size > 0) {
          // 纯插入：在 pos 处插入相同 slice
          tr.step(new ReplaceStep(pos, pos, step.slice));
          pos += step.slice.size;
        } else if (step.from !== step.to && step.slice.size === 0) {
          // 纯删除：删除 pos 到 posEnd 范围
          tr.step(new ReplaceStep(pos, posEnd, Slice.empty));
          pos = posEnd - (step.to - step.from);
          if (pos < 0) pos = 0;
        } else if (step.from !== step.to && step.slice.size > 0) {
          // 替换型操作：先删除选区，再插入内容
          tr.step(new ReplaceStep(pos, posEnd, step.slice));
          pos = pos + step.slice.size - (step.to - step.from);
        }
      }
    }

    // 重映射额外光标到最终文档坐标（替换后都变成光标型）
    const newRanges: ExtraRange[] = ps.ranges.map(r => {
      let f = lastTr.mapping.map(r.from);
      f = tr.mapping.map(f);
      // 替换型操作后，光标应在插入内容末尾
      let t = lastTr.mapping.map(r.to);
      t = tr.mapping.map(t);
      // 如果原始是选区型且发生了替换，光标在插入末尾
      if (r.from !== r.to && replaceSteps.some(s => s.from !== s.to && s.slice.size > 0)) {
        return { from: f, to: f };
      }
      return { from: f, to: t };
    });

    tr.setMeta(multiCursorKey, { type: 'set', ranges: newRanges });
    tr.setMeta(SYNC_META, true);
    return tr;
  },
});

// ---------- Tiptap Extension ----------

export const MultiCursor = Extension.create({
  name: 'multiCursor',

  addProseMirrorPlugins() {
    return [multiCursorPlugin];
  },

  addKeyboardShortcuts() {
    const editor = this.editor;

    // Cmd+D：选中当前单词；再次按下将当前选区加入多光标，并跳到下一个匹配
    const cmdD = () => {
      const { state, view } = editor;
      const { selection } = state;
      let query: string;
      let searchFrom: number;

      if (selection.empty) {
        // 首次按下：选中光标所在单词
        const $pos = state.doc.resolve(selection.from);
        const wordRange = getWordRange($pos);
        if (!wordRange) return false;
        const tr = state.tr.setSelection(TextSelection.create(state.doc, wordRange.from, wordRange.to));
        view.dispatch(tr);
        return true;
      }

      query = state.doc.textBetween(selection.from, selection.to, '');
      searchFrom = selection.to;
      if (!query) return false;

      const all = findOccurrences(state.doc, query);
      // 找当前选区之后的下一个出现位置；找不到则回环到第一个
      const next = all.find(o => o.from >= searchFrom) || all.find(o => o.from !== selection.from);
      if (!next) return false;

      const ps = multiCursorKey.getState(state);
      const currentRange: ExtraRange = { from: selection.from, to: selection.to };
      const newExtra = [...(ps?.ranges || []), currentRange];
      const tr = state.tr;
      tr.setMeta(multiCursorKey, { type: 'set', ranges: newExtra });
      tr.setSelection(TextSelection.create(state.doc, next.from, next.to));
      view.dispatch(tr);
      return true;
    };

    // Cmd+Shift+L：选中所有匹配项（第一个为原生选区，其余为额外选区）
    const cmdShiftL = () => {
      const { state, view } = editor;
      const { selection } = state;
      let query: string;

      if (selection.empty) {
        const $pos = state.doc.resolve(selection.from);
        const wordRange = getWordRange($pos);
        if (!wordRange) return false;
        query = state.doc.textBetween(wordRange.from, wordRange.to, '');
      } else {
        query = state.doc.textBetween(selection.from, selection.to, '');
      }
      if (!query) return false;

      const all = findOccurrences(state.doc, query);
      if (all.length === 0) return false;

      const [first, ...rest] = all;
      const tr = state.tr;
      tr.setMeta(multiCursorKey, { type: 'set', ranges: rest });
      tr.setSelection(TextSelection.create(state.doc, first.from, first.to));
      view.dispatch(tr);
      return true;
    };

    const escape = () => {
      const { state, view } = editor;
      const ps = multiCursorKey.getState(state);
      if (ps && ps.ranges.length > 0) {
        view.dispatch(state.tr.setMeta(multiCursorKey, { type: 'clear' }));
        return true;
      }
      return false;
    };

    // Cmd+U：撤销最后一个添加的选区
    const cmdU = () => {
      const { state, view } = editor;
      const ps = multiCursorKey.getState(state);
      if (ps && ps.ranges.length > 0) {
        view.dispatch(state.tr.setMeta(multiCursorKey, { type: 'undo' }));
        return true;
      }
      return false;
    };

    return {
      'Mod-d': cmdD,
      'Mod-Shift-l': cmdShiftL,
      'Escape': escape,
      'Mod-u': cmdU,
    };
  },
});
