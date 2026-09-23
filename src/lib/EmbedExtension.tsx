import { Node, mergeAttributes, InputRule } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { useState, useEffect } from 'react';
import { FileTextOutlined, ReloadOutlined } from '@ant-design/icons';
import { electronAPI, mustSucceed, errText } from './electronAPI';
import { extractTitle, stripFrontmatter } from './frontmatter';

// 未指定 / 加载中 / 找不到 / 空内容 / 读取失败 / 有内容：这六种得能分开说，
// 之前只有一句"笔记不存在"和一片空白，写错 id 和笔记真没内容长得一样。
type EmbedState = 'no-id' | 'loading' | 'missing' | 'empty' | 'failed' | 'ready';

const EMBED_PREVIEW_CHARS = 500;

function EmbedComponent({ node }: any) {
  const [body, setBody] = useState('');
  const [title, setTitle] = useState('');
  const [state, setState] = useState<EmbedState>('loading');
  const [loadError, setLoadError] = useState('');
  const noteId = node.attrs.noteId || '';

  const loadNote = async () => {
    if (!noteId) { setState('no-id'); return; }
    setState('loading');
    setLoadError('');
    try {
      // content === null 才是"没这篇"；'' 是"有这篇但还没写内容"，两者不能混
      const result = mustSucceed(await electronAPI.invoke('read-note', noteId)) as { content: string | null };
      if (result.content === null || result.content === undefined) {
        setState('missing');
        return;
      }
      const raw = result.content;
      // 标题跟其它地方一样只认 frontmatter.ts 那一套：再写一条"取首行去井号"，
      // 带 YAML 头的笔记就会把 `---` 当标题嵌出来。
      setTitle(extractTitle(raw));
      const text = stripFrontmatter(raw).trim();
      if (!text) { setState('empty'); setBody(''); return; }
      const chars = [...text];
      setBody(chars.length > EMBED_PREVIEW_CHARS ? `${chars.slice(0, EMBED_PREVIEW_CHARS).join('')}\n...` : text);
      setState('ready');
    } catch (e) {
      setLoadError(errText(e));
      setState('failed');
    }
  };

  useEffect(() => { loadNote(); }, [noteId]);

  const hint = (text: string) => <span style={{ color: '#999' }}>{text}</span>;
  const problem = (text: string) => <span style={{ color: '#ff4d4f' }}>{text}</span>;

  return (
    <NodeViewWrapper>
      <div style={{
        border: '1px solid var(--border-color)',
        borderRadius: 6,
        margin: '8px 0',
        overflow: 'hidden',
        background: 'var(--bg-secondary)',
      }} className="embed-block">
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          background: 'var(--bg-tertiary)',
          borderBottom: '1px solid var(--border-color)',
          fontSize: 12,
        }} contentEditable={false}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1677ff' }}>
            <FileTextOutlined />
            <span style={{ fontWeight: 500 }}>{noteId || '未命名嵌入'}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <ReloadOutlined
              style={{ cursor: 'pointer', color: '#999' }}
              title="重新读取"
              role="button"
              tabIndex={0}
              aria-label="重新读取嵌入的笔记"
              onClick={loadNote}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); loadNote(); } }}
            />
            <span style={{ color: '#999' }}>嵌入笔记</span>
          </div>
        </div>
        {/* Content */}
        <div style={{ padding: '8px 12px', fontSize: 13, color: '#666', whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>
          {state === 'loading' && hint('加载中...')}
          {state === 'no-id' && hint('还没指定要嵌入哪篇笔记：正文里写 ![[笔记名]] 就能嵌进来')}
          {state === 'missing' && problem(`找不到这篇笔记：${noteId}`)}
          {state === 'empty' && hint('这篇笔记还没有内容')}
          {state === 'failed' && (
            <>
              {problem(`读取失败：${loadError}`)}
              <span style={{ marginLeft: 8, color: '#999' }}>点右上角的刷新可以重试</span>
            </>
          )}
          {state === 'ready' && (
            <>
              {title && title !== '无标题笔记' && (
                <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>{title}</div>
              )}
              {body}
            </>
          )}
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
      // 匹配 ![[noteId]] 模式
      new InputRule({
        find: /!\[\[([^\]]+)\]\]$/,
        handler: ({ match, commands }) => {
          const noteId = match[1];
          // 只管插节点：InputRule 会自己 dispatch 这条 transaction
          commands.insertContent({ type: 'embed', attrs: { noteId } });
        },
      }),
    ];
  },
});
