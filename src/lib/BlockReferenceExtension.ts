import { Node, mergeAttributes } from '@tiptap/core';

export interface BlockRefOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockRef: {
      setBlockRef: (target: string, text?: string) => ReturnType;
    };
  }
}

// Match [[Note Name]], [[Note Name#heading]], [[Note Name#^block-id]]
export const BLOCK_REF_REGEX = /\[\[([^\]]+)#?\^?([^\]]*)\]\]/g;

export function parseBlockRef(raw: string): { note: string; heading?: string; blockId?: string } {
  // raw like: Note Name  or  Note Name#heading  or  Note Name#^block-id
  const [note, rest] = raw.split('#');
  if (!rest) return { note: note.trim() };
  if (rest.startsWith('^')) return { note: note.trim(), blockId: rest.slice(1).trim() };
  return { note: note.trim(), heading: rest.trim() };
}

export const BlockReference = Node.create<BlockRefOptions>({
  name: 'blockRef',

  group: 'inline',

  inline: true,

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      target: { default: '' },
      text: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-type="block-ref"]',
        getAttrs: (dom) => ({
          target: (dom as HTMLElement).getAttribute('data-target') || '',
          text: (dom as HTMLElement).getAttribute('data-text') || (dom as HTMLElement).textContent || '',
        }),
      },
    ];
  },

  renderHTML() {
    return [
      'a',
      mergeAttributes(
        {
          'data-type': 'block-ref',
          class: 'block-ref',
        },
        this.options.HTMLAttributes
      ),
    ];
  },

  addCommands() {
    return {
      setBlockRef: (target: string, text?: string) => ({ chain }) => {
        return chain()
          .insertContent({
            type: this.name,
            attrs: { target, text: text || target },
          })
          .run();
      },
    };
  },

  addKeyboardShortcuts() {
    return {};
  },
});

// Extract all block refs from markdown text
export function extractBlockRefs(markdown: string): Array<{ raw: string; note: string; heading?: string; blockId?: string }> {
  const refs: Array<{ raw: string; note: string; heading?: string; blockId?: string }> = [];
  let match: RegExpExecArray | null;
  BLOCK_REF_REGEX.lastIndex = 0;
  while ((match = BLOCK_REF_REGEX.exec(markdown)) !== null) {
    const raw = match[1] + (match[2] ? '#' + match[2] : '');
    refs.push({ raw, ...parseBlockRef(raw) });
  }
  return refs;
}
