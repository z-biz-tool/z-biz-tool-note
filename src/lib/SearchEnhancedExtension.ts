import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';

const SEARCH_ENHANCED_KEY = new PluginKey('searchEnhanced');

interface SearchState {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  matches: { from: number; to: number }[];
  currentMatch: number;
}

let searchState: SearchState = {
  query: '',
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  matches: [],
  currentMatch: -1,
};

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
      matches.push({ from: pos + match.index, to: pos + match.index + match[0].length });
    }
  });

  return matches;
}

export const SearchEnhanced = Extension.create({
  name: 'searchEnhanced',

  addCommands() {
    return {
      search: (query: string, options?: Partial<typeof searchState>) => ({ state, dispatch }: any) => {
        searchState.query = query;
        if (options?.caseSensitive !== undefined) searchState.caseSensitive = options.caseSensitive;
        if (options?.wholeWord !== undefined) searchState.wholeWord = options.wholeWord;
        if (options?.regex !== undefined) searchState.regex = options.regex;
        searchState.matches = findMatches(state.doc, query, searchState);
        searchState.currentMatch = searchState.matches.length > 0 ? 0 : -1;
        if (dispatch) {
          const tr = state.tr.setMeta(SEARCH_ENHANCED_KEY, { search: true });
          dispatch(tr);
        }
        return searchState.matches.length;
      },
      nextMatch: () => ({ state, dispatch }: any) => {
        if (searchState.matches.length === 0) return false;
        searchState.currentMatch = (searchState.currentMatch + 1) % searchState.matches.length;
        if (dispatch) {
          const match = searchState.matches[searchState.currentMatch];
          const tr = state.tr
            .setSelection(state.selection.constructor.near(state.doc.resolve(match.from)))
            .scrollIntoView()
            .setMeta(SEARCH_ENHANCED_KEY, { next: true });
          dispatch(tr);
        }
        return searchState.currentMatch;
      },
      prevMatch: () => ({ state, dispatch }: any) => {
        if (searchState.matches.length === 0) return false;
        searchState.currentMatch = (searchState.currentMatch - 1 + searchState.matches.length) % searchState.matches.length;
        if (dispatch) {
          const match = searchState.matches[searchState.currentMatch];
          const tr = state.tr
            .setSelection(state.selection.constructor.near(state.doc.resolve(match.from)))
            .scrollIntoView()
            .setMeta(SEARCH_ENHANCED_KEY, { prev: true });
          dispatch(tr);
        }
        return searchState.currentMatch;
      },
      replaceCurrent: (replacement: string) => ({ state, dispatch }: any) => {
        if (searchState.currentMatch < 0) return false;
        const match = searchState.matches[searchState.currentMatch];
        if (dispatch) {
          const tr = state.tr.insertText(replacement, match.from, match.to);
          // Re-search after replacement
          searchState.matches = findMatches(tr.doc, searchState.query, searchState);
          searchState.currentMatch = searchState.matches.length > 0 ? Math.min(searchState.currentMatch, searchState.matches.length - 1) : -1;
          tr.setMeta(SEARCH_ENHANCED_KEY, { replaced: true });
          dispatch(tr);
        }
        return true;
      },
      replaceAll: (replacement: string) => ({ state, dispatch }: any) => {
        if (searchState.matches.length === 0) return false;
        let tr = state.tr;
        // Replace in reverse order to avoid position shift
        const matches = [...searchState.matches].reverse();
        for (const match of matches) {
          tr = tr.insertText(replacement, match.from, match.to);
        }
        searchState.matches = [];
        searchState.currentMatch = -1;
        tr.setMeta(SEARCH_ENHANCED_KEY, { replaceAll: true });
        if (dispatch) dispatch(tr);
        return matches.length;
      },
      clearSearch: () => ({ state, dispatch }: any) => {
        searchState.query = '';
        searchState.matches = [];
        searchState.currentMatch = -1;
        if (dispatch) {
          const tr = state.tr.setMeta(SEARCH_ENHANCED_KEY, { clear: true });
          dispatch(tr);
        }
        return true;
      },
    } as any;
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: SEARCH_ENHANCED_KEY,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, _old, _oldState, newState) => {
            if (searchState.matches.length === 0) return DecorationSet.empty;
            const decorations = searchState.matches.map((match, index) => {
              const isCurrent = index === searchState.currentMatch;
              return Decoration.inline(match.from, match.to, {
                class: isCurrent ? 'search-match-current' : 'search-match',
                style: isCurrent
                  ? 'background:#ffe58f;border-radius:2px;'
                  : 'background:#fff3cd;border-radius:2px;',
              });
            });
            return DecorationSet.create(newState.doc, decorations);
          },
        },
        props: {
          decorations: (state) => {
            return SEARCH_ENHANCED_KEY.getState(state) as DecorationSet;
          },
        },
      }),
    ];
  },
});
