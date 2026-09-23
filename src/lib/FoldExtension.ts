import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PmNode } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';

// 模块声明：让 TypeScript 识别 fold 命令
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fold: {
      toggleFold: () => ReturnType;
    };
  }
}

/**
 * 标题折叠。
 *
 * 改之前是实测到的三处坏：
 * 1. `.folded-content` 这个类名在样式表里压根没有规则 —— 箭头变了样，正文一个字都不藏；
 * 2. 折叠状态放在模块级 Set + 模块级 currentView 里，点击只改 Set 再补一条 meta transaction，
 *    实测当场不重绘，要等下一次无关编辑才换成 ▶；
 * 3. 折叠范围是一条横跨多个块的 node decoration，`DecorationSet.create` 之后 `find()` 里
 *    根本没有它（实测 out=4、found=3）；范围计算本身还会越过同级标题，多藏下一个 H2 的内容。
 * 现在：状态进插件 state、按「级别+标题文字」认块（不认位置：实测映射块起点在它前面插一段
 * 就会指到新段落上、折叠被当成失效丢掉）、一块一条 node decoration、样式补上。
 */
const FOLD_KEY = new PluginKey<FoldState>('fold');

interface FoldEntry {
  // 「级别 + 标题文字」就是这块的身份：位置会变（插入/拆分/删除都会），标题文字不会
  sig: string;
}

interface FoldState {
  folded: FoldEntry[];
  decorations: DecorationSet;
}

function headingOf(node: PmNode | null | undefined): { text: string; level: number } | null {
  if (!node || node.type.name !== 'heading') return null;
  return { text: node.textContent, level: Number(node.attrs.level) || 1 };
}

const foldSig = (h: { text: string; level: number }) => `${h.level} ${h.text}`;

/** 顶层块的签名表：折叠项还在不在文里，靠它判 */
function headingSignatures(doc: PmNode): Set<string> {
  const out = new Set<string>();
  doc.forEach((node) => {
    const h = headingOf(node);
    if (h) out.add(foldSig(h));
  });
  return out;
}

/**
 * 这条标题下面该折住的块：到下一条同级或更高级标题之前（它自己的子节一起收）。
 * 一块一条，见文件头第 3 条。
 */
function foldBlocksFor(doc: PmNode, headingPos: number, level: number): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let inside = false;
  doc.forEach((node, offset) => {
    if (offset === headingPos) {
      inside = true;
      return;
    }
    if (!inside) return;
    const h = headingOf(node);
    if (h && h.level <= level) {
      inside = false;
      return;
    }
    out.push({ from: offset, to: offset + node.nodeSize });
  });
  return out;
}

function makeIcon(pos: number, text: string, folded: boolean): HTMLElement {
  const icon = document.createElement('span');
  icon.className = folded ? 'fold-indicator folded' : 'fold-indicator';
  icon.contentEditable = 'false';
  icon.textContent = folded ? '▶' : '▼';
  icon.setAttribute('role', 'button');
  icon.setAttribute('tabindex', '-1');
  icon.setAttribute('aria-label', `${folded ? '展开' : '折叠'}「${text}」`);
  icon.title = `${folded ? '展开' : '折叠'}「${text}」这一节（⌘⇧↓）`;
  icon.dataset.foldToggle = String(pos);
  icon.style.cssText =
    'cursor:pointer;font-size:10px;margin-right:4px;user-select:none;color:'
    + (folded ? 'var(--text-secondary)' : 'var(--text-muted)');
  return icon;
}

function buildDecorations(doc: PmNode, folded: FoldEntry[]): DecorationSet {
  const on = new Set(folded.map(f => f.sig));
  const out: Decoration[] = [];
  doc.forEach((node, offset) => {
    const h = headingOf(node);
    if (!h) return;
    const foldedHere = on.has(foldSig(h));
    out.push(Decoration.widget(offset + 1, makeIcon(offset, h.text, foldedHere)));
    if (!foldedHere) return;
    for (const block of foldBlocksFor(doc, offset, h.level)) {
      out.push(Decoration.node(block.from, block.to, { class: 'folded-content' }));
    }
  });
  return DecorationSet.create(doc, out);
}

/**
 * 该折叠哪一节：光标在标题里就是这条标题；光标在正文里时往上找**离它最近的那条标题**
 * （只认标题本身的话，从正文里按 ⌘⇧↓ 会什么都不会发生，而"折我这一节"才是直觉）。
 */
function headingUnder(state: EditorState): { pos: number; text: string; level: number } | null {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const h = headingOf($from.node(d));
    if (h) return { pos: $from.before(d), text: h.text, level: h.level };
  }
  const blockStart = $from.before(1);
  let found: { pos: number; text: string; level: number } | null = null;
  state.doc.forEach((node, offset) => {
    if (offset >= blockStart) return;
    const h = headingOf(node);
    if (h) found = { pos: offset, text: h.text, level: h.level };
  });
  return found;
}

/**
 * 刚折叠起来时，光标可能正好落在被藏掉的块里（display:none），看着就是"光标不见了"，
 * 所以把它带回标题上。命令和点击两条路都要走这一步，否则 ⌘⇧↓ 折叠后键盘就丢了焦点。
 */
function clampCaretOutOfFold(tr: any, doc: PmNode, pos: number, level: number) {
  const at = tr.selection.from;
  if (!foldBlocksFor(doc, pos, level).some(bl => at >= bl.from && at <= bl.to)) return;
  tr.setSelection(TextSelection.create(tr.doc, Math.min(pos + 1, tr.doc.content.size)));
}

export const Fold = Extension.create({
  name: 'fold',

  addCommands() {
    return {
      toggleFold: () => ({ state, dispatch }: any) => {
        const h = headingUnder(state);
        if (!h) return false;
        const sig = foldSig(h);
        const wasFolded = (FOLD_KEY.getState(state)?.folded ?? []).some(f => f.sig === sig);
        const tr = state.tr.setMeta(FOLD_KEY, { toggleSig: sig });
        if (!wasFolded) clampCaretOutOfFold(tr, state.doc, h.pos, h.level);
        if (dispatch) dispatch(tr);
        return true;
      },
    } as any;
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-arrowdown': () => this.editor.commands.toggleFold(),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<FoldState>({
        key: FOLD_KEY,
        state: {
          init: (_config, state) => ({ folded: [], decorations: buildDecorations(state.doc, []) }),
          apply: (tr, value, _old, state) => {
            const meta = tr.getMeta(FOLD_KEY) as { toggleSig?: string } | undefined;
            let folded = value.folded;
            if (meta && meta.toggleSig) {
              folded = folded.some(f => f.sig === meta.toggleSig)
                ? folded.filter(f => f.sig !== meta.toggleSig)
                : [...folded, { sig: meta.toggleSig }];
            }
            if (tr.docChanged || meta) {
              // 标题被删掉或改了文字，这条折叠就没有对应的块了
              const sigs = headingSignatures(tr.doc);
              folded = folded.filter(f => sigs.has(f.sig));
            }
            return { folded, decorations: buildDecorations(state.doc, folded) };
          },
        },
        props: {
          decorations: (state) => FOLD_KEY.getState(state)?.decorations ?? DecorationSet.empty,
          handleDOMEvents: {
            // 箭头是 widget 里的普通 DOM，用事件委托接住，不必在模块里偷存一份 view 引用
            mousedown: (view, event) => {
              const el = (event.target as HTMLElement | null)?.closest?.('[data-fold-toggle]') as HTMLElement | null;
              if (!el) return false;
              // 挡掉默认行为，否则 PM 顺手把光标丢进标题，看着像"点折叠还顺便选中了标题"
              event.preventDefault();
              const pos = Number(el.dataset.foldToggle);
              const state = view.state;
              const h = headingOf(Number.isFinite(pos) ? state.doc.nodeAt(pos) : null);
              if (!h) return true;
              const sig = foldSig(h);
              const wasFolded = (FOLD_KEY.getState(state)?.folded ?? []).some(f => f.sig === sig);
              const tr = state.tr.setMeta(FOLD_KEY, { toggleSig: sig });
              if (!wasFolded) clampCaretOutOfFold(tr, state.doc, pos, h.level);
              view.dispatch(tr);
              return true;
            },
            click: (_view, event) => {
              // mousedown 已经处理过，这里吞掉 click 免得再触发一次 PM 的选中逻辑
              return !!(event.target as HTMLElement | null)?.closest?.('[data-fold-toggle]');
            },
          },
        },
      }),
    ];
  },
});
