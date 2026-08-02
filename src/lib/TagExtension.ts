import { Mark, mergeAttributes } from '@tiptap/core';

export interface TagOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tag: {
      insertTag: (name: string) => ReturnType;
    };
  }
}

// Match #tag (alphanumeric + chinese + hyphen + underscore), preceded by start or whitespace
export const TAG_REGEX = /(^|\s)#([\w\u4e00-\u9fa5][\w\u4e00-\u9fa5-/]*)/g;

export const Tag = Mark.create<TagOptions>({
  name: 'tag',

  inclusive: false,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-type="tag"]',
        getAttrs: (dom) => ({
          name: (dom as HTMLElement).getAttribute('data-name') || '',
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { name, ...rest } = HTMLAttributes;
    return [
      'a',
      mergeAttributes(
        {
          'data-type': 'tag',
          'data-name': name || '',
          class: 'tag-mark',
          href: '#',
        },
        this.options.HTMLAttributes,
        rest
      ),
      0,
    ];
  },

  addCommands() {
    return {
      insertTag: (name: string) => ({ chain }) => {
        return chain()
          .insertContent({
            type: 'text',
            text: ` #${name} `,
            marks: [{ type: 'tag', attrs: { name } }],
          })
          .run();
      },
    };
  },

  addKeyboardShortcuts() {
    return {};
  },
});

// Extract tags from plain markdown text (used by App for global tag index)
export function extractTags(markdown: string): string[] {
  const tags = new Set<string>();
  let match: RegExpExecArray | null;
  TAG_REGEX.lastIndex = 0;
  while ((match = TAG_REGEX.exec(markdown)) !== null) {
    tags.add(match[2]);
  }
  return Array.from(tags);
}
