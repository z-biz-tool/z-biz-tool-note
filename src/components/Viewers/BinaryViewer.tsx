import { baseName } from '../../lib/fileTypes';
import { electronAPI, errText } from '../../lib/electronAPI';
import { notify } from '../../lib/dialogs';
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
          // ⚠ 不要静默吞掉错误：这里原来是 `catch { /* noop */ }`，
          // 而后端**压根没注册 show_in_folder** ⇒ 用户点了没有任何反应、
          // 也没有任何提示（"界面说能做、事实是啥也没发生"）。
          if (!electronAPI.isTauri) {
            notify('浏览器模式下无法调用系统文件管理器，请在桌面应用里使用', 'error');
            return;
          }
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('show_in_folder', { path: filePath });
          } catch (err) {
            notify(`在文件管理器中显示失败：${errText(err)}`, 'error');
          }
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
