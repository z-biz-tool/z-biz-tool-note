import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Clock, RotateCcw, X, Trash2 } from 'lucide-react';

interface BackupEntry {
  path: string;
  timestamp: string;
  modified: string;
}

interface VersionHistoryProps {
  notePath: string;
  onRestore: (content: string) => void;
  onClose: () => void;
}

export default function VersionHistory({ notePath, onRestore, onClose }: VersionHistoryProps) {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);

  // 加载备份列表
  useEffect(() => {
    if (!notePath) return;
    setLoading(true);
    invoke<BackupEntry[]>('list_backups', { notePath })
      .then(setBackups)
      .catch(err => console.warn('加载版本历史失败:', err))
      .finally(() => setLoading(false));
  }, [notePath]);

  // 预览备份内容
  const handlePreview = useCallback(async (backupPath: string) => {
    try {
      const content = await invoke<string>('read_file', { path: backupPath });
      setPreview(content);
      setPreviewPath(backupPath);
    } catch (err) {
      console.warn('读取备份失败:', err);
    }
  }, []);

  // 恢复备份
  const handleRestore = useCallback(async () => {
    if (!previewPath || !notePath) return;
    if (!window.confirm('确定恢复此版本？当前内容将被替换。')) return;
    try {
      await invoke('restore_backup', { backupPath: previewPath, targetPath: notePath });
      if (preview) onRestore(preview);
      onClose();
    } catch (err) {
      console.error('恢复失败:', err);
      alert('恢复失败: ' + err);
    }
  }, [previewPath, notePath, preview, onRestore, onClose]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="版本历史" onClick={onClose}>
      <div className="version-history-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3><Clock size={16} /> 版本历史</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="version-history-content">
          <div className="version-list">
            {loading ? (
              <div className="version-loading">加载中...</div>
            ) : backups.length === 0 ? (
              <div className="version-empty">暂无历史版本</div>
            ) : (
              backups.map((backup, i) => (
                <div
                  key={backup.timestamp}
                  className={`version-item ${previewPath === backup.path ? 'active' : ''}`}
                  onClick={() => handlePreview(backup.path)}
                >
                  <Clock size={12} />
                  <div className="version-info">
                    <span className="version-time">{backup.modified}</span>
                    <span className="version-label">{i === 0 ? '最新' : `版本 ${backups.length - i}`}</span>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="version-preview">
            {preview ? (
              <pre className="version-preview-text">{preview}</pre>
            ) : (
              <div className="version-preview-empty">选择一个版本查看内容</div>
            )}
          </div>
        </div>
        {preview && (
          <div className="modal-footer">
            <button className="btn btn-primary" onClick={handleRestore}>
              <RotateCcw size={14} /> 恢复此版本
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
