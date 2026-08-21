import { useState, useRef, useEffect } from 'react';
import {
  Bold, Italic, Strikethrough, Underline, Code,
  List, ListOrdered, CheckSquare, Quote, Minus,
  Image as ImageIcon, Link, Table as TableIcon, Sigma, Smile,
  Highlighter, Subscript, Superscript,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  ChevronDown, Type, ListChecks, Plus,
  Globe,
} from 'lucide-react';
import type { Editor } from '@tiptap/react';
import type { EditorMode as _EditorMode } from '../types';
import { useI18n } from '../lib/i18n';

interface ToolbarProps {
  editor: Editor | null;
  onEmojiClick: () => void;
  editorMode: _EditorMode;
}

export const Toolbar = ({ editor, onEmojiClick, editorMode }: ToolbarProps) => {
  const { t, lang, toggleLang } = useI18n();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    if (openMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openMenu]);

  if (!editor) return null;

  const btn = (onClick: () => void, active: boolean, icon: React.ReactNode, title: string) => (
    <button className={`tb-btn ${active ? 'active' : ''}`} onClick={onClick} title={title}>
      {icon}
    </button>
  );

  const toggleMenu = (menu: string) => {
    setOpenMenu(openMenu === menu ? null : menu);
  };

  const MenuButton = ({ id, icon, label, children }: { id: string; icon: React.ReactNode; label: string; children: React.ReactNode }) => (
    <div className="tb-menu-wrap" ref={openMenu === id ? menuRef : undefined}>
      <button className={`tb-menu-btn ${openMenu === id ? 'active' : ''}`} onClick={() => toggleMenu(id)} title={label}>
        {icon}
        <ChevronDown size={12} className="tb-chevron" />
      </button>
      {openMenu === id && (
        <div className="tb-dropdown" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  );

  const MenuItem = ({ onClick, active, icon, label, shortcut }: { onClick: () => void; active?: boolean; icon: React.ReactNode; label: string; shortcut?: string }) => (
    <button
      className={`tb-menu-item ${active ? 'active' : ''}`}
      onClick={() => { onClick(); setOpenMenu(null); }}
    >
      <span className="tb-menu-item-icon">{icon}</span>
      <span className="tb-menu-item-label">{label}</span>
      {shortcut && <span className="tb-menu-item-shortcut">{shortcut}</span>}
    </button>
  );

  const MenuDivider = () => <div className="tb-menu-divider" />;

  return (
    <div className="toolbar">
      {/* Text Style dropdown */}
      <MenuButton id="style" icon={<Type size={15} />} label={t('toolbar', 'textStyle')}>
        <MenuItem onClick={() => editor.chain().focus().setParagraph().run()} icon={<span style={{ fontSize: 13 }}>¶</span>} label={t('toolbar', 'paragraph')} shortcut="Ctrl+Alt+0" />
        <MenuDivider />
        <MenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} icon={<span className="tb-heading-icon">H1</span>} label={t('toolbar', 'heading1')} shortcut="Ctrl+Alt+1" />
        <MenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} icon={<span className="tb-heading-icon">H2</span>} label={t('toolbar', 'heading2')} shortcut="Ctrl+Alt+2" />
        <MenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} icon={<span className="tb-heading-icon">H3</span>} label={t('toolbar', 'heading3')} shortcut="Ctrl+Alt+3" />
        <MenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()} active={editor.isActive('heading', { level: 4 })} icon={<span className="tb-heading-icon">H4</span>} label={t('toolbar', 'heading4')} />
        <MenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 5 }).run()} active={editor.isActive('heading', { level: 5 })} icon={<span className="tb-heading-icon">H5</span>} label={t('toolbar', 'heading5')} />
        <MenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 6 }).run()} active={editor.isActive('heading', { level: 6 })} icon={<span className="tb-heading-icon">H6</span>} label={t('toolbar', 'heading6')} />
      </MenuButton>

      {/* Inline formatting — always visible */}
      <div className="tb-sep" />
      {btn(() => editor.chain().focus().toggleBold().run(), editor.isActive('bold'), <Bold size={15} />, t('toolbar', 'bold'))}
      {btn(() => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'), <Italic size={15} />, t('toolbar', 'italic'))}
      {btn(() => editor.chain().focus().toggleUnderline().run(), editor.isActive('underline'), <Underline size={15} />, t('toolbar', 'underline'))}
      {btn(() => editor.chain().focus().toggleStrike().run(), editor.isActive('strike'), <Strikethrough size={15} />, t('toolbar', 'strikethrough'))}
      {btn(() => editor.chain().focus().toggleCode().run(), editor.isActive('code'), <Code size={15} />, t('toolbar', 'inlineCode'))}
      {btn(() => editor.chain().focus().toggleHighlight().run(), editor.isActive('highlight'), <Highlighter size={15} />, t('toolbar', 'highlight'))}

      {/* Lists dropdown */}
      <MenuButton id="lists" icon={<ListChecks size={15} />} label={t('toolbar', 'lists')}>
        <MenuItem onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} icon={<List size={15} />} label={t('toolbar', 'bulletList')} shortcut="Ctrl+Shift+8" />
        <MenuItem onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} icon={<ListOrdered size={15} />} label={t('toolbar', 'numberedList')} shortcut="Ctrl+Shift+7" />
        <MenuItem onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive('taskList')} icon={<CheckSquare size={15} />} label={t('toolbar', 'taskList')} />
        <MenuDivider />
        <MenuItem onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} icon={<Quote size={15} />} label={t('toolbar', 'quote')} />
        <MenuItem onClick={() => editor.chain().focus().setHorizontalRule().run()} icon={<Minus size={15} />} label={t('toolbar', 'horizontalRule')} />
      </MenuButton>

      {/* Insert dropdown */}
      <MenuButton id="insert" icon={<Plus size={15} />} label={t('toolbar', 'insert')}>
        <MenuItem onClick={() => { const url = window.prompt(t('prompt', 'imageUrl')); if (url) editor.chain().focus().setImage({ src: url }).run(); }} icon={<ImageIcon size={15} />} label={t('toolbar', 'insertImage')} />
        <MenuItem onClick={() => { const url = window.prompt(t('prompt', 'linkUrl')); if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run(); }} active={editor.isActive('link')} icon={<Link size={15} />} label={t('toolbar', 'insertLink')} />
        <MenuItem onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} icon={<TableIcon size={15} />} label={t('toolbar', 'insertTable')} />
        <MenuItem onClick={() => editor.chain().focus().insertContent('$$\n$$').run()} icon={<Sigma size={15} />} label={t('toolbar', 'mathFormula')} />
        <MenuDivider />
        <MenuItem onClick={() => editor.chain().focus().toggleSubscript().run()} active={editor.isActive('subscript')} icon={<Subscript size={15} />} label={t('toolbar', 'subscript')} />
        <MenuItem onClick={() => editor.chain().focus().toggleSuperscript().run()} active={editor.isActive('superscript')} icon={<Superscript size={15} />} label={t('toolbar', 'superscript')} />
        <MenuDivider />
        <MenuItem onClick={onEmojiClick} icon={<Smile size={15} />} label={t('toolbar', 'emoji')} />
      </MenuButton>

      {/* Alignment */}
      <MenuButton id="align" icon={<AlignJustify size={15} />} label={t('toolbar', 'align')}>
        <MenuItem onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} icon={<AlignLeft size={15} />} label={t('toolbar', 'alignLeft')} />
        <MenuItem onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} icon={<AlignCenter size={15} />} label={t('toolbar', 'alignCenter')} />
        <MenuItem onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} icon={<AlignRight size={15} />} label={t('toolbar', 'alignRight')} />
      </MenuButton>

      <div className="tb-spacer" />
      {/* Language toggle */}
      <button
        className="tb-btn tb-lang-btn"
        onClick={toggleLang}
        title={t('toolbar', 'toggleLang')}
      >
        <Globe size={15} />
        <span className="tb-lang-label">{lang === 'zh' ? '中' : 'EN'}</span>
      </button>
      <span className="tb-mode-indicator">{editorMode === 'wysiwyg' ? t('toolbar', 'wysiwyg') : t('toolbar', 'source')}</span>
    </div>
  );
};
