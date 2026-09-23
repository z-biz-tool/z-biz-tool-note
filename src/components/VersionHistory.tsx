import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Clock, RotateCcw, X, Trash2 } from 'lucide-react';
import { confirmDialog, notify } from '../lib/dialogs';

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
    const ok = await confirmDialog({
      title: '恢复此版本',
      message: '当前编辑中的内容会被这个历史版本替换。',
      confirmText: '恢复',
      danger: true,
    });
    if (!ok) return;
    try {
      // 恢复前先备份当前版本：避免恢复后发现新版本更好，但已经回不去
      // 这里依赖后端 create_backup 已经在 lib.rs 用 atomic_write 写入
      try {
        // 当前文件内容未必在 props 中；直接通过 read_file 拉取
        const current = await invoke<string>('read_file', { path: notePath });
        await invoke('create_backup', { notePath, content: current });
      } catch (backupErr) {
        // 备份失败不阻塞恢复，但要先问一句：恢复是不可逆覆盖，不能默默丢掉当前版本
        console.warn('恢复前备份当前版本失败:', backupErr);
        const proceed = await confirmDialog({
          title: '当前版本备份失败',
          message: `无法先备份当前版本（${backupErr}）。仍要继续恢复吗？`,
          confirmText: '仍要恢复',
          danger: true,
        });
        if (!proceed) return;
      }
      await invoke('restore_backup', { backupPath: previewPath, targetPath: notePath });
      if (preview) onRestore(preview);
      notify('已恢复该版本', 'success');
      onClose();
    } catch (err) {
      console.error('恢复失败:', err);
      notify('恢复失败: ' + err, 'error');
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
