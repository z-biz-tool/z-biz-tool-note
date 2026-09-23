import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { useState, useCallback, useRef, useEffect } from 'react';
import { AlignLeftOutlined, AlignCenterOutlined, AlignRightOutlined } from '@ant-design/icons';
import { electronAPI, errText } from './electronAPI';

// `![alt](src "title")`：alt 支持 \] 转义，src 允许 <含空格的路径> 形式
const IMAGE_MD_RE = /^!\[((?:\\.|[^\]\\])*)\]\(\s*(<[^>\n]*>|[^)\s]*)(?:\s+"((?:\\.|[^"\\])*)")?\s*\)/;

const escapeMd = (s: string) => s.replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
const unescapeMd = (s: string) => s.replace(/\\(.)/g, '$1');

/**
 * 从 image title 里取回 align/width。
 * Why: 只认这两个键、且值必须是本节点自己写得出来的那几种，用户在 markdown 里随手写的
 * `![图](a.png "周末拍的")` 才会原样留着，而不是把一句中文塞进 align。
 */
function parseImageMeta(title?: string): Record<string, string> {
  if (!title) return {};
  const out: Record<string, string> = {};
  for (const part of title.split(/\s+/)) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (key === 'align' && ['left', 'center', 'right'].includes(value)) out.align = value;
    if (key === 'width' && /^\d+(\.\d+)?(px|%|em|rem)$/.test(value)) out.width = value;
  }
  return out;
}

function ImageEnhancedComponent({ node, updateAttributes }: any) {
  const src = node.attrs.src || '';
  const alt = node.attrs.alt || '';
  const align = node.attrs.align || 'center';
  const width = node.attrs.width || 'auto';
  const [caption, setCaption] = useState(alt);
  const [editingCaption, setEditingCaption] = useState(false);
  const [naturalWidth, setNaturalWidth] = useState(0);
  const [naturalHeight, setNaturalHeight] = useState(0);
  // 三态而不是一个 loading 布尔：之前 loading 只在 <img> 的 onLoad 上清，图读不出来时
  // （本地图被移走、浏览器模式没有图库）就永远停在"加载中..."，而承载画面的 <img>
  // 又被 display:none 藏了起来 —— 用户看到的是既没有图也没有原因。
  const [status, setStatus] = useState<'loading' | 'ok' | 'failed'>('loading');
  const [failure, setFailure] = useState('');
  const [imgSrc, setImgSrc] = useState(src);
  const imgRef = useRef<HTMLImageElement>(null);

  // Load image from local path if needed
  useEffect(() => {
    setStatus('loading');
    setFailure('');
    if (!src.startsWith('images/')) {
      setImgSrc(src);
      return;
    }
    // images/ 开头的是笔记图库里的相对路径，只有后端能把它读成 data URI
    let cancelled = false;
    (async () => {
      const result = await electronAPI.invoke('read-image', src) as { success?: boolean; dataUrl?: string; error?: string };
      if (cancelled) return;
      if (result?.success && result.dataUrl) {
        setImgSrc(result.dataUrl);
      } else {
        setFailure(errText(result?.error ?? '读取失败'));
        setStatus('failed');
      }
    })();
    return () => { cancelled = true; };
  }, [src]);

  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setStatus('ok');
    setNaturalWidth(e.currentTarget.naturalWidth);
    setNaturalHeight(e.currentTarget.naturalHeight);
  }, []);

  // 只在还没有更具体原因时才写这句：read-image 失败后 imgSrc 仍是相对路径，<img> 必然
  // 跟着报一次错，若无条件覆盖就会把「图片不存在: images/xxx.png」这种能指出根因的话
  // 换成"可能已经不是有效的图片文件"，而后者恰恰是用户已经知道的那一半。
  const handleError = useCallback(() => {
    setFailure((prev) => prev || '图片本身没能渲染，可能已经不是有效的图片文件');
    setStatus('failed');
  }, []);

  const handleResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = imgRef.current?.offsetWidth || 300;
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!imgRef.current) return;
      const diff = moveEvent.clientX - startX;
      const newWidth = Math.max(50, startWidth + diff);
      imgRef.current.style.width = newWidth + 'px';
    };
    const handleMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (imgRef.current) {
        updateAttributes({ width: imgRef.current.style.width });
      }
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [updateAttributes]);

  const alignStyles: Record<string, React.CSSProperties> = {
    left: { justifyContent: 'flex-start' },
    center: { justifyContent: 'center' },
    right: { justifyContent: 'flex-end' },
  };

  return (
    <NodeViewWrapper>
      <div style={{ margin: '8px 0', position: 'relative' }} className="image-enhanced">
        {/* Alignment toolbar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 4, ...alignStyles[align] }} contentEditable={false}>
          <button
            onClick={() => updateAttributes({ align: 'left' })}
            aria-label="图片左对齐"
            aria-pressed={align === 'left'}
            style={{ border: 'none', background: align === 'left' ? 'color-mix(in srgb, var(--accent-color) 10%, var(--bg-primary))' : 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 3, cursor: 'pointer', fontSize: 12 }}
          >
            <AlignLeftOutlined />
          </button>
          <button
            onClick={() => updateAttributes({ align: 'center' })}
            aria-label="图片居中"
            aria-pressed={align === 'center'}
            style={{ border: 'none', background: align === 'center' ? 'color-mix(in srgb, var(--accent-color) 10%, var(--bg-primary))' : 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 3, cursor: 'pointer', fontSize: 12 }}
          >
            <AlignCenterOutlined />
          </button>
          <button
            onClick={() => updateAttributes({ align: 'right' })}
            aria-label="图片右对齐"
            aria-pressed={align === 'right'}
            style={{ border: 'none', background: align === 'right' ? 'color-mix(in srgb, var(--accent-color) 10%, var(--bg-primary))' : 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 3, cursor: 'pointer', fontSize: 12 }}
          >
            <AlignRightOutlined />
          </button>
        </div>

        {/* Image */}
        <div style={{ display: 'flex', ...alignStyles[align], position: 'relative' }}>
          {status !== 'ok' && (
            <div style={{ width: 200, minHeight: 120, background: 'var(--bg-tertiary)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', padding: 8, textAlign: 'center' }}>
              {status === 'loading' ? '加载中...' : `图片读不出来：${failure}（${src.split('/').pop() || src}）`}
            </div>
          )}
          <img
            ref={imgRef}
            src={imgSrc}
            alt={alt}
            onLoad={handleLoad}
            onError={handleError}
            style={{
              maxWidth: '100%',
              width: width === 'auto' ? undefined : width,
              borderRadius: 4,
              display: status === 'ok' ? 'block' : 'none',
            }}
          />
          {/* Resize handle */}
          <div
            onMouseDown={handleResize}
            style={{
              position: 'absolute',
              right: align === 'right' ? -4 : 0,
              bottom: 0,
              width: 12,
              height: 12,
              cursor: 'nwse-resize',
              background: 'var(--accent-color)',
              borderRadius: '0 0 4px 0',
              opacity: 0.5,
            }}
            contentEditable={false}
          />
        </div>

        {/* Caption */}
        <div style={{ textAlign: align as any, marginTop: 4 }} contentEditable={false}>
          {editingCaption ? (
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onBlur={() => { updateAttributes({ alt: caption }); setEditingCaption(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { updateAttributes({ alt: caption }); setEditingCaption(false); } }}
              aria-label="图片说明"
              placeholder="图片说明"
              style={{ border: '1px solid #d9d9d9', borderRadius: 4, padding: '2px 8px', fontSize: 12, width: '100%', maxWidth: 400 }}
              autoFocus
            />
          ) : (
            <span
              onClick={() => setEditingCaption(true)}
              style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'text', fontStyle: 'italic' }}
            >
              {caption || '点击添加图片说明...'}
            </span>
          )}
        </div>

        {/* Size info */}
        {naturalWidth > 0 && (
          <div style={{ fontSize: 11, color: '#ccc', textAlign: 'center', marginTop: 2 }} contentEditable={false}>
            {naturalWidth} × {naturalHeight}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const ImageEnhanced = Node.create({
  name: 'image',
  group: 'block',
  content: '',
  inline: false,
  atom: true,

  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: '' },
      align: { default: 'center' },
      width: { default: 'auto' },
    };
  },

  parseHTML() {
    return [{ tag: 'img[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)];
  },

  // ===== Markdown 往返 =====
  // 实测：不写这几条时 getMarkdown() 把图片节点序列化成了空行（"基底文字\n\n\n\n"），
  // 而文件里的 `![说明](images/a.png)` 读进来只剩 alt 文本、src 整条丢掉 —— 图片在两个
  // 方向上都不落盘，粘贴一张图、自动保存一次，图就永久没了。
  markdownTokenName: 'image',

  markdownTokenizer: {
    name: 'image',
    level: 'block',
    start: (src: string) => src.indexOf('!['),
    tokenize: (src: string) => {
      const m = IMAGE_MD_RE.exec(src);
      if (!m) return undefined;
      // 目标写成 <path> 形式时（路径含空格/括号才需要）把尖括号剥掉再存
      const raw = m[2].replace(/^<(.*)>$/, '$1');
      return {
        type: 'image',
        raw: m[0],
        attributes: {
          src: raw,
          alt: unescapeMd(m[1]),
          ...parseImageMeta(m[3]),
        },
      };
    },
  },

  parseMarkdown: (token: any, h: any) =>
    h.createNode('image', {
      src: token.attributes?.src ?? '',
      alt: token.attributes?.alt ?? '',
      align: token.attributes?.align ?? 'center',
      width: token.attributes?.width ?? 'auto',
    }, []),

  renderMarkdown: (node: any) => {
    const src = node.attrs?.src || '';
    const alt = escapeMd(node.attrs?.alt || '');
    // 路径里有空格或括号时按 CommonMark 用 <...> 包住，否则链接会当场断掉
    const target = /[\s()]/.test(src) ? `<${src}>` : src;
    const meta: string[] = [];
    if (node.attrs?.align && node.attrs.align !== 'center') meta.push(`align=${node.attrs.align}`);
    if (node.attrs?.width && node.attrs.width !== 'auto') meta.push(`width=${node.attrs.width}`);
    // 对齐和拖来的宽度塞进 image title：markdown 本来就支持 `![a](src "t")`，别的渲染器
    // 只当一个提示文字，而我们自己解析时再读回来 —— 不然这个节点的 align/width 一存盘就没
    const title = meta.length ? ` "${meta.join(' ')}"` : '';
    return `![${alt}](${target}${title})`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageEnhancedComponent);
  },

  addCommands() {
    return {
      setImage: (attrs: { src: string; alt?: string; align?: string; width?: string }) => ({ commands }: any) => {
        return commands.insertContent({ type: this.name, attrs });
      },
    } as any;
  },
});
