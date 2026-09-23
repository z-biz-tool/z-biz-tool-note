import { useState, useEffect, useCallback } from 'react';
import { Clock, RotateCcw, X } from 'lucide-react';
import { electronAPI, mustSucceed, errText } from '../lib/electronAPI';
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
  // 只有 loading/ready 两态的话，读失败会永远停在「加载中...」：实测在浏览器模式下
  // 打开这个面板就卡在那儿，既没有原因也没有出路。失败要单独成一态，并给出重试。
  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [loadError, setLoadError] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);

  // 加载备份列表
  const loadBackups = useCallback(async () => {
    if (!notePath) return;
    setPhase('loading');
    try {
      const result = mustSucceed(await electronAPI.invoke('list-backups', notePath));
      setBackups(result.backups || []);
      setPhase('ready');
    } catch (err) {
      console.warn('加载版本历史失败:', errText(err));
      setLoadError(errText(err));
      setPhase('failed');
    }
  }, [notePath]);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  // 预览备份内容
  const handlePreview = useCallback(async (backupPath: string) => {
    try {
      const result = mustSucceed(await electronAPI.invoke('read-file', backupPath));
      // 空正文也是一份合法的备份（新建的笔记第一篇就被清空过），所以"读到没有"用 null 判，
      // 别用 if (preview) —— 那样一份空备份会被当成"还没选版本"，恢复按钮直接不出现
      setPreview(result.content ?? '');
      setPreviewPath(backupPath);
    } catch (err) {
      console.warn('读取备份失败:', errText(err));
      notify(`读取该版本失败（${errText(err)}）`, 'error');
    }
  }, []);

  // 恢复备份
  const handleRestore = useCallback(async () => {
    if (previewPath === null || preview === null) return;
    const ok = await confirmDialog({
      title: '恢复此版本',
      message: '当前编辑中的内容会被这个历史版本替换。',
      confirmText: '恢复',
      danger: true,
    });
    if (!ok) return;
    try {
      // 恢复前先备份当前版本：避免恢复后发现新版本更好，但已经回不去
      try {
        const current = mustSucceed(await electronAPI.invoke('read-file', notePath));
        mustSucceed(await electronAPI.invoke('create-backup', notePath, current.content ?? ''));
      } catch (backupErr) {
        // 备份失败不阻塞恢复，但要先问一句：恢复是不可逆覆盖，不能默默丢掉当前版本
        console.warn('恢复前备份当前版本失败:', errText(backupErr));
        const proceed = await confirmDialog({
          title: '当前版本备份失败',
          message: `无法先备份当前版本（${errText(backupErr)}）。仍要继续恢复吗？`,
          confirmText: '仍要恢复',
          danger: true,
        });
        if (!proceed) return;
      }
      mustSucceed(await electronAPI.invoke('restore-backup', previewPath, notePath));
      onRestore(preview);
      notify('已恢复该版本', 'success');
      onClose();
    } catch (err) {
      console.error('恢复失败:', errText(err));
      notify(`恢复失败（${errText(err)}）`, 'error');
    }
  }, [previewPath, preview, notePath, onRestore, onClose]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="版本历史" onClick={onClose}>
      <div className="version-history-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3><Clock size={16} /> 版本历史</h3>
          <button className="modal-close" onClick={onClose} title="关闭" aria-label="关闭版本历史"><X size={16} /></button>
        </div>
        <div className="version-history-content">
          <div className="version-list">
            {phase === 'loading' ? (
              <div className="version-loading">加载中...</div>
            ) : phase === 'failed' ? (
              <div className="version-empty">
                读不出历史版本（{loadError}）
                <div style={{ marginTop: 8 }}>
                  <button className="btn" onClick={loadBackups}>重试</button>
                </div>
              </div>
            ) : backups.length === 0 ? (
              <div className="version-empty">
                暂无历史版本
                <div style={{ marginTop: 4 }}>保存一次就会留下一个版本</div>
              </div>
            ) : (
              backups.map((backup, i) => (
                <div
                  key={backup.path}
                  role="button"
                  tabIndex={0}
                  className={`version-item ${previewPath === backup.path ? 'active' : ''}`}
                  onClick={() => handlePreview(backup.path)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handlePreview(backup.path);
                    }
                  }}
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
            {preview !== null ? (
              <pre className="version-preview-text">{preview || '（这个版本是空的）'}</pre>
            ) : (
              <div className="version-preview-empty">选择一个版本查看内容</div>
            )}
          </div>
        </div>
        {preview !== null && (
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
