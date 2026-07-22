import { Node, mergeAttributes } from '@tiptap/core';

export interface MermaidOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mermaid: {
      setMermaid: (code: string) => ReturnType;
    };
  }
}

export const Mermaid = Node.create<MermaidOptions>({
  name: 'mermaid',

  group: 'block',

  content: 'text*',

  marks: '',

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="mermaid"]',
      },
    ];
  },

  renderHTML() {
    return [
      'div',
      mergeAttributes({ 'data-type': 'mermaid', class: 'mermaid-container' }, this.options.HTMLAttributes),
      ['pre', ['code', { class: 'language-mermaid' }, 0]],
    ];
  },

  addCommands() {
    return {
      setMermaid: (code: string) => ({ chain }) => {
        return chain().insertContent({
          type: this.name,
          content: [{ type: 'text', text: code }],
        }).run();
      },
    };
  },

  addKeyboardShortcuts() {
    return {};
  },
});
