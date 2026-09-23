import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { modKeys } from './modifier';

/**
 * 解析 `[[目标#锚点|别名]]`，取出真正用于跳转的目标名。
 * 与 Rust 端 extract_links 保持同一套截断规则（# 与 | 之后都丢弃）。
 */
export function parseWikiLinkTarget(inner: string): string {
  return inner.split('#')[0].split('|')[0].trim();
}

/**
 * 拆 `[[目标#锚点|别名]]` → { href: '目标#锚点', text: '别名' 或 '目标' }。
 * href 保留 #锚点（跳转时再裁），text 用别名，这样序列化回去能还原原文。
 */
export function parseWikiLinkAttrs(inner: string): { href: string; text: string } {
  const [targetPart = '', ...aliasParts] = inner.split('|');
  const href = targetPart.trim();
  const alias = aliasParts.join('|').trim();
  return { href, text: alias || href.split('#')[0].trim() };
}

// 兜底装饰：粘贴进来的、或历史里已被转义成 \[\[X\]\] 的双链解析后仍是纯文本，
// 给它们补上链接外观与 Cmd+点击跳转；正常从 markdown 解析出来的走 wikiLink 节点。
const WIKI_LINK_RE = /\[\[([^\[\]\n]+?)\]\]/g;

export function buildWikiLinkDecorations(doc: any): DecorationSet {
  // Tiptap 创建编辑器状态时可能不带 doc（之后才 setContent），此时 init 收到的 doc 是 undefined
  if (!doc) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  doc.descendants((node: any, pos: number, parent: any) => {
    if (!node.isText || !node.text) return;
    // 代码块 / 行内代码里出现的 [[X]] 是字面示例（讲双链语法的笔记常有），
    // 给它加链接外观会把文档里的语法说明变成假的"可跳转链接"。
    if (parent?.type?.name === 'codeBlock') return;
    if (node.marks?.some((m: any) => m.type?.name === 'code')) return;
    WIKI_LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WIKI_LINK_RE.exec(node.text))) {
      const target = parseWikiLinkTarget(m[1]);
      if (!target) continue;
      decorations.push(
        Decoration.inline(pos + m.index, pos + m.index + m[0].length, {
          class: 'wiki-link wiki-link-plain',
          'data-wiki-target': target,
          // 普通点击留给"移动光标"，跳转要 Cmd/Ctrl+点击，见下方 handleClick
          title: modKeys(`Cmd+点击 跳转到「${target}」`),
        })
      );
    }
  });
  return DecorationSet.create(doc, decorations);
}

const wikiLinkPluginKey = new PluginKey<DecorationSet>('wikiLinkDecoration');

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

  // 打字时不自动把 [[X]] 转成节点：输入规则会吞掉光标上下文，实测在补全一半时会抛异常，
  // 而且用户可能只是想打两个方括号（表格、代码片段）。
  // 补全改由 WikiLinkSuggestExtension 的 `[[` 弹层承担（T3-04），选中后才生成节点。

  // ===== Markdown 往返 =====
  // 不注册下面三项时，marked 把 [[X]] 当普通文本，序列化器为了保持字面量会写成 \[\[X\]\]，
  // 于是"打开笔记随手编辑一次"就会写坏文件里的双链：Rust 端 extract_links 扫不到，
  // 反链面板与知识图谱静默失效。注册后 [[目标#锚点|别名]] ⇄ wikiLink 节点可无损往返。
  markdownTokenName: 'wikiLink',

  markdownTokenizer: {
    name: 'wikiLink',
    level: 'inline' as const,
    start: (src: string) => src.indexOf('[['),
    tokenize: (src: string) => {
      const m = /^\[\[([^\[\]\n]+?)\]\]/.exec(src);
      if (!m) return undefined;
      const { href, text } = parseWikiLinkAttrs(m[1]);
      if (!href) return undefined;
      return { type: 'wikiLink', raw: m[0], href, text };
    },
  },

  parseMarkdown: (token: any, helpers: any) =>
    helpers.createNode('wikiLink', { href: token.href || '', text: token.text || token.href || '' }),

  renderMarkdown: (node: any) => {
    const href: string = node.attrs?.href || '';
    const text: string = node.attrs?.text || '';
    if (!href) return text;
    return text && text !== href ? `[[${href}|${text}]]` : `[[${href}]]`;
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-type="wiki-link"]',
        getAttrs: (dom) => {
          const element = dom as HTMLElement;
          return {
            // renderHTML 写的是 data-href（href 会诱使 webview 直接导航），
            // 这里必须优先读 data-href，否则复制粘贴一次就把 href 弄丢了。
            href: element.getAttribute('data-href') || element.getAttribute('href') || '',
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
          // 故意不写 href：href="笔记名" 是相对地址，Cmd+点击会让 webview 直接导航到
          // http://<dev-server>/<笔记名>（实测 URL 变成 /Getting%20Started），
          // 跳转逻辑只走下面的 handleClick。
          'data-href': node.attrs.href,
          'data-text': node.attrs.text,
          title: modKeys(`Cmd+点击 跳转到「${parseWikiLinkTarget(node.attrs.href || '') || node.attrs.text}」`),
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
    const onNavigate = this.options.onNavigate;
    return [
      // 1) 纯文本 [[...]] 的下划线/着色装饰
      new Plugin<DecorationSet>({
        key: wikiLinkPluginKey,
        state: {
          init: ({ doc }) => buildWikiLinkDecorations(doc),
          apply: (tr, old, _oldState, newState) =>
            tr.docChanged ? buildWikiLinkDecorations(newState.doc) : old.map(tr.mapping, newState.doc),
        },
        props: {
          decorations: (state) => wikiLinkPluginKey.getState(state) ?? DecorationSet.empty,
        },
      }),
      // 2) 点击跳转：Cmd/Ctrl+点击才跳转，普通点击保留给"移动光标"
      //    （编辑态里点链接文字若直接跳走，会把定位光标的操作变成意外翻页）
      new Plugin({
        props: {
          handleClick: (_view, _pos, event) => {
            const target = event.target as HTMLElement;
            if (!event.metaKey && !event.ctrlKey) return false;

            // 2a) 已结构化的 wiki-link 节点（<a data-type="wiki-link">）
            const linkEl = target.closest('[data-type="wiki-link"]') as HTMLElement | null;
            if (linkEl) {
              // 必须优先读 href：[[目标|别名]] 的 data-text 是别名，用别名去找笔记会跳错
              const raw = linkEl.getAttribute('data-href') || linkEl.getAttribute('href') || '';
              const name = parseWikiLinkTarget(raw);
              if (name && onNavigate) {
                event.preventDefault();
                onNavigate(name);
                return true;
              }
              return false;
            }

            // 2b) 纯文本形态：从 decorations 的 data-wiki-target 拿目标
            const plainEl = target.closest('[data-wiki-target]') as HTMLElement | null;
            if (plainEl && onNavigate) {
              const name = plainEl.getAttribute('data-wiki-target') || '';
              if (name) {
                event.preventDefault();
                onNavigate(name);
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
