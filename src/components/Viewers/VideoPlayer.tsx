import { baseName } from '../../lib/fileTypes';

interface Props {
  filePath: string;
  dataUrl: string;
  mime: string;
}

export const VideoPlayer = ({ filePath, dataUrl, mime }: Props) => {
  const name = baseName(filePath);
  return (
    <div className="viewer video-viewer">
      <div className="viewer-toolbar">
        <span className="viewer-title" title={filePath}>🎬 {name}</span>
        <span className="toolbar-label">{mime}</span>
      </div>
      <div className="viewer-body video-viewer-body">
        <video controls className="video-viewer-video" preload="metadata">
          <source src={dataUrl} type={mime} />
          您的浏览器不支持 HTML5 视频标签。
        </video>
      </div>
    </div>
  );
};
