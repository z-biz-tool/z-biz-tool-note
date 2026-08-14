import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';

export interface TagOptions {
  HTMLAttributes: Record<string, any>;
  // 点击标签时的回调
  onTagClick: ((tag: string) => void) | null;
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
      onTagClick: null as ((tag: string) => void) | null,
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
          'data-tag-name': name || '',
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

  // 拦截标签点击，调用 onTagClick 回调
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleClick: (view, pos, event) => {
            const target = event.target as HTMLElement;
            const tagEl = target.closest('[data-type="tag"]') as HTMLElement;
            if (tagEl) {
              const tag = tagEl.getAttribute('data-tag-name') || tagEl.textContent?.replace('#', '');
              if (tag && this.options.onTagClick) {
                this.options.onTagClick(tag);
                return true;
              }
            }
            return false;
          },
        },
      }),
    ];
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
