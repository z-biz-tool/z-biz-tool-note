import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PmNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';

const DRAG_HANDLE_KEY = new PluginKey('dragHandle');

// 可拖拽的块类型
const DRAGGABLE_TYPES = ['heading', 'paragraph', 'blockquote', 'codeBlock', 'bulletList', 'orderedList', 'taskList', 'callout', 'table', 'mermaid', 'mathematics', 'horizontalRule'];

function getDraggableBlock(doc: PmNode, pos: number): { node: PmNode; pos: number } | null {
  const $pos = doc.resolve(pos);
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d);
    if (DRAGGABLE_TYPES.includes(node.type.name)) {
      return { node, pos: $pos.before(d) };
    }
  }
  // top-level block
  const parent = $pos.parent;
  if (DRAGGABLE_TYPES.includes(parent.type.name)) {
    return { node: parent, pos: $pos.before($pos.depth) };
  }
  return null;
}

export const DragHandle = Extension.create({
  name: 'dragHandle',

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: DRAG_HANDLE_KEY,
        props: {
          decorations: (state) => {
            const { doc, selection } = state;
            if (!selection.empty) return DecorationSet.empty;

            const block = getDraggableBlock(doc, selection.from);
            if (!block) return DecorationSet.empty;

            const handle = document.createElement('div');
            handle.className = 'drag-handle';
            handle.contentEditable = 'false';
            handle.draggable = true;
            handle.innerHTML = '⠿';
            handle.style.cssText = 'cursor:grab;color:var(--text-muted);font-size:14px;position:absolute;left:-24px;opacity:0;transition:opacity 0.2s;padding:2px 4px;user-select:none;';

            handle.addEventListener('mouseenter', () => { handle.style.opacity = '1'; });
            handle.addEventListener('mouseleave', () => { handle.style.opacity = '0'; });

            handle.addEventListener('dragstart', (e: DragEvent) => {
              if (!e.dataTransfer) return;
              e.dataTransfer.setData('text/plain', block.pos.toString());
              e.dataTransfer.effectAllowed = 'move';
              handle.style.cursor = 'grabbing';
              // Add drag class to the block
              const dom = editor.view.nodeDOM(block.pos) as HTMLElement;
              if (dom) dom.classList.add('dragging');
            });

            handle.addEventListener('dragend', () => {
              handle.style.cursor = 'grab';
              document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
              document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
            });

            const deco = Decoration.widget(block.pos, handle, { side: -1 });
            return DecorationSet.create(doc, [deco]);
          },
        },
      }),
      // Drop handler
      new Plugin({
        key: new PluginKey('blockDrop'),
        props: {
          handleDrop: (view: EditorView, event: DragEvent, _slice, moved) => {
            if (!moved || !event.dataTransfer) return false;
            const fromPos = parseInt(event.dataTransfer.getData('text/plain'), 10);
            if (isNaN(fromPos)) return false;

            const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (!coordinates) return false;

            const toBlock = getDraggableBlock(view.state.doc, coordinates.pos);
            if (!toBlock) return false;

            const fromBlock = getDraggableBlock(view.state.doc, fromPos);
            if (!fromBlock) return false;

            if (fromBlock.pos === toBlock.pos) return false;

            // Move the block
            const tr = view.state.tr;
            const node = fromBlock.node.copy(fromBlock.node.content);

            // Delete from old position first
            let deleteFrom = fromBlock.pos;
            let deleteTo = fromBlock.pos + fromBlock.node.nodeSize;

            // Insert at new position (adjust if moving down)
            let insertAt = toBlock.pos;
            if (insertAt > deleteFrom) {
              insertAt -= fromBlock.node.nodeSize;
            }

            tr.delete(deleteFrom, deleteTo);
            tr.insert(insertAt, node);

            view.dispatch(tr);
            return true;
          },
        },
      }),
    ];
  },
});
