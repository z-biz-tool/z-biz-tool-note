import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { InfoCircleOutlined, WarningOutlined, RocketOutlined, AlertOutlined, BulbOutlined, MessageOutlined } from '@ant-design/icons';

const CALLOUT_STYLES: Record<string, { bg: string; border: string; icon: React.ReactNode; label: string }> = {
  info:    { bg: '#e6f7ff', border: '#1677ff', icon: <InfoCircleOutlined />,  label: '信息' },
  warning: { bg: '#fff7e6', border: '#fa8c16', icon: <WarningOutlined />,     label: '警告' },
  success: { bg: '#f6ffed', border: '#52c41a', icon: <RocketOutlined />,      label: '成功' },
  danger:  { bg: '#fff2f0', border: '#ff4d4f', icon: <AlertOutlined />,       label: '危险' },
  tip:     { bg: '#f9f0ff', border: '#722ed1', icon: <BulbOutlined />,        label: '小贴士' },
  quote:   { bg: '#f5f5f5', border: '#8c8c8c', icon: <MessageOutlined />,       label: '引用' },
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
            color: '#999',
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
