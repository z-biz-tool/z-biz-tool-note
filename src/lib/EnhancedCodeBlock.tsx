import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { CopyOutlined, DownOutlined } from '@ant-design/icons';
import { useState, useCallback } from 'react';

const LANGUAGES = [
  'plaintext', 'javascript', 'typescript', 'python', 'java', 'go', 'rust',
  'html', 'css', 'json', 'bash', 'sql', 'cpp', 'c', 'csharp', 'ruby',
  'php', 'swift', 'kotlin', 'scala', 'yaml', 'toml', 'xml', 'markdown',
  'dockerfile', 'graphql', 'latex', 'matlab', 'r', 'lua', 'perl',
];

function CodeBlockComponent({ node, updateAttributes, extension }: any) {
  const [showLangs, setShowLangs] = useState(false);
  const [copied, setCopied] = useState(false);
  const lang = node.attrs.language || 'plaintext';

  const handleCopy = useCallback(() => {
    const text = node.textContent;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [node]);

  const filteredLangs = LANGUAGES.filter(l =>
    l.includes(lang.toLowerCase()) || lang === 'plaintext'
  ).slice(0, 10);

  return (
    <NodeViewWrapper>
      <div style={{ position: 'relative', margin: '8px 0' }} className="code-block-wrapper">
        {/* 工具栏 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#2d2d2d',
            borderRadius: '8px 8px 0 0',
            padding: '4px 12px',
            fontSize: 12,
            color: '#999',
          }}
          contentEditable={false}
        >
          <div style={{ position: 'relative' }}>
            <span
              onClick={() => setShowLangs(!showLangs)}
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {lang} <DownOutlined style={{ fontSize: 10 }} />
            </span>
            {showLangs && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, zIndex: 100,
                background: '#1e1e1e', borderRadius: 4, padding: 4,
                maxHeight: 200, overflowY: 'auto', minWidth: 140,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              }}>
                {LANGUAGES.map(l => (
                  <div
                    key={l}
                    onClick={() => { updateAttributes({ language: l }); setShowLangs(false); }}
                    style={{
                      padding: '4px 8px',
                      cursor: 'pointer',
                      borderRadius: 2,
                      color: l === lang ? '#1677ff' : '#ccc',
                      background: l === lang ? '#333' : 'transparent',
                    }}
                    onMouseEnter={(e: any) => e.target.style.background = '#333'}
                    onMouseLeave={(e: any) => e.target.style.background = l === lang ? '#333' : 'transparent'}
                  >
                    {l}
                  </div>
                ))}
              </div>
            )}
          </div>
          <span
            onClick={handleCopy}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            {copied ? '已复制' : <><CopyOutlined /> 复制</>}
          </span>
        </div>
        {/* 代码内容 */}
        <pre style={{
          margin: 0,
          padding: '12px 16px',
          background: '#1e1e1e',
          borderRadius: '0 0 8px 8px',
          overflow: 'auto',
        }}>
          <code className={`language-${lang}`} style={{ color: '#d4d4d4', fontSize: 13, lineHeight: 1.6 }}>
            {/* NodeViewContent will be rendered here by tiptap */}
          </code>
        </pre>
      </div>
    </NodeViewWrapper>
  );
}

export const EnhancedCodeBlock = Node.create({
  name: 'codeBlock',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,

  addAttributes() {
    return {
      language: { default: 'plaintext' },
    };
  },

  parseHTML() {
    return [
      { tag: 'pre' },
      { tag: 'code' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['pre', mergeAttributes(HTMLAttributes), ['code', 0]];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockComponent);
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-c': () => this.editor.commands.toggleCodeBlock(),
    };
  },
});
