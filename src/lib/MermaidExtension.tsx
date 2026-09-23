import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { ApartmentOutlined, EditOutlined, CheckOutlined } from '@ant-design/icons';
import mermaid from 'mermaid';

export interface MermaidOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mermaid: {
      setMermaid: (code: string) => ReturnType;
    };
  }
}

// mermaid 是全局单例，配置跟着唯一会渲染图的地方走。securityLevel 显式钉死 strict：
// 节点视图是把渲染结果 innerHTML 进 DOM 的，strict 会过滤掉 svg 里的脚本和外部引用。
mermaid.initialize({
  theme: 'default',
  startOnLoad: false,
  securityLevel: 'strict',
});

// mermaid.render 每次都要一个唯一的 dom id，重复用会拿到上一张图
let mermaidSeq = 0;

function MermaidComponent({ node, updateAttributes }: any) {
  const code: string = node.attrs.code || '';
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(!code);

  useEffect(() => {
    const src = code.trim();
    if (!src) {
      setSvg('');
      setError('');
      return;
    }
    let cancelled = false;
    const id = `zn-mermaid-${++mermaidSeq}`;
    // securityLevel 已在上面钉成 strict，mermaid 会过滤掉 svg 里的脚本和外部引用，
    // 所以渲染结果能直接进 innerHTML
    mermaid
      .render(id, src)
      .then((result) => {
        if (cancelled) return;
        setSvg(result.svg);
        setError('');
      })
      .catch((e: any) => {
        if (cancelled) return;
        setSvg('');
        setError(String(e?.message || e).slice(0, 160));
      })
      // 渲染失败时 mermaid 会把临时容器留在 document.body 上，不清就是每改一次源码漏一个节点
      .finally(() => document.getElementById(id)?.remove());
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <NodeViewWrapper className="mermaid-block" as="div">
      <div
        style={{
          border: '1px solid var(--border-color)',
          borderRadius: 6,
          margin: '8px 0',
          overflow: 'hidden',
          background: 'var(--bg-secondary)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 12px',
            background: 'var(--bg-tertiary)',
            borderBottom: '1px solid var(--border-color)',
            fontSize: 12,
          }}
          contentEditable={false}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1677ff' }}>
            <ApartmentOutlined />
            <span style={{ fontWeight: 500 }}>Mermaid 图表</span>
          </div>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-label={editing ? '完成编辑图表源码' : '编辑图表源码'}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {editing ? <CheckOutlined /> : <EditOutlined />}
            {editing ? '完成' : '编辑源码'}
          </button>
        </div>

        {editing && (
          <textarea
            value={code}
            onChange={(e) => updateAttributes({ code: e.target.value })}
            spellCheck={false}
            aria-label="Mermaid 图表源码"
            placeholder={'graph TD\n  A[开始] --> B[结束]'}
            style={{
              display: 'block',
              width: '100%',
              minHeight: 96,
              boxSizing: 'border-box',
              border: 'none',
              borderTop: '1px solid var(--border-color)',
              padding: '8px 12px',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              lineHeight: 1.5,
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              resize: 'vertical',
            }}
          />
        )}

        <div style={{ padding: 12, textAlign: 'center', overflowX: 'auto' }}>
          {error ? (
            <div style={{ color: '#ff4d4f', fontSize: 12, textAlign: 'left', whiteSpace: 'pre-wrap' }}>
              {`图表画不出来：${error}`}
            </div>
          ) : svg ? (
            <div dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              {code.trim() ? '渲染中...' : '还没有图表源码，点右上角"编辑源码"写一段'}
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const Mermaid = Node.create<MermaidOptions>({
  name: 'mermaid',

  group: 'block',

  // 源码放属性里而不是当子内容：之前是 content:'text*' + atom，节点里留着 <code> 空洞，
  // Editor 的 renderMermaid 又把 SVG innerHTML 写进同一个节点 —— ProseMirror 的 DOMObserver
  // 把这些外来 DOM 当成用户改动回读进文档，实测一篇图的正文被拆成
  // mermaid{} + paragraph(开始) + paragraph(结束)（SVG 里的标签文字漏进了笔记）。
  // 现在预览只在节点视图内部渲染，PM 的文档树里再也没有外来 DOM。
  content: '',

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      code: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-code') || '',
        renderHTML: (attrs: any) => ({ 'data-code': attrs.code || '' }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="mermaid"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'mermaid' }, this.options.HTMLAttributes, HTMLAttributes)];
  },

  // ===== Markdown 往返 =====
  // 实测：不写这几条时含 mermaid 的文档 getMarkdown() 返回空串 —— 图源码连同整篇正文一起
  // 消失。语法用通用的 ```mermaid 围栏，导出到 GitHub / Obsidian 也还是图。
  markdownTokenName: 'mermaid',

  markdownTokenizer: {
    name: 'mermaid',
    level: 'block',
    start: (src: string) => (/^```mermaid\b/.test(src) ? 0 : -1),
    tokenize: (src: string) => {
      const m = /^```mermaid[^\S\n]*\n([\s\S]*?)```/.exec(src);
      if (!m) return undefined;
      return { type: 'mermaid', raw: m[0], attributes: { code: m[1].replace(/\n$/, '') } };
    },
  },

  parseMarkdown: (token: any, h: any) => h.createNode('mermaid', { code: token.attributes?.code ?? '' }),

  // 这里的 node 不是 ProseMirror 节点而是 {type, attrs, content} 这种 JSON 形状（实测
  // console 打印过），所以取属性而不是 node.textContent。
  renderMarkdown: (node: any) => '```mermaid\n' + String(node.attrs?.code || '') + '\n```',

  addNodeView() {
    return ReactNodeViewRenderer(MermaidComponent);
  },

  addCommands() {
    return {
      // 参数是源码字符串；斜杠菜单之前传的是 { content: '...' }，insertContent 拿到一个
      // 对象当文字，实测点"Mermaid图表"什么都不插入（整条命令是死的）。
      setMermaid: (code: string) => ({ commands }: any) => {
        return commands.insertContent({ type: this.name, attrs: { code: code || '' } });
      },
    };
  },

  addKeyboardShortcuts() {
    return {};
  },
});
