import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import tippy, { Instance as TippyInstance } from 'tippy.js';
import Suggestion, { SuggestionMatch, SuggestionProps, SuggestionKeyDownProps, Trigger } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

/** 弹层最多展示这么多条，笔记多的目录里一屏刷不完反而找不到 */
const MAX_ROWS = 12;

/** query 长度上限：超过它说明用户不是在补全，只是随手敲了两个方括号继续写正文 */
const MAX_QUERY = 40;

/**
 * 双链触发匹配，替换 @tiptap/suggestion 自带的实现。
 *
 * 自带实现在 allowSpaces 下用 `[[.*?(?=\s\[\[|$)` 匹配，query 会一路吃到文本节点末尾。
 * 实测（同一段里先敲过一次未闭合的 `[[xx`，按 Esc 关掉弹层，再敲 `[[Ta`）：
 * query 变成 `xx[[Ta`，而 dismissedRange 的起点又停在第一个 `[[` 上，
 * 于是补全再也不出现；就算出现，range 也跨过了光标，插入位置会错位。
 * 这里只认光标前最近的那个 `[[`，query 到光标为止 —— 删除与插入必然落在光标处。
 */
export function matchWikiLinkTrigger({ char, $position }: Trigger): SuggestionMatch {
  const before = $position.nodeBefore?.isText ? $position.nodeBefore.text : '';
  const idx = before.lastIndexOf(char);
  if (idx < 0) return null;
  const query = before.slice(idx + char.length);
  // 已闭合、夹着半个方括号（笔记名里不可能有），都说明这不是正在输入的双链
  if (query.includes(']]') || query.includes('[') || query.length > MAX_QUERY) return null;
  const from = $position.pos - (before.length - idx);
  return { range: { from, to: $position.pos }, query, text: before.slice(idx) };
}

/**
 * 排序：前缀命中 > 包含 > 子序列（打 "gstar" 能命中 "Getting Started"）。
 * 同级按名字短的在前，长名字里的空格会稀释匹配质量。
 */
export function rankWikiTargets(candidates: string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return candidates.slice(0, MAX_ROWS);
  const scored: { name: string; score: number }[] = [];
  for (const name of candidates) {
    const n = name.toLowerCase();
    if (n.startsWith(q)) scored.push({ name, score: 0 });
    else if (n.includes(q)) scored.push({ name, score: 1 });
    else {
      let i = 0;
      for (const ch of n) {
        if (ch === q[i]) i += 1;
        if (i === q.length) break;
      }
      if (i === q.length) scored.push({ name, score: 2 });
    }
  }
  scored.sort((a, b) => a.score - b.score || a.name.length - b.name.length || a.name.localeCompare(b.name));
  return scored.slice(0, MAX_ROWS).map(x => x.name);
}

interface WikiListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const WikiList = forwardRef<WikiListRef, SuggestionProps<string>>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const items = props.items;

  useEffect(() => { setSelectedIndex(0); }, [props.query]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      if (event.key === 'ArrowUp' && items.length) {
        setSelectedIndex(i => (i - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === 'ArrowDown' && items.length) {
        setSelectedIndex(i => (i + 1) % items.length);
        return true;
      }
      // Tab 也接受：补全列表就在光标底下，用 Tab 选中比绕到 Enter 更顺手
      if ((event.key === 'Enter' || event.key === 'Tab') && items.length) {
        props.command(items[Math.min(selectedIndex, items.length - 1)]);
        return true;
      }
      return false;
    },
  }), [items, selectedIndex, props]);

  return (
    <div
      className="wiki-suggest"
      style={{
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: 8,
        boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
        padding: 4,
        maxHeight: 300,
        overflowY: 'auto',
        width: 260,
        fontSize: 13,
      }}
    >
      {items.map((name, idx) => (
        <div
          key={name}
          className={`wiki-suggest-item${idx === selectedIndex ? ' active' : ''}`}
          onMouseEnter={() => setSelectedIndex(idx)}
          onClick={() => props.command(name)}
          style={{
            padding: '6px 8px',
            borderRadius: 4,
            cursor: 'pointer',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            background: idx === selectedIndex ? 'color-mix(in srgb, var(--accent-color) 15%, var(--bg-primary))' : 'transparent',
            color: idx === selectedIndex ? 'var(--accent-color)' : 'var(--text-primary)',
          }}
        >
          {name}
        </div>
      ))}
      {items.length === 0 && (
        <div className="wiki-suggest-empty" style={{ padding: '8px 10px', color: 'var(--text-muted)', textAlign: 'center' }}>
          没有匹配「{props.query}」的笔记
        </div>
      )}
    </div>
  );
});

/**
 * `[[` 双链补全（T3-04）。
 *
 * 之前双链只能手写：`[[` 没有输入规则，也没有候选列表，用户得先记住另一篇笔记
 * 的确切文件名才能连上，拼错一个字母就是"未找到笔记"。
 *
 * 与 SlashCommand 一样走 @tiptap/suggestion，但必须自带 pluginKey：
 * 两处都用默认的 SuggestionPluginKey 会互相顶掉，只剩一个生效。
 */
export const WikiLinkSuggest = Extension.create<{ getTargets: () => string[] }>({
  name: 'wikiLinkSuggest',

  addOptions() {
    return { getTargets: () => [] };
  },

  addProseMirrorPlugins() {
    const { getTargets } = this.options;
    return [
      Suggestion<string>({
        editor: this.editor,
        pluginKey: new PluginKey('wikiLinkSuggest'),
        char: '[[',
        // 笔记名普遍含空格（Getting Started），不开 allowSpaces 打到这里就断；
        // 匹配已经换成 matchWikiLinkTrigger，这里保留它只为让"同一次输入的 Esc 抑制"
        // 只比较起点（见 @tiptap/suggestion 的 shouldKeepDismissed）。
        allowSpaces: true,
        // 自带匹配在同一段里有多个未闭合 `[[` 时会错位，见上面的说明
        findSuggestionMatch: matchWikiLinkTrigger,
        items: ({ query }) => rankWikiTargets(getTargets(), query),
        command: ({ editor, range, props }) => {
          if (!props) return;
          editor.chain().focus().deleteRange(range).setWikiLink(props).run();
        },
        render: () => {
          let component: ReactRenderer<WikiListRef> | null = null;
          let popup: TippyInstance[] | null = null;

          return {
            onStart: (props: SuggestionProps<string>) => {
              component = new ReactRenderer(WikiList, { props, editor: props.editor });
              if (!props.clientRect) return;
              popup = tippy('body', {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
              });
            },
            onUpdate(props: SuggestionProps<string>) {
              component?.updateProps(props);
              if (props.clientRect) {
                popup?.[0]?.setProps({ getReferenceClientRect: props.clientRect as () => DOMRect });
              }
            },
            onKeyDown(props: SuggestionKeyDownProps) {
              if (props.event.key === 'Escape') {
                popup?.[0]?.hide();
                return true;
              }
              return component?.ref?.onKeyDown(props) ?? false;
            },
            onExit() {
              popup?.[0]?.destroy();
              component?.destroy();
              component = null;
              popup = null;
            },
          };
        },
      }),
    ];
  },
});
