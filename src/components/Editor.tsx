import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Strike from '@tiptap/extension-strike';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import Highlight from '@tiptap/extension-highlight';
import Typography from '@tiptap/extension-typography';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Mathematics from '@tiptap/extension-mathematics';
import { Mermaid } from '../lib/MermaidExtension';
import { WikiLink } from '../lib/WikiLinkExtension';
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
import type { EditorMode, HeadingItem, WikiLinkItem } from '../types';
import mermaid from 'mermaid';

import 'katex/dist/katex.min.css';


mermaid.initialize({
  theme: 'default',
  startOnLoad: false,
});

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
  onStatsChange: (stats: { words: number; characters: number; lines: number; readingTime: number }) => void;
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
}

export const Editor = ({
  content,
  onChange,
  title,
  onTitleChange,
  editorMode,
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
  const stateCacheRef = useRef<Map<string, any>>(new Map());
  const mermaidCounterRef = useRef(0);

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
      }),
      Markdown.configure({
        markedOptions: { gfm: true, breaks: true },
      }),
      Link.configure({ openOnClick: false, autolink: true }),
      ImageEnhanced,
      CodeBlockLowlight.configure({ lowlight }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      Strike,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TableEnhanced,
      HorizontalRule,
      Highlight,
      Typography,
      Placeholder.configure({ placeholder: 'Start writing your note...' }),
      CharacterCount,
      TextStyle,
      Color,
      Subscript,
      Superscript,
      Mathematics,
      Mermaid,
      WikiLink.configure({
        onNavigate: (href: string) => {
          // 查找并打开目标笔记
          if (onWikiLinkClick) onWikiLinkClick(href);
        },
      }),
      Tag.configure({
        onTagClick: (tag: string) => {
          if (onTagClick) onTagClick(tag);
        },
      }),
      BlockReference,
      MultiCursor,
      SlashCommand,
      Callout,
      DragHandle,
      Fold,
      Embed,
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
      setTimeout(renderMermaid, 100);
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
      if (stateCacheRef.current.size > 10) {
        const firstKey = stateCacheRef.current.keys().next().value;
        if (firstKey) stateCacheRef.current.delete(firstKey);
      }
    }

    // 切换到新笔记：直接替换 doc
    // 注：之前用 rAF + opacity 0 做切换过渡，macOS 失焦时 rAF 被节流会导致容器
    // 永久 opacity 0（"白屏，要切到其他 app 再回来才恢复"）。已撤掉，简单 setContent
    // 反而不会卡住——marked.parse + ProseMirror 重建是同步的，浏览器下一帧就 paint 新内容。
    if (currentFilePath !== noteIdRef.current) {
      const cached = stateCacheRef.current.get(currentFilePath);
      if (cached) {
        // 恢复缓存的状态（保留 undo 历史）
        editor.view.updateState(cached);
      } else {
        // 新笔记：解析 markdown 并替换 doc
        editor.commands.setContent(content, { contentType: 'markdown' });
      }
      noteIdRef.current = currentFilePath;
    } else if (content !== editor.getMarkdown()) {
      // 同一笔记内容外部更新（罕见）
      editor.commands.setContent(content, { contentType: 'markdown' });
    }
  }, [content, editor, currentFilePath]);

  // 组件卸载时缓存当前状态
  useEffect(() => {
    return () => {
      if (editor && noteIdRef.current) {
        stateCacheRef.current.set(noteIdRef.current, editor.view.state);
        // 限制缓存大小，避免内存泄漏
        if (stateCacheRef.current.size > 10) {
          const firstKey = stateCacheRef.current.keys().next().value;
          if (firstKey) stateCacheRef.current.delete(firstKey);
        }
      }
    };
  }, [editor]);

  // Source mode toggle
  useEffect(() => {
    if (!editor) return;
    const element = editor.view.dom;
    if (editorMode === 'source') {
      element.classList.add('source-mode');
    } else {
      element.classList.remove('source-mode');
    }
  }, [editorMode, editor]);

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
    const lines = text.split('\n').length;
    const readingTime = Math.max(1, Math.ceil(words / 200)); // CJK 约 200 字/分钟
    onStatsChange({ words, characters, lines, readingTime });
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

  // Render Mermaid diagrams
  const renderMermaid = useCallback(() => {
    if (!editor) return;
    const mermaidContainers = editor.view.dom.querySelectorAll('.mermaid-container');
    mermaidContainers.forEach((container) => {
      const codeElement = container.querySelector('code');
      if (codeElement && codeElement.textContent) {
        const code = codeElement.textContent;
        mermaid.render('mermaid-' + (++mermaidCounterRef.current), code).then((result) => {
          container.innerHTML = result.svg;
        }).catch(() => {
          container.innerHTML = '<pre style="color: red;">Invalid Mermaid syntax</pre>';
        });
      }
    });
  }, [editor]);

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
              try {
                const { invoke } = await import('@tauri-apps/api/core');
                const relativePath = await invoke('save_image', { noteId: currentFilePath.split('/').pop()?.replace('.md', '') || 'untitled', data: base64 });
                editor.chain().focus().setImage({ src: relativePath as string }).run();
              } catch {
                // fallback to base64
                editor.chain().focus().setImage({ src: base64 }).run();
              }
            };
            reader.readAsDataURL(file);
          }
        }
      }
    };
    const element = editor.view.dom;
    element.addEventListener('paste', handlePaste);
    return () => element.removeEventListener('paste', handlePaste);
  }, [editor, currentFilePath]);

  // 拖拽图片处理 - 尝试保存到磁盘（与粘贴逻辑一致的磁盘路径
  useEffect(() => {
    if (!editor || !editorScrollRef.current) return;
    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
      event.dataTransfer?.dropEffect = 'copy';
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
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const relativePath = await invoke('save_image', {
              noteId: currentFilePath.split('/').pop()?.replace('.md', '') || 'untitled',
              data,
            });
            editor.chain().focus().setImage({ src: relativePath as string, alt: imageFile.name }).run();
          } catch {
            // 保存失败，回退到 base64
            editor.chain().focus().setImage({ src: data, alt: imageFile.name }).run();
          }
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
  }, [editor, currentFilePath]);

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
        placeholder="Note title..."
      />

      <div className="editor-body-row">
        <div className="editor-scroll" ref={(el) => { editorScrollRef.current = el; scrollContainerRef.current = el; setScrollContainerEl(el); }}>
          <div className="editor-content">
            <EditorContent editor={editor} />
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
          <img className="lightbox-image" src={lightboxSrc} alt="Preview" />
          <button className="lightbox-close" onClick={() => setLightboxSrc(null)}>✕</button>
        </div>
      )}
    </div>
  );
};
