import { TriangleAlert, X } from 'lucide-react';
import type { WalEntry } from '../hooks/useAutoSave';
import { displayName } from '../lib/fileTypes';

interface RecoveryBannerProps {
  entries: WalEntry[];
  onRestore: (entry: WalEntry) => void;
  onRestoreAll: () => void;
  onDiscard: (filePath: string) => void;
  onDiscardAll: () => void;
}

// 恢复之后标签就叫这个名，所以沿用同一套显示名规则
const nameOf = (filePath: string) => displayName(filePath) || filePath;

const formatAgo = (ts: number): string => {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return '刚刚';
  if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小时前`;
  return `${Math.floor(sec / 86400)} 天前`;
};

/**
 * 未保存内容恢复横幅。
 *
 * 保存失败时内容会落到 localStorage 的 WAL（见 useAutoSave.walStore），
 * 这里提供把它取回/丢弃的入口——否则那些内容就只是一份没人看的副本。
 */
export const RecoveryBanner = ({
  entries, onRestore, onRestoreAll, onDiscard, onDiscardAll,
}: RecoveryBannerProps) => {
  if (entries.length === 0) return null;

  return (
    <div className="recovery-banner" role="alert">
      <div className="recovery-banner-head">
        <TriangleAlert size={15} />
        <span>
          有 <b>{entries.length}</b> 篇内容未写入磁盘（保存失败或应用被强制退出）
        </span>
        <span className="recovery-banner-actions">
          <button className="recovery-btn recovery-btn-primary" onClick={onRestoreAll}>
            全部恢复
          </button>
          <button className="recovery-btn" onClick={onDiscardAll} title="清空本地暂存副本">
            全部丢弃
          </button>
        </span>
      </div>
      <ul className="recovery-list">
        {entries.map(e => (
          <li key={e.filePath} className="recovery-item">
            <button className="recovery-item-name" onClick={() => onRestore(e)} title={e.filePath}>
              {nameOf(e.filePath)}
            </button>
            <span className="recovery-item-meta">
              {formatAgo(e.ts)} · {(e.content.length / 1024).toFixed(1)}KB
            </span>
            <button className="recovery-item-restore" onClick={() => onRestore(e)}>
              恢复
            </button>
            <button className="recovery-item-discard" onClick={() => onDiscard(e.filePath)} aria-label={`丢弃 ${nameOf(e.filePath)}`}>
              <X size={13} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
