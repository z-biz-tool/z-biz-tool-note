import { Node, mergeAttributes } from '@tiptap/core';

export interface WikiLinkOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    wikiLink: {
      setWikiLink: (href: string, text?: string) => ReturnType;
    };
  }
}

export const WikiLink = Node.create<WikiLinkOptions>({
  name: 'wikiLink',

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
      href: {
        default: '',
      },
      text: {
        default: '',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-type="wiki-link"]',
        getAttrs: (dom) => {
          const element = dom as HTMLElement;
          return {
            href: element.getAttribute('href') || '',
            text: element.getAttribute('data-text') || element.textContent || '',
          };
        },
      },
    ];
  },

  renderHTML() {
    return [
      'a',
      mergeAttributes(
        {
          'data-type': 'wiki-link',
          class: 'wiki-link',
        },
        this.options.HTMLAttributes
      ),
    ];
  },

  addCommands() {
    return {
      setWikiLink: (href: string, text?: string) => ({ chain }) => {
        return chain().insertContent({
          type: this.name,
          attrs: { href, text: text || href },
        }).run();
      },
    };
  },

  addKeyboardShortcuts() {
    return {};
  },
});
