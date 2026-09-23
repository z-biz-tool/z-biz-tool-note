import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import type { ResolvedPos } from '@tiptap/pm/model';
import type { Node as PmNode } from '@tiptap/pm/model';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// 多光标插件：在 plugin state 中维护额外的选区（除原生 selection 外），
// 通过 decorations 绘制；打字由 handleTextInput 同步到所有额外选区，其它改动一律先清掉额外选区。
const multiCursorKey = new PluginKey<MultiCursorState>('multiCursor');

interface ExtraRange {
  from: number;
  to: number;
}

interface MultiCursorState {
  ranges: ExtraRange[]; // 额外选区（不含原生 selection）
}

const SYNC_META = 'multiCursorSynced'; // 本插件自己产生的那笔事务：额外选区不能顺手清掉（清了就打不了第二个字）

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
      // 文档一旦被改动又不是你我自己同步的那笔，就清掉额外选区。
      // 以前这里"用 mapping 重映射 + appendTransaction 逐步重放"，实测两件事都会出事：
      // ⌘⇧L 选中四处再插一个字符，把整段内容重复插进文档（"狗 狗 狗 狗狗 狗 狗 狗…"）；
      // 整篇 setContent 时旧坐标越界直接 RangeError。把重放换成 handleTextInput 一次性做完。
      if (tr.docChanged) return { ranges: [] };
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

    // 打字时同步到所有额外选区：每插一处就把后面的坐标过一遍 tr.mapping。
    // （之前直接拿原始绝对坐标去插，原生那笔插入会把后面所有位置整体平移，
    //  实测连打第二个字符会插到空格后面去 —— "狗! !狗 !狗 !狗"。）
    handleTextInput(view, from, to, text) {
      const ps = multiCursorKey.getState(view.state);
      if (!ps || ps.ranges.length === 0) return false;
      const tr = view.state.tr.insertText(text, from, to);
      const next: ExtraRange[] = [];
      for (const r of ps.ranges) {
        if (r.from === from && r.to === to) continue;
        const f = tr.mapping.map(r.from);
        const t = tr.mapping.map(r.to);
        tr.insertText(text, f, t);
        // 插完之后光标落在刚插入文字的末尾，继续打字仍然同步
        const caret = tr.mapping.map(t);
        next.push({ from: caret, to: caret });
      }
      tr.setMeta(multiCursorKey, { type: 'set', ranges: next }).setMeta(SYNC_META, true);
      view.dispatch(tr);
      return true;
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
      // 按 Shift 时浏览器给的 event.key 是大写字母（实测 'L' 完全不触发、'l' 才触发），
      // 两种写法都得绑；App 的全局快捷键那边早就为此统一 toLowerCase 了。
      'Mod-Shift-l': cmdShiftL,
      'Mod-Shift-L': cmdShiftL,
      'Escape': escape,
      'Mod-u': cmdU,
    };
  },
});
