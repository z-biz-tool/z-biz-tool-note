import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PmNode } from '@tiptap/pm/model';

const TABLE_TOOLBAR_KEY = new PluginKey('tableToolbar');

export const TableEnhanced = Extension.create({
  name: 'tableEnhanced',

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: TABLE_TOOLBAR_KEY,
        props: {
          decorations: (state) => {
            const { doc, selection } = state;
            if (!selection.empty) return DecorationSet.empty;

            // Check if cursor is in a table
            const $pos = doc.resolve(selection.from);
            let inTable = false;
            let tablePos = -1;
            let tableNode: PmNode | null = null;

            for (let d = $pos.depth; d > 0; d--) {
              const node = $pos.node(d);
              if (node.type.name === 'table') {
                inTable = true;
                tablePos = $pos.before(d);
                tableNode = node;
                break;
              }
            }

            if (!inTable || !tableNode) return DecorationSet.empty;

            // Create floating toolbar
            const toolbar = document.createElement('div');
            toolbar.className = 'table-toolbar';
            toolbar.contentEditable = 'false';
            toolbar.style.cssText = 'display:flex;gap:2px;padding:4px;background:#fff;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.12);position:absolute;top:-40px;left:0;z-index:100;';

            const buttons = [
              { label: '+行', action: 'addRowAfter' },
              { label: '+列', action: 'addColumnAfter' },
              { label: '-行', action: 'deleteRow' },
              { label: '-列', action: 'deleteColumn' },
              { label: '合并', action: 'mergeCells' },
              { label: '拆分', action: 'splitCell' },
              { label: '↺', action: 'toggleHeaderRow', title: '切换表头' },
              { label: '🗑', action: 'deleteTable', title: '删除表格' },
            ];

            buttons.forEach(({ label, action, title }) => {
              const btn = document.createElement('button');
              btn.textContent = label;
              btn.title = title || label;
              btn.style.cssText = 'border:none;background:#f5f5f5;padding:2px 8px;border-radius:3px;cursor:pointer;font-size:12px;color:#333;';
              btn.addEventListener('mouseenter', () => { btn.style.background = '#e6f7ff'; btn.style.color = '#1677ff'; });
              btn.addEventListener('mouseleave', () => { btn.style.background = '#f5f5f5'; btn.style.color = '#333'; });
              btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const commands = (editor as any).commands;
                if (commands[action]) {
                  commands[action]();
                }
              });
              toolbar.appendChild(btn);
            });

            const deco = Decoration.widget(tablePos, toolbar, { side: -1 });
            return DecorationSet.create(doc, [deco]);
          },
        },
      }),
    ];
  },
});
