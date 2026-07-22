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
}: EditorProps) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const editorScrollRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false,
      }),
      Markdown.configure({
        markedOptions: { gfm: true, breaks: true },
      }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: false, allowBase64: true }),
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
      WikiLink,
    ],
    content,
    onUpdate: ({ editor }) => {
      const markdown = editor.getMarkdown();
      onChange(markdown);
      updateStats();
      updateHeadings();
      updateWikiLinks();
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

  // Update content when prop changes (file switch)
  useEffect(() => {
    if (editor && content !== editor.getMarkdown()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

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

  const updateStats = useCallback(() => {
    if (!editor) return;
    const text = editor.getText();
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const characters = text.length;
    const lines = text.split('\n').length;
    const readingTime = Math.max(1, Math.ceil(words / 200));
    onStatsChange({ words, characters, lines, readingTime });
  }, [editor, onStatsChange]);

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
  }, [editor, onHeadingsChange]);

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

  // Render Mermaid diagrams
  const renderMermaid = useCallback(() => {
    if (!editor) return;
    const mermaidContainers = editor.view.dom.querySelectorAll('.mermaid-container');
    mermaidContainers.forEach((container) => {
      const codeElement = container.querySelector('code');
      if (codeElement && codeElement.textContent) {
        const code = codeElement.textContent;
        mermaid.render('mermaid-' + Date.now(), code).then((result) => {
          container.innerHTML = result.svg;
        }).catch(() => {
          container.innerHTML = '<pre style="color: red;">Invalid Mermaid syntax</pre>';
        });
      }
    });
  }, [editor]);

  // Image paste handler
  useEffect(() => {
    if (!editor) return;
    const handlePaste = async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            event.preventDefault();
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = reader.result as string;
              editor.chain().focus().setImage({ src: base64 }).run();
            };
            reader.readAsDataURL(file);
          }
        }
      }
    };
    const element = editor.view.dom;
    element.addEventListener('paste', handlePaste);
    return () => element.removeEventListener('paste', handlePaste);
  }, [editor]);

  // Drag and drop image
  useEffect(() => {
    if (!editor || !editorScrollRef.current) return;
    const handleDrop = async (event: DragEvent) => {
      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return;
      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/')) {
          event.preventDefault();
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result as string;
            editor.chain().focus().setImage({ src: base64 }).run();
          };
          reader.readAsDataURL(file);
        }
      }
    };
    const element = editorScrollRef.current;
    element.addEventListener('drop', handleDrop);
    return () => element.removeEventListener('drop', handleDrop);
  }, [editor]);

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
    <div className="editor-container">
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

      <div className="editor-scroll" ref={editorScrollRef}>
        <div className="editor-content">
          <EditorContent editor={editor} />
        </div>
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
    </div>
  );
};
