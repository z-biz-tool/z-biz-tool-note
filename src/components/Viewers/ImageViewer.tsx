import { useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Download } from 'lucide-react';
import { baseName } from '../../lib/fileTypes';

interface Props {
  filePath: string;
  dataUrl: string;
  mime: string;
}

export const ImageViewer = ({ filePath, dataUrl, mime }: Props) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const name = baseName(filePath);

  return (
    <div className="viewer image-viewer">
      <div className="viewer-toolbar">
        <span className="viewer-title" title={filePath}>🖼 {name}</span>
        <div className="viewer-toolbar-right">
          <button className="toolbar-btn" onClick={() => setZoom(z => Math.max(0.1, z - 0.25))} title="缩小">
            <ZoomOut size={16} />
          </button>
          <span className="toolbar-label">{Math.round(zoom * 100)}%</span>
          <button className="toolbar-btn" onClick={() => setZoom(z => Math.min(10, z + 0.25))} title="放大">
            <ZoomIn size={16} />
          </button>
          <button className="toolbar-btn" onClick={() => setRotation(r => (r + 90) % 360)} title="旋转 90°">
            <RotateCcw size={16} />
          </button>
          <a className="toolbar-btn" href={dataUrl} download={name} title="下载原图">
            <Download size={16} />
          </a>
        </div>
      </div>
      <div className="viewer-body image-viewer-body">
        <img
          src={dataUrl}
          alt={name}
          className="image-viewer-img"
          style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
          draggable={false}
        />
      </div>
    </div>
  );
};
