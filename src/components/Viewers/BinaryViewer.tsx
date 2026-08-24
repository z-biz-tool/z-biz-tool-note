import { baseName } from '../../lib/fileTypes';
import { FileQuestion, ExternalLink } from 'lucide-react';

interface Props {
  filePath: string;
  size: number;
  modified: string;
  mime: string;
}

export const BinaryViewer = ({ filePath, size, modified, mime }: Props) => {
  const name = baseName(filePath);
  return (
    <div className="viewer binary-viewer">
      <div className="viewer-toolbar">
        <span className="viewer-title" title={filePath}>📦 {name}</span>
        <span className="toolbar-label">{mime}</span>
      </div>
      <div className="viewer-body binary-viewer-body">
        <FileQuestion size={48} className="binary-icon" />
        <h2>此文件类型暂不支持预览</h2>
        <table className="binary-meta">
          <tbody>
            <tr><th>文件名</th><td>{name}</td></tr>
            <tr><th>大小</th><td>{formatSize(size)}</td></tr>
            <tr><th>类型</th><td>{mime}</td></tr>
            <tr><th>修改时间</th><td>{modified}</td></tr>
            <tr><th>完整路径</th><td className="mono">{filePath}</td></tr>
          </tbody>
        </table>
        <a className="text-btn" href="#" onClick={async (e) => {
          e.preventDefault();
          // 调系统"在 finder 中显示"
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('show_in_folder', { path: filePath });
          } catch { /* noop */ }
        }}>
          <ExternalLink size={14} /> 在文件管理器中显示
        </a>
      </div>
    </div>
  );
};

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}
