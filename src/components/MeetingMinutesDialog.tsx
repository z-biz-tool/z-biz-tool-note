import { useState, useEffect } from 'react';
import { X, AudioLines, Loader2, FileText, Save } from 'lucide-react';
import type { AIConfig } from '../types';
import { electronAPI, errText } from '../lib/electronAPI';

/**
 * 会议纪要：选音频 → 转写（cap-llm）→ 结构化纪要（cap-meeting）→ 预览 → 存成笔记。
 *
 * ## 为什么不塞进 AIPanel 的 ACTIONS
 *
 * AIPanel 那四个动作都是「处理**当前这篇笔记**的文本」，输入是已打开的正文。
 * 会议纪要的输入是一段**音频文件**，且要先弹文件选择、填转写参数、再预览落盘 ——
 * 生命周期和交互形态都与那四个不同，硬塞进去只会让两边都别扭。所以独立成对话框。
 *
 * ## 转写模型独立于对话模型
 *
 * `aiConfig.model` 是对话模型（纪要生成那一步用它）。转写要的是 `whisper-1`
 * 这类 ASR 模型，同一个 provider 的两者几乎从不相同。所以这里单独一栏让用户填，
 * 默认 `whisper-1` —— 复用对话模型会打到一个必然 400 的端点上。
 *
 * 文案沿用 AIPanel 的惯例：纯中文，不走 i18n（这块还没接入词条表）。
 */
interface MeetingMinutesDialogProps {
  open: boolean;
  aiConfig: AIConfig;
  /** 当前笔记库根目录：保存路径要用它拼前缀（与 handleCreateDaily 同一口径）。 */
  currentDir: string;
  /** 落盘并打开：由 App 提供（复用 createAndOpenNote 的范式）。title 用于 tab 标题。 */
  onSaveNote: (filePath: string, content: string, okToast?: string, title?: string) => Promise<void>;
  /** 保存成功后刷新文件树/知识索引（与 handleCreateDaily 一致）。 */
  onSaved?: () => void;
  onClose: () => void;
}

const AUDIO_EXT_HINT = '支持 mp3 / m4a / wav / webm / ogg / flac / aac / mp4';

export const MeetingMinutesDialog = ({
  open, aiConfig, currentDir, onSaveNote, onSaved, onClose,
}: MeetingMinutesDialogProps) => {
  const [audioPath, setAudioPath] = useState('');
  const [asrModel, setAsrModel] = useState('whisper-1');
  const [language, setLanguage] = useState('zh');
  const [title, setTitle] = useState('');
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [busy, setBusy] = useState<'generate' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okText, setOkText] = useState<string | null>(null);

  // 每次打开都从干净状态开始：否则上一次的失败/预览会跟着出现在下次打开的界面上，
  // 用户会以为刚刚又跑了一次。
  useEffect(() => {
    if (open) {
      setAudioPath('');
      setAsrModel('whisper-1');
      setLanguage('zh');
      setTitle('');
      setMarkdown(null);
      setBusy(null);
      setError(null);
      setOkText(null);
    }
  }, [open]);

  const pickAudio = async () => {
    try {
      const r = (await electronAPI.invoke('pick-audio-file')) as {
        canceled: boolean;
        filePath?: string;
      };
      if (!r?.canceled && r.filePath) {
        setAudioPath(r.filePath);
        setError(null);
        // 没填标题时，用文件名（去扩展名）当默认会议主题，省一次手输。
        if (!title.trim()) {
          const base = r.filePath.split(/[\\/]/).pop() || '';
          setTitle(base.replace(/\.[^.]+$/, ''));
        }
      }
    } catch (e) {
      setError(errText(e));
    }
  };

  const generate = async () => {
    if (!audioPath) {
      setError('请先选择一段音频文件');
      return;
    }
    if (!asrModel.trim()) {
      setError('请填写转写模型名（如 whisper-1）');
      return;
    }
    setBusy('generate');
    setError(null);
    setOkText(null);
    setMarkdown(null);
    try {
      const r = (await electronAPI.invoke(
        'minutes-from-audio',
        audioPath,
        asrModel.trim(),
        language.trim() || undefined,
        title.trim() || undefined,
        aiConfig,
      )) as { success: boolean; markdown?: string; error?: string };
      if (r?.success && r.markdown != null) {
        setMarkdown(r.markdown);
      } else {
        setError(r?.error || '生成会议纪要失败');
      }
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  const saveAsNote = async () => {
    if (!markdown) return;
    if (!currentDir) {
      setError('请先打开一个文件夹，再保存会议纪要');
      return;
    }
    setBusy('save');
    setError(null);
    try {
      const fileName = (title.trim() || '会议纪要').replace(/[/\\:*?"<>|]/g, '_');
      // 落在当前笔记库根目录下，文件名用会议主题（与「今日日记」同一范式：
      // 那条是 `${dir}/Daily/…`，这里根目录即可，纪要本身是独立一篇）。
      // 路径必须带目录前缀 —— onSaveNote 内部靠 lastIndexOf('/') 取目录再 ensure-dir。
      const filePath = `${currentDir}/${fileName}.md`;
      // 把标题一并传下去：tab 标题要用会议主题，而不是 createAndOpenNote 的
      // 默认 todayTitle()（那会让纪要 tab 显示成今天的日期）。
      await onSaveNote(filePath, markdown, '会议纪要已保存', title.trim() || '会议纪要');
      setOkText('已保存为笔记');
      onSaved?.();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="会议纪要" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>从音频生成会议纪要</h2>
          <button className="toolbar-btn" onClick={onClose} aria-label="关闭"><X size={16} /></button>
        </div>

        <div className="modal-body">
          <div className="settings-form">
            <p className="settings-hint">
              选择一段录音，先转写成文字，再整理成含议题 / 决议 / 待办的纪要，最后存成一篇笔记。
            </p>

            <label className="settings-label">
              <span>音频文件</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn-secondary" onClick={pickAudio} disabled={busy !== null}>
                  <AudioLines size={14} /> 选择音频…
                </button>
                <span style={{ color: 'var(--text-secondary, #888)', fontSize: 12, wordBreak: 'break-all' }}>
                  {audioPath || AUDIO_EXT_HINT}
                </span>
              </div>
            </label>

            <label className="settings-label">
              <span>转写模型</span>
              <input
                type="text"
                value={asrModel}
                onChange={(e) => setAsrModel(e.target.value)}
                placeholder="whisper-1"
                disabled={busy !== null}
              />
              <span className="settings-hint">
                转写用的语音模型（如 whisper-1），与设置里的对话模型无关。
              </span>
            </label>

            <label className="settings-label">
              <span>语言</span>
              <input
                type="text"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="zh"
                disabled={busy !== null}
              />
              <span className="settings-hint">
                填 ISO-639-1 代码（zh / en）。填了能显著提升准确率，留空由服务端自动检测。
              </span>
            </label>

            <label className="settings-label">
              <span>会议主题（可选）</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="留空则由模型推断"
                disabled={busy !== null}
              />
            </label>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn-primary" onClick={generate} disabled={busy !== null || !audioPath}>
                {busy === 'generate' ? <Loader2 size={14} className="spin" /> : <FileText size={14} />}
                生成纪要
              </button>
              {busy === 'generate' && <span style={{ fontSize: 12, color: 'var(--text-secondary, #888)' }}>正在转写并整理…</span>}
            </div>

            {error && (
              <p style={{ color: 'var(--error, #d33)', fontSize: 13, whiteSpace: 'pre-wrap' }}>{error}</p>
            )}
            {okText && (
              <p style={{ color: 'var(--success, #2a7)', fontSize: 13 }}>{okText}</p>
            )}

            {markdown && (
              <div style={{ marginTop: 8 }}>
                <label className="settings-label">
                  <span>预览</span>
                </label>
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: 280,
                    overflow: 'auto',
                    padding: 12,
                    borderRadius: 8,
                    background: 'var(--bg-secondary, #f6f6f7)',
                    fontSize: 13,
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  {markdown}
                </pre>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>关闭</button>
          <button className="btn-primary" onClick={saveAsNote} disabled={busy !== null || !markdown}>
            {busy === 'save' ? <Loader2 size={14} className="spin" /> : <Save size={14} />} 存为笔记
          </button>
        </div>
      </div>
    </div>
  );
};
