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

// 头部 `> [!type]` 独占一行，后面吃连续的引用行（空引用行写作 `>` 也算在内）
const CALLOUT_MD_RE = /^>[ \t]*\[!(\w+)\][^\S\n]*\n((?:>[^\n]*\n?)*)/;

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

  // ===== Markdown 往返 =====
  // 实测：不写这几条时含 callout 的文档 getMarkdown() 直接把它序列化成空行，里面的正文
  // 一起消失（"甲\n\n\n\n乙"）—— 用斜杠菜单插一个提示框、自动存一次盘，字就没了。
  // 语法用 Obsidian 那一套 `> [!warning]`，这样导出到别处也还是个提示框。
  markdownTokenName: 'callout',

  markdownTokenizer: {
    name: 'callout',
    level: 'block',
    start: (src: string) => (/^>[ \t]*\[!/.test(src) ? 0 : -1),
    tokenize: (src: string, _tokens: any, helpers: any) => {
      const m = CALLOUT_MD_RE.exec(src);
      if (!m) return undefined;
      // 去掉每行的 `> ` 前缀，再把里面的内容按普通块解析一遍
      const inner = m[2]
        .split('\n')
        .map((line) => line.replace(/^>[ \t]?/, ''))
        .join('\n')
        .trim();
      return {
        type: 'callout',
        raw: m[0],
        attributes: { type: m[1].toLowerCase() },
        tokens: inner ? helpers.blockTokens(inner) : [],
      };
    },
  },

  parseMarkdown: (token: any, h: any) => {
    const children = h.parseChildren(token.tokens || []);
    // callout 要求至少一个块（content: 'block+'），空提示框如果给空数组会被 PM 直接丢弃，
    // 于是"刚插入还没写字"的提示框存一次盘就没了
    if (!children.length) children.push(h.createNode('paragraph', {}, []));
    return h.createNode('callout', { type: token.attributes?.type || 'info' }, children);
  },

  renderMarkdown: (node: any, h: any) => {
    const inner = h.renderChildren(node, '\n\n') || '';
    const body = inner
      .split('\n')
      .map((line: string) => (line ? `> ${line}` : '>'))
      .join('\n');
    return `> [!${node.attrs?.type || 'info'}]\n${body}`;
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
