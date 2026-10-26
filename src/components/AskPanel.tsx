import { useCallback, useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  Send, Loader2, BookOpenText, FileText, Layers, ArrowUpRight, AlertCircle, ScanSearch,
} from 'lucide-react';
import type { AIConfig } from '../types';
import { electronAPI } from '../lib/electronAPI';

// 问笔记（RAG）：语料是用户自己的笔记库，检索在 Rust 侧（rag 模块 + BM25），
// 这里只负责「提问 → 流式渲染 → 引用回跳」。

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

interface Citation {
  path: string;
  title: string;
  heading: string;
  anchor: string;
  text: string;
  score: number;
  no: number;
}

/** 一次提问-回答对（含引用与流式状态） */
interface Exchange {
  question: string;
  answer: string;
  citations: Citation[];
  error?: string;
  /** 引用是否已经收到（模型开始说话前就能点来源） */
  streaming?: boolean;
}

interface AskPanelProps {
  aiConfig: AIConfig;
  /** 当前笔记（「只问这篇」用）；null 时禁用该档位 */
  currentNote: { filePath: string; title: string } | null;
  enabled: boolean;
  ragStatus: { notes: number; chunks: number } | null;
  onOpenSettings: () => void;
  onReveal: (path: string, anchor: string) => void;
}

/**
 * 把回答里的 [1] [2] 标记拆成可点击的引用角标。
 * 没有对应编号的标记按普通文本保留 —— 模型偶尔会标错号，不能让它变成按钮后点击即报错。
 */
function AnswerBody({ text, citations, onReveal }: {
  text: string;
  citations: Citation[];
  onReveal: AskPanelProps['onReveal'];
}) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <div className="ask-answer-body">
      {parts.map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/);
        if (!m) return <span key={i}>{part}</span>;
        const no = Number(m[1]);
        const cite = citations.find(c => c.no === no);
        if (!cite) return <span key={i}>{part}</span>;
        return (
          <button
            key={i}
            className="ask-cite-chip"
            title={`${cite.title} · ${cite.heading}`}
            onClick={() => onReveal(cite.path, cite.anchor)}
          >
            {no}
          </button>
        );
      })}
    </div>
  );
}

export const AskPanel = ({
  aiConfig, currentNote, enabled, ragStatus, onOpenSettings, onReveal,
}: AskPanelProps) => {
  const [scope, setScope] = useState<'all' | 'note'>('all');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  // 流式 token 拼进「最后一条回答」时用 ref 找位置，避免闭包里的旧 state
  const streamingRef = useRef(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [exchanges, busy]);

  /** 统一修改最后一条 exchange */
  const patchLast = useCallback((patch: Partial<Exchange>) => {
    setExchanges(prev => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[next.length - 1] = { ...next[next.length - 1], ...patch };
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isTauri) return;
    const unlistens: Array<() => void> = [];
    const reg = async () => {
      unlistens.push(await listen<string>('ask://token', (e) => {
        streamingRef.current = true;
        setExchanges(prev => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, answer: last.answer + e.payload, streaming: true };
          return next;
        });
      }));
      unlistens.push(await listen<unknown>('ask://citations', (e) => {
        const cites = (e.payload as Citation[]) || [];
        patchLast({ citations: cites });
      }));
      unlistens.push(await listen<{ answer: string; citations: Citation[] }>('ask://done', (e) => {
        patchLast({ answer: e.payload.answer, citations: e.payload.citations || [], streaming: false });
        setBusy(false);
      }));
      unlistens.push(await listen<string>('ask://error', (e) => {
        patchLast({ error: String(e.payload), streaming: false });
        setBusy(false);
      }));
    };
    void reg();
    return () => { unlistens.forEach(u => u()); };
  }, [patchLast]);

  const ask = useCallback(async () => {
    const q = input.trim();
    if (!q || busy) return;
    if (!enabled) { onOpenSettings(); return; }

    setInput('');
    setBusy(true);
    streamingRef.current = false;
    setExchanges(prev => [...prev, { question: q, answer: '', citations: [], streaming: true }]);

    // 事件监听已挂好（useEffect），这里发起提问。
    // 注意：done/error 事件与 invoke 的返回任选其一处理即可，两个都兜是为了
    // 防止事件在 promise resolve 之前到达导致 busy 卡死。
    if (!isTauri) {
      // 浏览器演示区：走一条假链路，让面板的交互与引用样式可以脱后端验证
      await new Promise(r => setTimeout(r, 500));
      patchLast({
        streaming: false,
        answer: '这是浏览器演示区的示例回答 [1]。索引、检索与模型调用都在 Tauri 侧，装到桌面端后这里就是真实的回答。',
        citations: [{
          path: 'demo/Welcome.md', title: 'Welcome', heading: '目录',
          anchor: '这是浏览器演示区', text: '浏览器演示区的假引用，点「跳转」可以验证引用卡片的交互。', score: 1, no: 1,
        }],
      });
      setBusy(false);
      return;
    }

    try {
      // 走桥层（与全仓其它通道一致）；事件监听已挂好，流式增量从 ask://token 到
      await electronAPI.invoke('ask-notes', q, scope, scope === 'note' ? currentNote?.filePath ?? null : null, aiConfig);
      // invoke 正常返回时 done 事件已经把 streaming 置 false；这里兜底
      setBusy(false);
    } catch (e: unknown) {
      patchLast({ error: String((e as Error)?.message || e), streaming: false });
      setBusy(false);
    }
  }, [input, busy, enabled, scope, currentNote, aiConfig, onOpenSettings, patchLast]);

  const scopeReady = scope === 'all' || !!currentNote;

  return (
    <div className="ask-panel">
      {!enabled && (
        <div className="ai-disabled-notice">
          <p>问笔记需要先配置 AI 服务。</p>
          <button className="btn-primary" onClick={onOpenSettings}>去配置</button>
        </div>
      )}

      <div className="ask-toolbar">
        <div className="ask-scope" role="tablist" aria-label="提问范围">
          <button
            className={scope === 'all' ? 'active' : ''}
            onClick={() => setScope('all')}
            title="在整个笔记库里检索"
          >
            <Layers size={13} />
            全部笔记
          </button>
          <button
            className={scope === 'note' ? 'active' : ''}
            disabled={!currentNote}
            onClick={() => setScope('note')}
            title={currentNote ? `只检索《${currentNote.title}》` : '先打开一篇笔记'}
          >
            <FileText size={13} />
            当前笔记
          </button>
        </div>
        {ragStatus && ragStatus.chunks > 0 && (
          <span className="ask-corpus" title="已建立检索索引的规模">
            <BookOpenText size={12} />
            {ragStatus.notes} 篇 · {ragStatus.chunks} 段
          </span>
        )}
      </div>

      <div className="ask-thread">
        {exchanges.length === 0 && (
          <div className="ask-empty">
            <ScanSearch size={22} />
            <p className="ask-empty-title">问自己的笔记</p>
            <p className="ask-empty-desc">
              用自然语言提问，回答会带上出处，点引用就能跳回原文。
            </p>
            <div className="ask-suggestions">
              {['我上个月记过哪些关于部署的坑？', '项目里程碑定在什么时候？', '这篇笔记的结论是什么？'].map(s => (
                <button key={s} className="ask-suggestion" onClick={() => setInput(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {exchanges.map((ex, i) => (
          <div className="ask-exchange" key={i}>
            <div className="ask-question">{ex.question}</div>
            {ex.error ? (
              <div className="ask-error">
                <AlertCircle size={13} />
                <span>{ex.error}</span>
              </div>
            ) : (
              <>
                {ex.answer ? (
                  <AnswerBody text={ex.answer} citations={ex.citations} onReveal={onReveal} />
                ) : ex.streaming ? (
                  <div className="ask-thinking"><Loader2 size={13} className="spin" /> 检索并思考中…</div>
                ) : null}
                {ex.citations.length > 0 && (
                  <div className="ask-citations">
                    {ex.citations.map(c => (
                      <button
                        key={`${c.path}-${c.no}`}
                        className="ask-citation"
                        title={c.text}
                        onClick={() => onReveal(c.path, c.anchor)}
                      >
                        <span className="ask-citation-no">[{c.no}]</span>
                        <span className="ask-citation-meta">
                          <span className="ask-citation-title">{c.title}</span>
                          {c.heading && c.heading !== c.title && (
                            <span className="ask-citation-heading">{c.heading}</span>
                          )}
                        </span>
                        <span className="ask-citation-score" style={{ width: `${Math.round(c.score * 100)}%` }} />
                        <ArrowUpRight size={12} />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="ask-input-row">
        <textarea
          value={input}
          rows={1}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(); }
          }}
          placeholder={
            !enabled ? '先在设置里配置 AI…'
            : scope === 'note' && currentNote ? `就《${currentNote.title}》提问…`
            : '问点笔记里记过的东西…'
          }
          disabled={busy || !scopeReady}
        />
        <button className="btn-primary ask-send" onClick={() => void ask()} disabled={busy || !input.trim() || !scopeReady}>
          {busy ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  );
};
