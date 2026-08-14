import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';

export interface WikiLinkOptions {
  HTMLAttributes: Record<string, any>;
  // 点击 wiki-link 时的回调
  onNavigate: ((href: string) => void) | null;
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
      onNavigate: null as ((href: string) => void) | null,
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

  renderHTML({ node }) {
    return [
      'a',
      mergeAttributes(
        {
          'data-type': 'wiki-link',
          class: 'wiki-link',
          href: node.attrs.href,
          'data-text': node.attrs.text,
        },
        this.options.HTMLAttributes
      ),
      node.attrs.text || node.attrs.href,
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

  // 拦截 wiki-link 点击，调用 onNavigate 回调
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleClick: (view, pos, event) => {
            const target = event.target as HTMLElement;
            if (target.closest('[data-type="wiki-link"]')) {
              const linkEl = target.closest('a') as HTMLElement;
              const href = linkEl?.getAttribute('data-text') || linkEl?.getAttribute('href');
              if (href && this.options.onNavigate) {
                this.options.onNavigate(href);
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
