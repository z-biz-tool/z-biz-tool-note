import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PmNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';

const FOLD_KEY = new PluginKey('fold');

// 存储折叠状态
const foldedPositions = new Set<number>();

function getHeadingLevel(node: PmNode): number | null {
  if (node.type.name === 'heading') return node.attrs.level;
  return null;
}

function findFoldRange(doc: PmNode, headingPos: number, headingLevel: number): { from: number; to: number } | null {
  let endPos = headingPos + doc.nodeAt(headingPos)!.nodeSize;
  doc.nodesBetween(headingPos + doc.nodeAt(headingPos)!.nodeSize, doc.content.size, (node, pos) => {
    const level = getHeadingLevel(node);
    if (level !== null && level <= headingLevel) {
      return false; // stop at same or higher level heading
    }
    endPos = pos + node.nodeSize;
    return true;
  });
  return { from: headingPos + doc.nodeAt(headingPos)!.nodeSize, to: endPos };
}

export const Fold = Extension.create({
  name: 'fold',

  addCommands() {
    return {
      toggleFold: () => ({ state, dispatch }: any) => {
        const { selection } = state;
        const $pos = state.doc.resolve(selection.from);

        // Find the nearest heading
        for (let d = $pos.depth; d > 0; d--) {
          const node = $pos.node(d);
          if (node.type.name === 'heading') {
            const headingPos = $pos.before(d);
            if (foldedPositions.has(headingPos)) {
              foldedPositions.delete(headingPos);
            } else {
              foldedPositions.add(headingPos);
            }
            if (dispatch) {
              const tr = state.tr.setMeta(FOLD_KEY, { toggled: true });
              dispatch(tr);
            }
            return true;
          }
        }
        return false;
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
      new Plugin({
        key: FOLD_KEY,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, oldState) => {
            if (tr.docChanged || tr.getMeta(FOLD_KEY)) {
              return buildFoldDecorations(tr.doc);
            }
            return oldState;
          },
        },
        props: {
          decorations: (state) => {
            return FOLD_KEY.getState(state) as DecorationSet;
          },
          handleClick: (view: EditorView, pos: number) => {
            const $pos = view.state.doc.resolve(pos);
            for (let d = $pos.depth; d > 0; d--) {
              const node = $pos.node(d);
              if (node.type.name === 'heading') {
                const headingPos = $pos.before(d);
                // Check if click is on the fold indicator area (left of heading)
                const coords = view.coordsAtPos(pos);
                if (coords.left - view.posAtCoords({ left: coords.left - 20, top: coords.top })!.pos > 5) {
                  // Click was near the fold indicator
                }
                return false;
              }
            }
            return false;
          },
        },
      }),
    ];
  },
});

function buildFoldDecorations(doc: PmNode): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return;

    const level = node.attrs.level;
    if (foldedPositions.has(pos)) {
      // Add fold indicator
      const foldIcon = document.createElement('span');
      foldIcon.className = 'fold-indicator folded';
      foldIcon.contentEditable = 'false';
      foldIcon.innerHTML = '▶';
      foldIcon.style.cssText = 'cursor:pointer;color:#999;font-size:10px;margin-right:4px;user-select:none;';
      foldIcon.addEventListener('click', () => {
        foldedPositions.delete(pos);
        // Trigger re-render
        const editorView = document.querySelector('.ProseMirror')?.__vue__?.$editor?.view;
        if (editorView) {
          const tr = editorView.state.tr.setMeta(FOLD_KEY, { toggled: true });
          editorView.dispatch(tr);
        }
      });

      decorations.push(Decoration.widget(pos + 1, foldIcon));

      // Fold the content below this heading
      const range = findFoldRange(doc, pos, level);
      if (range && range.from < range.to) {
        decorations.push(Decoration.node(range.from, range.to, { class: 'folded-content' }, {}));
      }
    } else {
      // Add unfold indicator
      const foldIcon = document.createElement('span');
      foldIcon.className = 'fold-indicator';
      foldIcon.contentEditable = 'false';
      foldIcon.innerHTML = '▼';
      foldIcon.style.cssText = 'cursor:pointer;color:#ccc;font-size:10px;margin-right:4px;user-select:none;transition:color 0.2s;';
      foldIcon.addEventListener('mouseenter', () => { foldIcon.style.color = '#999'; });
      foldIcon.addEventListener('mouseleave', () => { foldIcon.style.color = '#ccc'; });
      foldIcon.addEventListener('click', () => {
        foldedPositions.add(pos);
        const editorView = document.querySelector('.ProseMirror')?.__vue__?.$editor?.view;
        if (editorView) {
          const tr = editorView.state.tr.setMeta(FOLD_KEY, { toggled: true });
          editorView.dispatch(tr);
        }
      });

      decorations.push(Decoration.widget(pos + 1, foldIcon));
    }
  });

  return DecorationSet.create(doc, decorations);
}
