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
import { Toolbar } from './Toolbar';

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
});

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  title: string;
  onTitleChange: (title: string) => void;
}

export const Editor = ({ content, onChange, title, onTitleChange }: EditorProps) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Markdown.configure({
        markedOptions: {
          gfm: true,
          breaks: true,
        },
      }),
      Link.configure({ openOnClick: false }),
      Image,
      CodeBlockLowlight.configure({ lowlight }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      Strike,
      Table,
      TableRow,
      TableCell,
      TableHeader,
      HorizontalRule,
    ],
    content,
    onUpdate: ({ editor }) => {
      const markdown = editor.getMarkdown();
      onChange(markdown);
    },
  });

  return (
    <div style={styles.editorContainer}>
      <Toolbar editor={editor} />
      
      <input
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Note title..."
        style={styles.titleInput}
      />
      
      <EditorContent 
        editor={editor} 
        style={styles.editorContent}
      />
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  editorContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg-primary)',
    height: '100%',
    overflow: 'hidden',
  },
  titleInput: {
    padding: '16px 24px',
    border: 'none',
    borderBottom: '1px solid var(--border-color)',
    fontSize: '24px',
    fontWeight: '700',
    backgroundColor: 'transparent',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  editorContent: {
    flex: 1,
    overflowY: 'auto',
    backgroundColor: 'var(--bg-primary)',
  },
};