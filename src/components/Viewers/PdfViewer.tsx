import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, Loader2 } from 'lucide-react';
import { baseName } from '../../lib/fileTypes';

// vite ?url import: 让 worker bundle 跟主程序走,避免跨域
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker;

interface Props {
  filePath: string;
  dataUrl: string;
  mime: string;
}

export const PdfViewer = ({ filePath, dataUrl }: Props) => {
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [scale, setScale] = useState(1.25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const name = baseName(filePath);

  // 加载 PDF 文档
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPageNum(1);
    setPdf(null);
    pdfjsLib.getDocument({ url: dataUrl }).promise
      .then(doc => { if (!cancelled) { setPdf(doc); setLoading(false); } })
      .catch(err => { if (!cancelled) { setError(String(err)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [dataUrl]);

  // 渲染当前页
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;
    pdf.getPage(pageNum).then(page => {
      if (cancelled || !canvasRef.current) return;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      renderTask = page.render({ canvas, canvasContext: ctx, viewport });
      return renderTask.promise;
    }).catch(err => {
      if (!cancelled) console.error('PDF 渲染失败:', err);
    });
    return () => {
      cancelled = true;
      if (renderTask) renderTask.cancel();
    };
  }, [pdf, pageNum, scale]);

  if (loading) {
    return (
      <div className="viewer pdf-viewer">
        <div className="viewer-toolbar"><span className="viewer-title">📕 {name}</span></div>
        <div className="viewer-body pdf-loading"><Loader2 className="spin" size={32} /> 加载 PDF…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="viewer pdf-viewer">
        <div className="viewer-toolbar"><span className="viewer-title">📕 {name}</span></div>
        <div className="viewer-body pdf-loading">PDF 加载失败: {error}</div>
      </div>
    );
  }
  if (!pdf) return null;

  const totalPages = pdf.numPages;
  return (
    <div className="viewer pdf-viewer">
      <div className="viewer-toolbar">
        <span className="viewer-title" title={filePath}>📕 {name}</span>
        <div className="viewer-toolbar-right">
          <button className="toolbar-btn" onClick={() => setPageNum(p => Math.max(1, p - 1))} disabled={pageNum <= 1} title="上一页">
            <ChevronLeft size={16} />
          </button>
          <span className="toolbar-label">
            <input
              type="number"
              className="pdf-page-input"
              value={pageNum}
              min={1}
              max={totalPages}
              onChange={e => {
                const n = Math.max(1, Math.min(totalPages, parseInt(e.target.value) || 1));
                setPageNum(n);
              }}
            />
            / {totalPages}
          </span>
          <button className="toolbar-btn" onClick={() => setPageNum(p => Math.min(totalPages, p + 1))} disabled={pageNum >= totalPages} title="下一页">
            <ChevronRight size={16} />
          </button>
          <button className="toolbar-btn" onClick={() => setScale(s => Math.max(0.25, s - 0.25))} title="缩小">
            <ZoomOut size={16} />
          </button>
          <span className="toolbar-label">{Math.round(scale * 100)}%</span>
          <button className="toolbar-btn" onClick={() => setScale(s => Math.min(5, s + 0.25))} title="放大">
            <ZoomIn size={16} />
          </button>
          <a className="toolbar-btn" href={dataUrl} download={name} title="下载 PDF">
            <Download size={16} />
          </a>
        </div>
      </div>
      <div className="viewer-body pdf-viewer-body">
        <canvas ref={canvasRef} className="pdf-canvas" />
      </div>
    </div>
  );
};
