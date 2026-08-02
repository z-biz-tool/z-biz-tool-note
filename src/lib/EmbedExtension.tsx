import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { useState, useEffect } from 'react';
import { FileTextOutlined, ReloadOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';

function EmbedComponent({ node, updateAttributes }: any) {
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const noteId = node.attrs.noteId || '';

  const loadNote = async () => {
    if (!noteId) { setError('未指定笔记ID'); setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const md = await invoke('read_note', { id: noteId });
      // Extract title from first line
      const lines = (md as string).split('\n');
      const firstLine = lines[0] || '';
      setTitle(firstLine.replace(/^#+\s*/, '') || noteId);
      // Show first 500 chars
      const preview = (md as string).slice(0, 500);
      setContent(preview + ((md as string).length > 500 ? '\n...' : ''));
    } catch (e) {
      setError('笔记不存在: ' + noteId);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadNote(); }, [noteId]);

  return (
    <NodeViewWrapper>
      <div style={{
        border: '1px solid #e8e8e8',
        borderRadius: 6,
        margin: '8px 0',
        overflow: 'hidden',
        background: '#fafafa',
      }} className="embed-block">
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          background: '#f0f0f0',
          borderBottom: '1px solid #e8e8e8',
          fontSize: 12,
        }} contentEditable={false}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1677ff' }}>
            <FileTextOutlined />
            <span style={{ fontWeight: 500 }}>{title || noteId}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <ReloadOutlined style={{ cursor: 'pointer', color: '#999' }} onClick={loadNote} />
            <span style={{ color: '#999' }}>嵌入笔记</span>
          </div>
        </div>
        {/* Content */}
        <div style={{ padding: '8px 12px', fontSize: 13, color: '#666', whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>
          {loading ? '加载中...' : error ? <span style={{ color: '#ff4d4f' }}>{error}</span> : content}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const Embed = Node.create({
  name: 'embed',
  group: 'block',
  content: '',
  inline: false,
  atom: true,

  addAttributes() {
    return {
      noteId: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-embed]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-embed': HTMLAttributes.noteId || '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbedComponent);
  },

  addCommands() {
    return {
      setEmbed: (attrs: { noteId: string }) => ({ commands }: any) => {
        return commands.insertContent({ type: this.name, attrs });
      },
    } as any;
  },

  addInputRules() {
    return [
      // Match ![[noteId]] pattern
      {
        find: /!\[\[([^\]]+)\]\]$/,
        handler: ({ state, range, match }: any) => {
          const noteId = match[1];
          const node = state.schema.nodes.embed.create({ noteId });
          const tr = state.tr.replaceWith(range.from, range.to, node);
          state.dispatch(tr);
        },
      },
    ];
  },
});
