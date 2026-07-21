import { Bold, Italic, Strikethrough, Underline, Code, Heading1, Heading2, Heading3, List, ListOrdered, Quote, Minus, Link, Image, CheckSquare } from 'lucide-react';
import { Editor } from '@tiptap/react';

interface ToolbarProps {
  editor: Editor | null;
}

export const Toolbar = ({ editor }: ToolbarProps) => {
  if (!editor) return null;

  return (
    <div style={styles.toolbar}>
      <div style={styles.divider} />
      
      <Button onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')}>
        <Bold size={18} />
      </Button>
      <Button onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')}>
        <Italic size={18} />
      </Button>
      <Button onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')}>
        <Strikethrough size={18} />
      </Button>
      <Button onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')}>
        <Underline size={18} />
      </Button>
      <Button onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')}>
        <Code size={18} />
      </Button>

      <div style={styles.divider} />

      <Button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })}>
        <Heading1 size={18} />
      </Button>
      <Button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })}>
        <Heading2 size={18} />
      </Button>
      <Button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })}>
        <Heading3 size={18} />
      </Button>

      <div style={styles.divider} />

      <Button onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')}>
        <List size={18} />
      </Button>
      <Button onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')}>
        <ListOrdered size={18} />
      </Button>
      <Button onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive('taskList')}>
        <CheckSquare size={18} />
      </Button>

      <div style={styles.divider} />

      <Button onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')}>
        <Quote size={18} />
      </Button>
      <Button onClick={() => editor.chain().focus().setHorizontalRule().run()} active={false}>
        <Minus size={18} />
      </Button>

      <div style={styles.divider} />

      <Button onClick={() => editor.chain().focus().extendMarkRange('link').toggleLink({ href: 'https://' }).run()} active={editor.isActive('link')}>
        <Link size={18} />
      </Button>
      <Button onClick={() => editor.chain().focus().setImage({ src: 'https://' }).run()} active={false}>
        <Image size={18} />
      </Button>
    </div>
  );
};

const Button = ({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active: boolean }) => (
  <button
    onClick={onClick}
    style={{
      ...styles.button,
      backgroundColor: active ? 'var(--accent-color)' : 'transparent',
      color: active ? '#fff' : 'var(--text-secondary)',
    }}
  >
    {children}
  </button>
);

const styles: { [key: string]: React.CSSProperties } = {
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    backgroundColor: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border-color)',
    gap: '4px',
    flexWrap: 'wrap',
  },
  divider: {
    width: '1px',
    height: '24px',
    backgroundColor: 'var(--border-color)',
    margin: '0 4px',
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
};