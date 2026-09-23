import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';

const searchKey = new PluginKey('searchEnhanced');

interface SearchState {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  matches: { from: number; to: number }[];
  currentMatch: number;
}

function findMatches(doc: any, query: string, options: { caseSensitive: boolean; wholeWord: boolean; regex: boolean }): { from: number; to: number }[] {
  if (!query) return [];
  const matches: { from: number; to: number }[] = [];
  let searchRegex: RegExp;

  try {
    if (options.regex) {
      const flags = options.caseSensitive ? 'g' : 'gi';
      searchRegex = new RegExp(query, flags);
    } else {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = options.wholeWord ? `\\b${escaped}\\b` : escaped;
      const flags = options.caseSensitive ? 'g' : 'gi';
      searchRegex = new RegExp(pattern, flags);
    }
  } catch {
    return [];
  }

  doc.descendants((node: any, pos: number) => {
    if (!node.isText) return;
    const text = node.text || '';
    let match;
    while ((match = searchRegex.exec(text)) !== null) {
      // 防止零长度匹配导致无限循环
      if (match[0].length === 0) {
        searchRegex.lastIndex++;
        continue;
      }
      matches.push({ from: pos + match.index, to: pos + match.index + match[0].length });
    }
  });

  return matches;
}

/**
 * 给查找替换条读当前搜索结果：匹配数和"第几个"都以插件状态为唯一真源，
 * 免得界面自己再数一遍 —— 之前 FindReplace 就是自己写了一份正则匹配，
 * 于是总数对得上、文档里却一个高亮都没有（装饰只认这份插件状态）。
 */
export function readSearchState(state: any): { query: string; total: number; index: number } {
  const s = searchKey.getState(state) as SearchState | undefined;
  if (!s) return { query: '', total: 0, index: -1 };
  return { query: s.query, total: s.matches.length, index: s.currentMatch };
}

export const SearchEnhanced = Extension.create({
  name: 'searchEnhanced',

  addCommands() {
    return {
      search: (query: string, options?: Partial<SearchState>) => ({ state, dispatch }: any) => {
        const prev = searchKey.getState(state) as SearchState;
        const caseSensitive = options?.caseSensitive ?? prev.caseSensitive;
        const wholeWord = options?.wholeWord ?? prev.wholeWord;
        const regex = options?.regex ?? prev.regex;
        const matches = findMatches(state.doc, query, { caseSensitive, wholeWord, regex });
        const currentMatch = matches.length > 0 ? 0 : -1;
        const newState: SearchState = { query, caseSensitive, wholeWord, regex, matches, currentMatch };
        if (dispatch) {
          dispatch(state.tr.setMeta(searchKey, newState));
        }
        return matches.length;
      },
      nextMatch: () => ({ state, dispatch }: any) => {
        const prev = searchKey.getState(state) as SearchState;
        if (prev.matches.length === 0) return false;
        const currentMatch = (prev.currentMatch + 1) % prev.matches.length;
        const newState: SearchState = { ...prev, currentMatch };
        if (dispatch) {
          const match = prev.matches[currentMatch];
          const tr = state.tr
            .setSelection(state.selection.constructor.near(state.doc.resolve(match.from)))
            .scrollIntoView()
            .setMeta(searchKey, newState);
          dispatch(tr);
        }
        return currentMatch;
      },
      prevMatch: () => ({ state, dispatch }: any) => {
        const prev = searchKey.getState(state) as SearchState;
        if (prev.matches.length === 0) return false;
        const currentMatch = (prev.currentMatch - 1 + prev.matches.length) % prev.matches.length;
        const newState: SearchState = { ...prev, currentMatch };
        if (dispatch) {
          const match = prev.matches[currentMatch];
          const tr = state.tr
            .setSelection(state.selection.constructor.near(state.doc.resolve(match.from)))
            .scrollIntoView()
            .setMeta(searchKey, newState);
          dispatch(tr);
        }
        return currentMatch;
      },
      replaceCurrent: (replacement: string) => ({ state, dispatch }: any) => {
        const prev = searchKey.getState(state) as SearchState;
        if (prev.currentMatch < 0) return false;
        const match = prev.matches[prev.currentMatch];
        if (dispatch) {
          const tr = state.tr.insertText(replacement, match.from, match.to);
          // 替换后重新搜索
          const matches = findMatches(tr.doc, prev.query, prev);
          const currentMatch = matches.length > 0 ? Math.min(prev.currentMatch, matches.length - 1) : -1;
          const newState: SearchState = { ...prev, matches, currentMatch };
          tr.setMeta(searchKey, newState);
          dispatch(tr);
        }
        return true;
      },
      replaceAll: (replacement: string) => ({ state, dispatch }: any) => {
        const prev = searchKey.getState(state) as SearchState;
        if (prev.matches.length === 0) return false;
        let tr = state.tr;
        // 倒序替换以避免位置偏移
        const matches = [...prev.matches].reverse();
        for (const match of matches) {
          tr = tr.insertText(replacement, match.from, match.to);
        }
        const newState: SearchState = { ...prev, matches: [], currentMatch: -1 };
        tr.setMeta(searchKey, newState);
        if (dispatch) dispatch(tr);
        return matches.length;
      },
      clearSearch: () => ({ state, dispatch }: any) => {
        const newState: SearchState = { query: '', caseSensitive: false, wholeWord: false, regex: false, matches: [], currentMatch: -1 };
        if (dispatch) {
          dispatch(state.tr.setMeta(searchKey, newState));
        }
        return true;
      },
    } as any;
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchKey,
        state: {
          init(): SearchState {
            return { query: '', caseSensitive: false, wholeWord: false, regex: false, matches: [], currentMatch: -1 };
          },
          apply(tr, prev) {
            const meta = tr.getMeta(searchKey);
            if (meta) return meta;
            return prev;
          },
        },
        props: {
          decorations(state) {
            const { matches, currentMatch } = searchKey.getState(state) as SearchState;
            if (!matches.length) return DecorationSet.empty;
            const decorations = matches.map((match, index) => {
              const isCurrent = index === currentMatch;
              return Decoration.inline(match.from, match.to, {
                class: isCurrent ? 'search-match-current' : 'search-match',
                style: isCurrent
                  ? 'background:var(--search-match-current-bg, #ffe58f);border-radius:2px;'
                  : 'background:var(--search-match-bg, #fff3cd);border-radius:2px;',
              });
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
