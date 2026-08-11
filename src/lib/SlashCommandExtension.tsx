import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import tippy, { Instance as TippyInstance } from 'tippy.js';
import Suggestion, { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import { forwardRef, useEffect, useImperativeHandle, useState, useCallback } from 'react';
import {
  FileTextOutlined, OrderedListOutlined, CodeOutlined, TableOutlined,
  FunctionOutlined, ApartmentOutlined, BulbOutlined, PictureOutlined,
  CheckSquareOutlined, MessageOutlined, LineOutlined, WarningOutlined,
  InfoCircleOutlined, RocketOutlined, AlertOutlined, FormOutlined,
  HighlightOutlined, VideoCameraOutlined,
} from '@ant-design/icons';

interface CommandItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  command: (props: any) => void;
  category: string;
}

const COMMANDS: CommandItem[] = [
  // 基础块
  { title: '标题1', description: '大标题', icon: <FormOutlined />, category: '基础', command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(); } },
  { title: '标题2', description: '中标题', icon: <FormOutlined />, category: '基础', command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(); } },
  { title: '标题3', description: '小标题', icon: <FormOutlined />, category: '基础', command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(); } },
  { title: '无序列表', description: '项目符号列表', icon: <OrderedListOutlined />, category: '基础', command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).toggleBulletList().run(); } },
  { title: '有序列表', description: '编号列表', icon: <OrderedListOutlined />, category: '基础', command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).toggleOrderedList().run(); } },
  { title: '任务列表', description: '待办事项', icon: <CheckSquareOutlined />, category: '基础', command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).toggleTaskList().run(); } },
  { title: '引用', description: '引用块', icon: <MessageOutlined />, category: '基础', command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).toggleBlockquote().run(); } },
  { title: '分割线', description: '水平分割线', icon: <LineOutlined />, category: '基础', command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).setHorizontalRule().run(); } },
  // 高级块
  { title: '代码块', description: '代码高亮块', icon: <CodeOutlined />, category: '高级', command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).toggleCodeBlock().run(); } },
  { title: '表格', description: '3x3表格', icon: <TableOutlined />, category: '高级', command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); } },
  { title: '数学公式', description: 'KaTeX公式', icon: <FunctionOutlined />, category: '高级', command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).setMathematics().run(); } },
  { title: 'Mermaid图表', description: '流程图/时序图', icon: <ApartmentOutlined />, category: '高级', command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).setMermaid({ content: 'graph TD\n  A[开始] --> B[结束]' }).run(); } },
  // Callout
  { title: '信息提示', description: '蓝色信息框', icon: <InfoCircleOutlined />, category: '提示框', command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).setCallout({ type: 'info' }).run(); } },
  { title: '警告提示', description: '橙色警告框', icon: <WarningOutlined />, category: '提示框', command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).setCallout({ type: 'warning' }).run(); } },
  { title: '成功提示', description: '绿色成功框', icon: <RocketOutlined />, category: '提示框', command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).setCallout({ type: 'success' }).run(); } },
  { title: '危险提示', description: '红色危险框', icon: <AlertOutlined />, category: '提示框', command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).setCallout({ type: 'danger' }).run(); } },
  { title: '小贴士', description: '紫色提示框', icon: <BulbOutlined />, category: '提示框', command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).setCallout({ type: 'tip' }).run(); } },
  { title: '引用提示', description: '灰色引用框', icon: <MessageOutlined />, category: '提示框', command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).setCallout({ type: 'quote' }).run(); } },
  // 媒体
  { title: '图片', description: '插入图片', icon: <PictureOutlined />, category: '媒体', command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).setImage({ src: '' }).run(); } },
  { title: '嵌入笔记', description: '![[笔记ID]]嵌入其他笔记', icon: <FileTextOutlined />, category: '高级', command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).setEmbed({ noteId: '' }).run(); } },
  { title: '高亮', description: '文字高亮标记', icon: <HighlightOutlined />, category: '格式', command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).toggleHighlight().run(); } },
];

interface CommandListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const CommandList = forwardRef<CommandListRef, SuggestionProps<CommandItem>>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [query, setQuery] = useState('');

  const items = useCallback(() => {
    const q = props.query.toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter(item =>
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );
  }, [props.query]);

  const filteredItems = items();

  useEffect(() => {
    setSelectedIndex(0);
  }, [props.query]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((i) => (i - 1 + filteredItems.length) % filteredItems.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((i) => (i + 1) % filteredItems.length);
        return true;
      }
      if (event.key === 'Enter') {
        if (filteredItems[selectedIndex]) {
          props.command(filteredItems[selectedIndex]);
        }
        return true;
      }
      return false;
    },
  }), [filteredItems, selectedIndex, props.command]);

  // 按类别分组
  const categories: Record<string, CommandItem[]> = {};
  for (const item of filteredItems) {
    if (!categories[item.category]) categories[item.category] = [];
    categories[item.category].push(item);
  }

  let globalIndex = 0;

  return (
    <div style={{
      background: 'var(--bg-primary)',
      borderRadius: 8,
      boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
      padding: 4,
      maxHeight: 360,
      overflowY: 'auto',
      width: 280,
      fontSize: 13,
    }}>
      {Object.entries(categories).map(([cat, catItems]) => (
        <div key={cat}>
          <div style={{ padding: '4px 8px', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
            {cat}
          </div>
          {catItems.map((item) => {
            const idx = globalIndex++;
            return (
              <div
                key={item.title}
                onClick={() => props.command(item)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  background: idx === selectedIndex ? 'color-mix(in srgb, var(--accent-color) 15%, var(--bg-primary))' : 'transparent',
                  color: idx === selectedIndex ? 'var(--accent-color)' : 'var(--text-primary)',
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <span style={{ fontSize: 16, width: 20, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.description}</div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {filteredItems.length === 0 && (
        <div style={{ padding: 12, color: 'var(--text-muted)', textAlign: 'center' }}>无匹配命令</div>
      )}
    </div>
  );
});

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: ({ editor, range, props }: { editor: any; range: any; props: CommandItem }) => {
          props.command({ editor, range });
        },
        items: ({ query }: { query: string }) => {
          const q = query.toLowerCase();
          if (!q) return COMMANDS;
          return COMMANDS.filter(item =>
            item.title.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q) ||
            item.category.toLowerCase().includes(q)
          );
        },
        render: () => {
          let component: ReactRenderer<CommandListRef>;
          let popup: TippyInstance[];

          return {
            onStart: (props: SuggestionProps<CommandItem>) => {
              component = new ReactRenderer(CommandList, { props, editor: props.editor });
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
            onUpdate(props: SuggestionProps<CommandItem>) {
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
            },
          };
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [Suggestion({ editor: this.editor, ...this.options.suggestion })];
  },
});
