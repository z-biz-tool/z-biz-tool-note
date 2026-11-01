/**
 * 「转为笔记」按钮 —— 外部文档（pdf/docx）查看器共用。
 *
 * 背景：docx/pdf 在查看器里只是**只读预览**，BM25 索引和问笔记（RAG）都
 * 吃不到它们；真正进语料库的唯一通道是转成 Markdown 笔记（原 kb 仓
 * 「上传文档问答」的承接入口，解析在 Rust 侧 cap-doc）。
 *
 * 成功后用 notify 弹提示；打开新导入笔记由用户在笔记列表里点
 * （导入命令返回的是笔记库内的 id，与工作区文件树是两套定位体系，
 * 强行替用户跳转反而容易落空 —— 列表刷新由既有的索引/watcher 链路负责）。
 */
import { useState } from 'react';
import { FilePlus2, Loader2 } from 'lucide-react';
import { electronAPI } from '../../lib/electronAPI';
import { notify } from '../../lib/dialogs';

export const ImportAsNoteButton = ({ filePath }: { filePath: string }) => {
  const [busy, setBusy] = useState(false);

  const importAsNote = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await electronAPI.invoke('import-document', filePath);
      if (res.success) {
        notify(`已导入为笔记，在笔记列表查看（${res.noteId}）`, 'success');
      } else {
        notify(res.error || '导入失败', 'error');
      }
    } catch (e: any) {
      notify(e?.message || String(e) || '导入失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      className="viewer-import-btn"
      onClick={importAsNote}
      disabled={busy}
      title="转成 Markdown 笔记后才能被检索和「问笔记」引用"
    >
      {busy ? <Loader2 className="spin" size={14} /> : <FilePlus2 size={14} />}
      {busy ? '导入中…' : '转为笔记'}
    </button>
  );
};
