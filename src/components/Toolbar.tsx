import {
  Bold, Italic, Strikethrough, Underline, Code,
  List, ListOrdered, Quote, Minus, Link, Image as ImageIcon, CheckSquare,
  Table as TableIcon, Highlighter, Subscript, Superscript,
  Smile, AlignLeft, AlignCenter, AlignRight,
  Sigma
} from 'lucide-react';
import type { Editor } from '@tiptap/react';
import type { EditorMode as _EditorMode } from '../types';

interface ToolbarProps {
  editor: Editor | null;
  onEmojiClick: () => void;
  editorMode: _EditorMode;
}

export const Toolbar = ({ editor, onEmojiClick, editorMode }: ToolbarProps) => {
  if (!editor) return null;

  const btn = (onClick: () => void, active: boolean, icon: React.ReactNode, title: string) => (
    <button className={`toolbar-btn ${active ? 'active' : ''}`} onClick={onClick} title={title}>
      {icon}
    </button>
  );

  return (
    <div className="toolbar">
      <select
        className="toolbar-select"
        onChange={(e) => {
          const level = parseInt(e.target.value);
          if (level === 0) {
            editor.chain().focus().setParagraph().run();
          } else {
            editor.chain().focus().toggleHeading({ level: level as 1|2|3|4|5|6 }).run();
          }
          e.target.value = '0';
        }}
        defaultValue="0"
        title="Text style"
      >
        <option value="0">Paragraph</option>
        <option value="1">Heading 1</option>
        <option value="2">Heading 2</option>
        <option value="3">Heading 3</option>
        <option value="4">Heading 4</option>
        <option value="5">Heading 5</option>
        <option value="6">Heading 6</option>
      </select>

      <div className="toolbar-divider" />

      {btn(() => editor.chain().focus().toggleBold().run(), editor.isActive('bold'), <Bold size={16} />, 'Bold (Cmd+B)')}
      {btn(() => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'), <Italic size={16} />, 'Italic (Cmd+I)')}
      {btn(() => editor.chain().focus().toggleUnderline().run(), editor.isActive('underline'), <Underline size={16} />, 'Underline')}
      {btn(() => editor.chain().focus().toggleStrike().run(), editor.isActive('strike'), <Strikethrough size={16} />, 'Strikethrough')}
      {btn(() => editor.chain().focus().toggleCode().run(), editor.isActive('code'), <Code size={16} />, 'Inline Code')}
      {btn(() => editor.chain().focus().toggleHighlight().run(), editor.isActive('highlight'), <Highlighter size={16} />, 'Highlight')}

      <div className="toolbar-divider" />

      {btn(() => editor.chain().focus().toggleSubscript().run(), editor.isActive('subscript'), <Subscript size={16} />, 'Subscript')}
      {btn(() => editor.chain().focus().toggleSuperscript().run(), editor.isActive('superscript'), <Superscript size={16} />, 'Superscript')}

      <div className="toolbar-divider" />

      {btn(() => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'), <List size={16} />, 'Bullet List')}
      {btn(() => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'), <ListOrdered size={16} />, 'Numbered List')}
      {btn(() => editor.chain().focus().toggleTaskList().run(), editor.isActive('taskList'), <CheckSquare size={16} />, 'Task List')}
      {btn(() => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote'), <Quote size={16} />, 'Quote')}
      {btn(() => editor.chain().focus().setHorizontalRule().run(), false, <Minus size={16} />, 'Horizontal Rule')}

      <div className="toolbar-divider" />

      {btn(() => {
        const url = window.prompt('Image URL:');
        if (url) editor.chain().focus().setImage({ src: url }).run();
      }, false, <ImageIcon size={16} />, 'Insert Image')}
      {btn(() => {
        const url = window.prompt('Link URL:');
        if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
      }, editor.isActive('link'), <Link size={16} />, 'Insert Link')}
      {btn(() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), false, <TableIcon size={16} />, 'Insert Table')}
      {btn(() => editor.chain().focus().insertContent('$$\n$$').run(), false, <Sigma size={16} />, 'Math Formula')}
      {btn(onEmojiClick, false, <Smile size={16} />, 'Emoji')}

      <div className="toolbar-divider" />

      {btn(() => editor.chain().focus().setTextAlign('left').run(), editor.isActive({ textAlign: 'left' }), <AlignLeft size={16} />, 'Align Left')}
      {btn(() => editor.chain().focus().setTextAlign('center').run(), editor.isActive({ textAlign: 'center' }), <AlignCenter size={16} />, 'Align Center')}
      {btn(() => editor.chain().focus().setTextAlign('right').run(), editor.isActive({ textAlign: 'right' }), <AlignRight size={16} />, 'Align Right')}

      <div className="toolbar-divider" />

      <span style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '0 4px' }}>
        {editorMode === 'wysiwyg' ? 'WYSIWYG' : 'Source'}
      </span>
    </div>
  );
};
