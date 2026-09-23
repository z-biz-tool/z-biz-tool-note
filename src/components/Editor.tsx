import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import Image from '@tiptap/extension-image';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import TextAlign from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Highlight from '@tiptap/extension-highlight';
import Typography from '@tiptap/extension-typography';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { SubscriptMark, SuperscriptMark } from '../lib/markHtmlMarkdown';
import Mathematics from '@tiptap/extension-mathematics';
import { Mermaid } from '../lib/MermaidExtension';
import { WikiLink } from '../lib/WikiLinkExtension';
import { WikiLinkSuggest } from '../lib/WikiLinkSuggestionExtension';
import { Tag } from '../lib/TagExtension';
import { BlockReference } from '../lib/BlockReferenceExtension';
import { MultiCursor } from '../lib/MultiCursorExtension';
import { SlashCommand } from '../lib/SlashCommandExtension';
import { Callout } from '../lib/CalloutExtension';
import { DragHandle } from '../lib/DragHandleExtension';
import { Fold } from '../lib/FoldExtension';
import { Embed } from '../lib/EmbedExtension';
import { TableEnhanced } from '../lib/TableEnhancedExtension';
import { ImageEnhanced } from '../lib/ImageEnhancedExtension';
import { SearchEnhanced } from '../lib/SearchEnhancedExtension';
import { createLowlight } from 'lowlight';
import js from 'highlight.js/lib/languages/javascript';
import ts from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import html from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';
import cpp from 'highlight.js/lib/languages/cpp';
import { Toolbar } from './Toolbar';
import { FindReplace } from './FindReplace';
import { EmojiPicker } from './EmojiPicker';
import { Minimap } from './Minimap';
import { useEffect, useRef, useState, useCallback } from 'react';
import { electronAPI, errText } from '../lib/electronAPI';
import { notify } from '../lib/dialogs';
import { readSearchState } from '../lib/SearchEnhancedExtension';
import type { EditorMode, HeadingItem, WikiLinkItem, NoteStats } from '../types';

import 'katex/dist/katex.min.css';


const lowlight = createLowlight({
  html,
  css,
  javascript: js,
  typescript: ts,
  python,
  java,
  go,
  rust,
  json,
  bash,
  sql,
  cpp,
});

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  title: string;
  onTitleChange: (title: string) => void;
  editorMode: EditorMode;
  focusMode: boolean;
  typewriterMode: boolean;
  showFindReplace: boolean;
  onToggleFindReplace: () => void;
  onStatsChange: (stats: NoteStats) => void;
  onHeadingsChange: (headings: HeadingItem[]) => void;
  onWikiLinksChange: (links: WikiLinkItem[]) => void;
  currentFilePath: string;
  editorRef: React.MutableRefObject<any>;
  onActiveHeadingChange?: (id: string | null) => void;
  // 点击 wiki-link 时的回调
  onWikiLinkClick?: (href: string) => void;
  // 点击标签时的回调
  onTagClick?: (tag: string) => void;
  // 滚动同步目标
  scrollSyncTarget?: React.RefObject<HTMLElement>;
  // 文章宽屏：true 时文档撑满整个编辑区（去掉 max-width 限制）
  documentWide?: boolean;
  // `[[` 双链补全的候选笔记名（已去扩展名）
  wikiTargets?: string[];
  // 从侧栏全文搜索结果点进来时：高亮这一篇里的所有匹配，并把光标落到第一处
  searchJump?: { query: string; line: number } | null;
  onSearchJumpDone?: () => void;
}

export const Editor = ({
  content,
  onChange,
  title,
  onTitleChange,
  editorMode,
  searchJump,
  onSearchJumpDone,
  focusMode,
  typewriterMode,
  showFindReplace,
  onToggleFindReplace,
  onStatsChange,
  onHeadingsChange,
  onWikiLinksChange,
  currentFilePath,
  editorRef,
  onActiveHeadingChange,
  onWikiLinkClick,
  onTagClick,
  scrollSyncTarget,
  documentWide = false,
  wikiTargets,
}: EditorProps) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);

  // 图片点击预览
  const handleEditorClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'IMG') {
      e.preventDefault();
      setLightboxSrc((target as HTMLImageElement).src);
    }
  }, []);
  const [scrollContainerEl, setScrollContainerEl] = useState<HTMLDivElement | null>(null);
  const noteIdRef = useRef<string>('');
  // 编辑器状态 LRU 缓存：上限 30（多标签用户）
  // Map 保持插入顺序；超出时淘汰最早插入的 key（FIFO，等同 LRU 近似）
  // 真实 LRU 需记录访问时间，鉴于切换频次不高，FIFO 已足够
  const stateCacheRef = useRef<Map<string, any>>(new Map());
  const EDITOR_CACHE_LIMIT = 30;

  // useEditor 的配置只在首次创建时生效，扩展里捕获的回调会一直是第一帧的闭包
  // （stale closure：onWikiLinkClick 里的 allFiles 永远不会更新，跳转只能找到首帧就存在的笔记）。
  // 所以 WikiLink/Tag 通过 ref 转发，ref 每次渲染都刷新。
  const wikiLinkClickRef = useRef(onWikiLinkClick);
  wikiLinkClickRef.current = onWikiLinkClick;
  // 候选笔记每次列目录都会变，但扩展只在编辑器创建时配置一次，所以走 ref 取最新值
  const wikiTargetsRef = useRef(wikiTargets);
  wikiTargetsRef.current = wikiTargets;
  const tagClickRef = useRef(onTagClick);
  tagClickRef.current = onTagClick;


  // 滚动同步
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const isScrollSyncing = useRef(false);

  // 防抖更新统计信息和标题列表
  const updateTimerRef = useRef<number>(0);
  const updateStatsRef = useRef<() => void>(() => {});
  const updateHeadingsRef = useRef<() => void>(() => {});
  const updateWikiLinksRef = useRef<() => void>(() => {});

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !scrollSyncTarget?.current) return;

    const handleScroll = () => {
      if (isScrollSyncing.current) return;
      isScrollSyncing.current = true;

      const ratio = container.scrollTop / (container.scrollHeight - container.clientHeight || 1);
      const target = scrollSyncTarget.current;
      if (target) {
        target.scrollTop = ratio * (target.scrollHeight - target.clientHeight);
      }

      requestAnimationFrame(() => {
        isScrollSyncing.current = false;
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [scrollSyncTarget]);

  const editor = useEditor({
    // @tiptap/markdown v3: 告诉 useEditor 传入的 content 字符串是 markdown 而非 HTML/JSON
    contentType: 'markdown',
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false,
        // link/underline/strike/horizontalRule 在 v3 里已由 StarterKit 注册，
        // 再单独 register 一份会重名（控制台 warn），两份的插件与命令互相覆盖。
        // 需要调参就通过 StarterKit 透传 options。
        link: { openOnClick: false, autolink: true },
      }),
      Markdown.configure({
        markedOptions: { gfm: true, breaks: true },
      }),
      ImageEnhanced,
      CodeBlockLowlight.configure({ lowlight }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TableEnhanced,
      Highlight,
      Typography,
      Placeholder.configure({ placeholder: '开始写点什么…' }),
      CharacterCount,
      TextStyle,
      Color,
      SubscriptMark,
      SuperscriptMark,
      Mathematics,
      Mermaid,
      WikiLink.configure({
        onNavigate: (href: string) => {
          wikiLinkClickRef.current?.(href);
        },
      }),
      WikiLinkSuggest.configure({
        getTargets: () => wikiTargetsRef.current ?? [],
      }),
      Tag.configure({
        onTagClick: (tag: string) => {
          tagClickRef.current?.(tag);
        },
      }),
      BlockReference,
      MultiCursor,
      SlashCommand,
      Callout,
      DragHandle,
      Fold,
      Embed.configure({ getTargets: () => wikiTargetsRef.current ?? [] }),
      SearchEnhanced,
    ],
    content,
    onUpdate: ({ editor }) => {
      const markdown = editor.getMarkdown();
      onChange(markdown);
      // 防抖更新统计信息和标题列表
      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
      updateTimerRef.current = window.setTimeout(() => {
        updateStatsRef.current();
        updateHeadingsRef.current();
        updateWikiLinksRef.current();
      }, 300);
    },
    onSelectionUpdate: () => {
      updateHeadings();
    },
  });

  // Expose editor to parent
  useEffect(() => {
    if (editor) {
      editorRef.current = editor;
    }
  }, [editor, editorRef]);

  // 切换笔记时缓存/恢复编辑器状态（含 undo/redo 历史）
  useEffect(() => {
    if (!editor) return;

    // 缓存当前笔记的编辑器状态（含 undo/redo 历史）
    if (noteIdRef.current && noteIdRef.current !== currentFilePath) {
      stateCacheRef.current.set(noteIdRef.current, editor.view.state);
      // 限制缓存大小，避免内存泄漏
      if (stateCacheRef.current.size > EDITOR_CACHE_LIMIT) {
        const firstKey = stateCacheRef.current.keys().next().value;
        if (firstKey) stateCacheRef.current.delete(firstKey);
      }
    }

    // 源码模式下 textarea 才是编辑对象：这里再 setContent 会把用户刚敲的原文按渲染后的文档盖掉
    if (editorMode === 'source') return;
    // 切换到新笔记：直接替换 doc
    // 注：之前用 rAF + opacity 0 做切换过渡，macOS 失焦时 rAF 被节流会导致容器
    // 永久 opacity 0（"白屏，要切到其他 app 再回来才恢复"）。已撤掉，简单 setContent
    // 反而不会卡住——marked.parse + ProseMirror 重建是同步的，浏览器下一帧就 paint 新内容。
    // 是否刚刚程序性替换了整篇文档
    let docReplaced = false;
    if (currentFilePath !== noteIdRef.current) {
      const cached = stateCacheRef.current.get(currentFilePath);
      if (cached) {
        // 恢复缓存的状态（保留 undo 历史）
        editor.view.updateState(cached);
      } else {
        // 新笔记：解析 markdown 并替换 doc
        // emitUpdate:false —— setContent 默认会触发 onUpdate，会被当成"用户编辑"，
        // 导致刚打开的笔记立刻标成未保存并 2 秒后自动写盘（把 markdown 往返归一化后覆盖原文件）。
        editor.commands.setContent(content, { contentType: 'markdown', emitUpdate: false });
      }
      noteIdRef.current = currentFilePath;
      docReplaced = true;
    } else if (content !== editor.getMarkdown()) {
      // 同一笔记内容外部更新（罕见）：同上，程序性替换不应产生脏标记/自动保存
      editor.commands.setContent(content, { contentType: 'markdown', emitUpdate: false });
      docReplaced = true;
    }

    // 字数/大纲/双链都只在 onUpdate 里刷新，而上面刻意不发 onUpdate 事件，
    // 于是打开或切换笔记后状态栏仍是上一篇的数字、大纲是空的，要敲一个字才归位。
    if (docReplaced) {
      updateStatsRef.current();
      updateHeadingsRef.current();
      updateWikiLinksRef.current();
    }
  }, [content, editor, currentFilePath, editorMode]);

  // 搜索结果跳转：先让 SearchEnhanced 画好高亮，再把光标放到第一处匹配上。
  // 侧栏那一行明明印着 L6，以前点击却只传路径 —— 打开后停在文首，行号等于假的。
  useEffect(() => {
    if (!editor || !searchJump || !searchJump.query) return;
    // search/nextMatch 这些命令由 SearchEnhanced 以 as any 注册，类型上看不见，运行时在
    (editor.commands as any).search(searchJump.query);
    const first = readSearchState(editor.state).first;
    if (first) {
      editor.chain().focus().setTextSelection({ from: first.from, to: first.to }).scrollIntoView().run();
    }
    onSearchJumpDone?.();
  }, [editor, searchJump, currentFilePath, onSearchJumpDone]);

  // 组件卸载时缓存当前状态
  useEffect(() => {
    return () => {
      if (editor && noteIdRef.current) {
        stateCacheRef.current.set(noteIdRef.current, editor.view.state);
        // 限制缓存大小，避免内存泄漏
        if (stateCacheRef.current.size > EDITOR_CACHE_LIMIT) {
          const firstKey = stateCacheRef.current.keys().next().value;
          if (firstKey) stateCacheRef.current.delete(firstKey);
        }
      }
    };
  }, [editor]);

  // 源码模式：真的拿一个 textarea 编辑 Markdown 原文。
  // 以前这里只是给 .ProseMirror 挂一个 .source-mode 类（CSS 早就是按 textarea 写的：mono + pre-wrap
  // + 32px 内边距），可界面却写着"切到源码模式：直接编辑 Markdown 原文" —— 实际改的还是渲染后的树，
  // 表格、标题、双链全都碰不到原文。
  const [sourceText, setSourceText] = useState<string | null>(null);
  useEffect(() => {
    if (!editor) return;
    const element = editor.view.dom;
    if (editorMode === 'source') {
      element.classList.add('source-mode');
      // content 就是上层喂进来的正文 markdown（编辑器每次改动都会 onChange 上来），拿它当源文本
      setSourceText(content ?? editor.getMarkdown());
    } else {
      element.classList.remove('source-mode');
      setSourceText(null);
    }
  }, [editorMode, editor, content]);

  // Focus mode
  useEffect(() => {
    if (!editor) return;
    const element = editor.view.dom;
    if (focusMode) {
      element.classList.add('focus-mode');
    } else {
      element.classList.remove('focus-mode');
    }

    if (focusMode) {
      const handleFocus = () => {
        const { from } = editor.state.selection;
        const dom = editor.view.domAtPos(from).node as HTMLElement;
        const block = dom.closest('.ProseMirror > *');
        if (block) {
          editor.view.dom.querySelectorAll('.is-focused').forEach(el => el.classList.remove('is-focused'));
          block.classList.add('is-focused');
        }
      };
      editor.on('selectionUpdate', handleFocus);
      return () => { editor.off('selectionUpdate', handleFocus); };
    }
  }, [focusMode, editor]);

  // Typewriter mode
  useEffect(() => {
    if (!editor) return;
    const element = editor.view.dom;
    if (typewriterMode) {
      element.classList.add('typewriter-mode');
      const handleScroll = () => {
        if (editorScrollRef.current) {
          const { from } = editor.state.selection;
          const coords = editor.view.coordsAtPos(from);
          const container = editorScrollRef.current;
          const containerRect = container.getBoundingClientRect();
          const targetY = coords.top - containerRect.top - containerRect.height / 2;
          container.scrollTop += targetY;
        }
      };
      editor.on('selectionUpdate', handleScroll);
      return () => {
        element.classList.remove('typewriter-mode');
        editor.off('selectionUpdate', handleScroll);
      };
    } else {
      element.classList.remove('typewriter-mode');
    }
  }, [typewriterMode, editor]);

  // 快捷键支持：Ctrl/Cmd+Home/End 跳转到文档开头/结尾
  useEffect(() => {
    if (!editor) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && e.key === 'Home') {
        e.preventDefault();
        editor.commands.setTextSelection(0);
        editor.commands.scrollIntoView();
      } else if (cmd && e.key === 'End') {
        e.preventDefault();
        const endPos = editor.state.doc.content.size;
        editor.commands.setTextSelection(endPos);
        editor.commands.scrollIntoView();
      }
    };
    const element = editor.view.dom;
    element.addEventListener('keydown', handleKeyDown);
    return () => element.removeEventListener('keydown', handleKeyDown);
  }, [editor]);

  const updateStats = useCallback(() => {
    if (!editor) return;
    const text = editor.getText();
    // CJK 感知的字数统计
    const cjkCount = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []).length;
    const nonCjkText = text.replace(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g, ' ');
    const nonCjkWords = nonCjkText.trim() ? nonCjkText.trim().split(/\s+/).length : 0;
    const words = cjkCount + nonCjkWords;
    const characters = text.length;
    // 行数以前取 getText() 换行数：表格每个单元格、代码块每一行都算一行，
    // 一篇 26 个块的笔记能报出 231 行，用户对着屏幕完全对不上。改成顶层块数。
    const blocks = editor.state.doc.childCount;
    const readingTime = words === 0 ? 0 : Math.max(1, Math.ceil(words / 200)); // CJK 约 200 字/分钟；空文档别谎称"约 1 分钟"
    onStatsChange({ words, characters, blocks, readingTime });
  }, [editor, onStatsChange]);
  updateStatsRef.current = updateStats;

  const updateHeadings = useCallback(() => {
    if (!editor) return;
    const headings: HeadingItem[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading') {
        headings.push({
          id: `heading-${pos}`,
          level: node.attrs.level,
          text: node.textContent,
          pos,
        });
      }
    });
    onHeadingsChange(headings);

    // 计算当前光标所在标题：最近的 H1/H2/H3 前驱
    const cursorPos = editor.state.selection.from;
    let activeId: string | null = null;
    for (const h of headings) {
      if (h.level <= 3 && h.pos <= cursorPos) {
        activeId = h.id;
      } else if (h.pos > cursorPos) {
        break;
      }
    }
    onActiveHeadingChange?.(activeId);
  }, [editor, onHeadingsChange, onActiveHeadingChange]);
  updateHeadingsRef.current = updateHeadings;

  const updateWikiLinks = useCallback(() => {
    if (!editor) return;
    const links: WikiLinkItem[] = [];
    const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
    const markdown = editor.getMarkdown();
    let match;
    while ((match = wikiLinkRegex.exec(markdown)) !== null) {
      const text = match[1];
      links.push({
        sourcePath: currentFilePath,
        targetPath: text + '.md',
        text,
      });
    }
    onWikiLinksChange(links);
  }, [editor, onWikiLinksChange, currentFilePath]);
  updateWikiLinksRef.current = updateWikiLinks;

  // 粘贴/拖进来的图片先试着存进笔记图库，拿到 images/xxx 相对路径；存不成才内嵌 base64。
  // 两种"存不成"必须分开：浏览器演示区本来就没有图库（内嵌是预期行为，不用打扰用户），
  // 而原生侧真写盘失败（盘满、目录不可写）时静默转 base64，等于把几十 MB 塞进正文，
  // 用户还以为图存在库里 —— 那条 catch 之前对两者一视同仁。
  //
  // try/catch 不能省：桥层只把 Tauri 分支包在 try 里（electronAPI.ts:532 起），
  // 浏览器回退分支抛出来就是 rejected promise。实测过一次让 invoke 抛错的拖拽，
  // 结果是图片既没入库也没内嵌 —— 拖进去的文件无声消失，比原来的裸 catch 更糟。
  const persistImage = useCallback(async (dataUrl: string): Promise<string | null> => {
    const noteId = currentFilePath.split('/').pop()?.replace(/\.md$/i, '') || 'untitled';
    let reason: unknown;
    try {
      const result = await electronAPI.invoke('save-image', noteId, dataUrl) as { success?: boolean; path?: string; error?: string };
      if (result?.success && result.path) return result.path;
      reason = result?.error;
    } catch (e) {
      reason = e;
    }
    if (electronAPI.isTauri) notify(`图片没能存进笔记库：${errText(reason)}，这张先内嵌在正文里`, 'error');
    return null;
  }, [currentFilePath]);

  // 粘贴处理：Markdown 文本 + 图片
  useEffect(() => {
    if (!editor) return;
    const handlePaste = async (event: ClipboardEvent) => {
      // 检测 Markdown 格式文本：如果粘贴的是纯文本且看起来像 Markdown，阻止 HTML 转换，直接插入纯文本
      const html = event.clipboardData?.getData('text/html');
      const text = event.clipboardData?.getData('text/plain');
      if (html && text && /^(\s*#{1,6}\s|>\s|- {1,2}|\d+\.\s|\[.*\]\(|```|\*\*|__|\|)/m.test(text)) {
        event.preventDefault();
        editor.commands.insertContent(text, { contentType: 'markdown' });
        return;
      }

      // 图片粘贴处理
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            event.preventDefault();
            const reader = new FileReader();
            reader.onload = async () => {
              const base64 = reader.result as string;
              const savedPath = await persistImage(base64);
              editor.chain().focus().setImage({ src: savedPath || base64 }).run();
            };
            reader.readAsDataURL(file);
          }
        }
      }
    };
    const element = editor.view.dom;
    element.addEventListener('paste', handlePaste);
    return () => element.removeEventListener('paste', handlePaste);
  }, [editor, currentFilePath, persistImage]);

  // 拖拽图片处理 - 尝试保存到磁盘（与粘贴逻辑一致的磁盘路径
  useEffect(() => {
    if (!editor || !editorScrollRef.current) return;
    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const handleDrop = async (event: DragEvent) => {
      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return;
      const imageFile = Array.from(files).find(f => f.type.startsWith('image/'));
      if (!imageFile) return;
      event.preventDefault();
      // 尝试保存到磁盘（与粘贴逻辑一致）
      if (currentFilePath) {
        const reader = new FileReader();
        reader.onload = async () => {
          const data = reader.result as string;
          const savedPath = await persistImage(data);
          editor.chain().focus().setImage({ src: savedPath || data, alt: imageFile.name }).run();
        };
        reader.readAsDataURL(imageFile);
        return;
      }
      // 浏览器模式回退到 base64
      const reader = new FileReader();
      reader.onload = () => {
        editor.chain().focus().setImage({ src: reader.result as string, alt: imageFile.name }).run();
      };
      reader.readAsDataURL(imageFile);
    };
    const element = editorScrollRef.current;
    element.addEventListener('dragover', handleDragOver);
    element.addEventListener('drop', handleDrop);
    return () => {
      element.removeEventListener('dragover', handleDragOver);
      element.removeEventListener('drop', handleDrop);
    };
  }, [editor, currentFilePath, persistImage]);

  const jumpToHeading = useCallback((pos: number) => {
    if (!editor) return;
    editor.commands.setTextSelection(pos);
    editor.commands.scrollIntoView();
  }, [editor]);

  // Expose jumpToHeading via ref
  useEffect(() => {
    if (editor && editorRef.current) {
      (editorRef.current as any).jumpToHeading = jumpToHeading;
    }
  }, [editor, jumpToHeading, editorRef]);

  if (!editor) return null;

  return (
    <div className={`editor-container ${documentWide ? 'is-wide' : ''}`} onClick={handleEditorClick}>
      <Toolbar
        editor={editor}
        onEmojiClick={() => setShowEmojiPicker(!showEmojiPicker)}
        editorMode={editorMode}
      />

      {showFindReplace && (
        <FindReplace
          editor={editor}
          onClose={onToggleFindReplace}
        />
      )}

      <input
        type="text"
        className="title-input"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="笔记标题…"
        // placeholder 只在空值时被当成可访问名，填上标题后读屏就只剩"编辑框"；
        // 而且长标题会把提示文字整个顶掉，这里给一个不随内容变的固定名字。
        aria-label="笔记标题"
      />

      <div className="editor-body-row">
        <div className="editor-scroll" ref={(el) => { editorScrollRef.current = el; scrollContainerRef.current = el; setScrollContainerEl(el); }}>
          <div className="editor-content">
            {/* 编辑器本体只隐藏不卸载：拔掉 EditorContent 会连 ProseMirror 的 DOM 一起拆掉，
                撤销栈、光标、节点视图全得重建 */}
            <div style={{ display: sourceText === null ? 'block' : 'none' }}>
              <EditorContent editor={editor} />
            </div>
            {sourceText !== null && (
              <textarea
                className="source-textarea"
                value={sourceText}
                spellCheck={false}
                aria-label="Markdown 源码"
                onChange={(e) => {
                  const v = e.target.value;
                  setSourceText(v);
                  // 同步给上层：脏标记、自动保存、WAL 全都照原来的路子走
                  onChange(v);
                }}
              />
            )}
          </div>
        </div>
        <Minimap editor={editor} scrollContainer={scrollContainerEl} />
      </div>

      {showEmojiPicker && (
        <EmojiPicker
          onSelect={(emoji) => {
            editor.chain().focus().insertContent(emoji).run();
            setShowEmojiPicker(false);
          }}
          onClose={() => setShowEmojiPicker(false)}
        />
      )}
      {lightboxSrc && (
        <div className="lightbox-overlay" onClick={() => setLightboxSrc(null)}>
          <img className="lightbox-image" src={lightboxSrc} alt="图片预览" />
          <button className="lightbox-close" onClick={() => setLightboxSrc(null)} title="关闭" aria-label="关闭图片预览">✕</button>
        </div>
      )}
    </div>
  );
};
