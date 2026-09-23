import { Node, mergeAttributes, InputRule } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { useState, useEffect } from 'react';
import { FileTextOutlined, ReloadOutlined } from '@ant-design/icons';
import { electronAPI, mustSucceed, errText } from './electronAPI';
import { insertBlockWithCaret } from './blockInsert';
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
  // 这里**不要**写 selectable:false。试过：那样"插完嵌入块、下一个字符把它顶掉"确实没了，
  // 但代价是退格一下就把整块删掉（实测 after1 直接少一个 embed 节点），连一次确认都没有。
  // 真正该修的是插入后把光标挪出节点（见 placeCaretAfterEmbed），挪好之后默认的可选中行为
  // 反而是对的：实测退格第一下选中嵌入块、第二下才删。

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

  // ===== Markdown 往返 =====
  // 没有这三条时实测 getMarkdown() 把嵌入块序列化成了空行（"前置文字 \n\n\n\n"），
  // 也就是说存一次盘嵌入就没了 —— 节点视图渲染得再好，文件里没有它。
  // 语法沿用 ![[笔记名]]：既是 Obsidian 那一套，也正是 InputRule 认的写法，
  // 所以正文里手打这行、重新打开笔记、再存盘，三条路径看到的是同一个东西。
  markdownTokenName: 'embed',

  markdownTokenizer: {
    name: 'embed',
    level: 'block',
    start: (src: string) => src.indexOf('!['),
    tokenize: (src: string) => {
      // [^\]]* 而不是 + ：斜杠命令插进来的是没填 id 的嵌入块，让它也能原样存回去
      const m = /^!\[\[([^\]]*)\]\]/.exec(src);
      if (!m) return undefined;
      return { type: 'embed', raw: m[0], attributes: { noteId: m[1] } };
    },
  },

  parseMarkdown: (token: any, h: any) =>
    h.createNode('embed', { noteId: token.attributes?.noteId ?? '' }, []),

  renderMarkdown: (node: any) => `![[${node.attrs?.noteId ?? ''}]]`,

  addNodeView() {
    return ReactNodeViewRenderer(EmbedComponent);
  },

  addCommands() {
    return {
      // 斜杠命令走的是这条，和 InputRule 一样在同一个 tr 上插节点再挪光标。
      setEmbed: (attrs: { noteId: string }) => ({ state, tr, dispatch }: any) => {
        if (!dispatch) return true;
        if (!insertBlockWithCaret(tr, state.schema, 'embed', { noteId: attrs?.noteId ?? '' })) return false;
        dispatch(tr);
        return true;
      },
    } as any;
  },

  addInputRules() {
    return [
      // 匹配 ![[noteId]] 模式
      new InputRule({
        find: /!\[\[([^\]]+)\]\]$/,
        handler: ({ state, range, match }) => {
          const { tr } = state;
          // 得像 tiptap 自己的 nodeInputRule 那样先删掉命中的 ![[id]] 文本：InputRule 的
          // run() 只负责匹配，不会替 handler 删 range。
          tr.delete(range.from, range.to);
          insertBlockWithCaret(tr, state.schema, 'embed', { noteId: match[1] }, range.from);
        },
      }),
    ];
  },
});
