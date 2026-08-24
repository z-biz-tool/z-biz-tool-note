import { useEffect, useState } from 'react';
import mammoth from 'mammoth';
import { baseName } from '../../lib/fileTypes';
import { Loader2 } from 'lucide-react';

interface Props {
  filePath: string;
  dataUrl: string;
  mime: string;
}

// dataUrl (base64) -> ArrayBuffer
function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const b64 = dataUrl.split(',')[1] || '';
  const bin = atob(b64);
  const len = bin.length;
  const buf = new ArrayBuffer(len);
  const view = new Uint8Array(buf);
  for (let i = 0; i < len; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

export const DocxViewer = ({ filePath, dataUrl }: Props) => {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = baseName(filePath);

  useEffect(() => {
    let cancelled = false;
    const buf = dataUrlToArrayBuffer(dataUrl);
    mammoth.convertToHtml({ arrayBuffer: buf })
      .then(res => { if (!cancelled) setHtml(res.value); })
      .catch(err => { if (!cancelled) setError(String(err)); });
    return () => { cancelled = true; };
  }, [dataUrl]);

  return (
    <div className="viewer docx-viewer">
      <div className="viewer-toolbar">
        <span className="viewer-title" title={filePath}>📝 {name}</span>
        <span className="toolbar-label">Word 文档</span>
      </div>
      <div className="viewer-body docx-viewer-body">
        {error && <div className="docx-error">解析失败: {error}</div>}
        {!error && !html && <div className="docx-loading"><Loader2 className="spin" size={32} /> 解析 Word…</div>}
        {html && <div className="docx-content" dangerouslySetInnerHTML={{ __html: html }} />}
      </div>
    </div>
  );
};
