import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { InfoCircleOutlined, WarningOutlined, RocketOutlined, AlertOutlined, BulbOutlined, MessageOutlined } from '@ant-design/icons';

// 模块声明：让 TypeScript 识别 callout 命令
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attrs: { type?: string }) => ReturnType;
      toggleCallout: (attrs: { type?: string }) => ReturnType;
      unsetCallout: () => ReturnType;
    };
  }
}

const CALLOUT_STYLES: Record<string, { bg: string; border: string; icon: React.ReactNode; label: string }> = {
  info:    { bg: 'color-mix(in srgb, #1890ff 10%, var(--bg-primary))', border: '#1890ff', icon: <InfoCircleOutlined />,  label: '信息' },
  warning: { bg: 'color-mix(in srgb, #fa8c16 10%, var(--bg-primary))', border: '#fa8c16', icon: <WarningOutlined />,     label: '警告' },
  success: { bg: 'color-mix(in srgb, #52c41a 10%, var(--bg-primary))', border: '#52c41a', icon: <RocketOutlined />,      label: '成功' },
  danger:  { bg: 'color-mix(in srgb, #f5222d 10%, var(--bg-primary))', border: '#ff4d4f', icon: <AlertOutlined />,       label: '危险' },
  tip:     { bg: 'color-mix(in srgb, #722ed1 10%, var(--bg-primary))', border: '#722ed1', icon: <BulbOutlined />,        label: '小贴士' },
  quote:   { bg: 'var(--bg-tertiary)', border: '#8c8c8c', icon: <MessageOutlined />,       label: '引用' },
};

function CalloutComponent({ node, updateAttributes }: any) {
  const type = node.attrs.type || 'info';
  const style = CALLOUT_STYLES[type] || CALLOUT_STYLES.info;

  return (
    <NodeViewWrapper>
      <div
        style={{
          background: style.bg,
          borderLeft: `4px solid ${style.border}`,
          borderRadius: 4,
          padding: '8px 12px',
          margin: '8px 0',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
        }}
        className="callout-block"
      >
        <span style={{ color: style.border, fontSize: 16, marginTop: 2, flexShrink: 0 }}>{style.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }} contentEditable suppressContentEditableWarning className="callout-content" />
        <select
          value={type}
          onChange={(e) => updateAttributes({ type: e.target.value })}
          style={{
            border: 'none',
            background: 'transparent',
            fontSize: 11,
            color: 'var(--text-muted)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          contentEditable={false}
        >
          {Object.entries(CALLOUT_STYLES).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
      </div>
    </NodeViewWrapper>
  );
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      type: { default: 'info' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': HTMLAttributes.type || 'info' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutComponent);
  },

  addCommands() {
    return {
      setCallout: (attrs: { type?: string }) => ({ commands }: any) => {
        return commands.wrapIn(this.name, attrs);
      },
      toggleCallout: (attrs: { type?: string }) => ({ commands }: any) => {
        return commands.toggleWrap(this.name, attrs);
      },
      unsetCallout: () => ({ commands }: any) => {
        return commands.lift(this.name);
      },
    } as any;
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-c': () => this.editor.commands.toggleCallout({ type: 'info' }),
    };
  },
});
