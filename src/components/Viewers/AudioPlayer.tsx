import { baseName } from '../../lib/fileTypes';

interface Props {
  filePath: string;
  dataUrl: string;
  mime: string;
}

export const AudioPlayer = ({ filePath, dataUrl, mime }: Props) => {
  const name = baseName(filePath);
  return (
    <div className="viewer audio-viewer">
      <div className="viewer-toolbar">
        <span className="viewer-title" title={filePath}>🎵 {name}</span>
        <span className="toolbar-label">{mime}</span>
      </div>
      <div className="viewer-body audio-viewer-body">
        <div className="audio-viewer-cover">🎵</div>
        <audio controls className="audio-viewer-audio" preload="metadata">
          <source src={dataUrl} type={mime} />
          您的浏览器不支持 HTML5 音频标签。
        </audio>
        <div className="audio-viewer-name">{name}</div>
      </div>
    </div>
  );
};
