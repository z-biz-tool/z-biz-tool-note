import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Loader2, FileText, Tag, ListTree, MessageSquare, Network } from 'lucide-react';
import type { AIMessage } from '../types';

interface AIPanelProps {
  onAction: (action: AIAction, context?: string, history?: AIMessage[]) => Promise<string>;
  /**
   * 流式对话（可选）。给了就走流式：逐 token 回调增量，最后 resolve 完整文本。
   * 不给就退回整段模式（`onAction('chat', …)`）—— 浏览器演示区没有 Tauri 事件通道，
   * 那里只能整段。
   */
  onStreamChat?: (
    userMsg: string,
    history: AIMessage[],
    onDelta: (delta: string) => void,
  ) => Promise<string>;
  onInsert: (text: string) => void;
  onClose: () => void;
  enabled: boolean;
  onOpenSettings: () => void;
  width?: number;
}

export type AIAction = 'summarize' | 'tags' | 'outline' | 'suggest-links' | 'chat';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const ACTIONS: Array<{ id: AIAction; label: string; icon: any; desc: string }> = [
  { id: 'summarize', label: '总结要点', icon: FileText, desc: '把当前笔记压缩成几条要点' },
  { id: 'tags', label: '提取标签', icon: Tag, desc: '为这篇笔记建议 #标签' },
  { id: 'outline', label: '生成大纲', icon: ListTree, desc: '生成结构化的大纲' },
  { id: 'suggest-links', label: '推荐双链', icon: Network, desc: '推荐指向其他笔记的 [[双链]]' },
];

export const AIPanel = ({ onAction, onStreamChat, onInsert, onClose, enabled, onOpenSettings, width }: AIPanelProps) => {
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<AIAction | null>(null);
  // 流式进行中的正文（还没进 chat 列表 —— 收完再整条进去，避免半截历史）
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat, loading, streamingText]);

  const runAction = async (action: AIAction) => {
    if (!enabled) {
      onOpenSettings();
      return;
    }
    setLoading(true);
    setBusyAction(action);
    try {
      const result = await onAction(action);
      setChat(prev => [...prev, { role: 'assistant', content: result }]);
    } catch (e: any) {
      setChat(prev => [...prev, { role: 'assistant', content: `请求失败：${e.message || e}` }]);
    } finally {
      setLoading(false);
      setBusyAction(null);
    }
  };

  const sendChat = async () => {
    if (!input.trim() || loading) return;
    if (!enabled) {
      onOpenSettings();
      return;
    }
    const userMsg = input.trim();
    setChat(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setLoading(true);
    setBusyAction('chat');
    // 传最近 10 条对话历史
    const history = chat
      .map(m => ({ role: m.role, content: m.content }) as AIMessage)
      .slice(-10);
    try {
      if (onStreamChat) {
        // 流式：先把正文逐 token 显示出来，收完再整条进历史
        setStreamingText('');
        const result = await onStreamChat(userMsg, history, (delta) => {
          setStreamingText(prev => (prev ?? '') + delta);
        });
        setChat(prev => [...prev, { role: 'assistant', content: result }]);
      } else {
        const result = await onAction('chat', userMsg, history);
        setChat(prev => [...prev, { role: 'assistant', content: result }]);
      }
    } catch (e: any) {
      setChat(prev => [...prev, { role: 'assistant', content: `请求失败：${e.message || e}` }]);
    } finally {
      setStreamingText(null);
      setLoading(false);
      setBusyAction(null);
    }
  };

  return (
    <div className="ai-panel" style={width ? { width: `${width}px` } : undefined}>
      <div className="outline-header">
        <Sparkles size={14} />
        <span>AI 助手</span>
        <button className="toolbar-btn" onClick={onClose} title="关闭">×</button>
      </div>

      {!enabled && (
        <div className="ai-disabled-notice">
          <p>还没有配置 AI 服务。</p>
          <button className="btn-primary" onClick={onOpenSettings}>去配置</button>
        </div>
      )}

      <div className="ai-actions">
        {ACTIONS.map(a => {
          const Icon = a.icon;
          return (
            <button
              key={a.id}
              className="ai-action-btn"
              onClick={() => runAction(a.id)}
              disabled={loading}
              title={a.desc}
            >
              <Icon size={14} />
              <span>{a.label}</span>
              {busyAction === a.id && <Loader2 size={12} className="spin" />}
            </button>
          );
        })}
      </div>

      <div className="ai-chat">
        <div className="ai-chat-messages">
          {chat.length === 0 && (
            <div className="ai-empty">
              <MessageSquare size={20} />
              <p>可以直接提问，或用上面的动作处理当前笔记。</p>
            </div>
          )}
          {chat.map((m, i) => (
            <div key={i} className={`ai-msg ai-msg-${m.role}`}>
              <div className="ai-msg-content">{m.content}</div>
              {m.role === 'assistant' && (
                <button className="ai-insert-btn" onClick={() => onInsert(m.content)} title="插入到正文">
                  插入
                </button>
              )}
            </div>
          ))}
          {loading && busyAction === 'chat' && streamingText === null && (
            <div className="ai-msg ai-msg-assistant">
              <Loader2 size={14} className="spin" /> 思考中…
            </div>
          )}
          {streamingText !== null && (
            <div className="ai-msg ai-msg-assistant">
              <div className="ai-msg-content">{streamingText}</div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="ai-input-row">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
            placeholder={enabled ? '就这篇笔记提问…' : '先在设置里配置 AI 才能对话…'}
            disabled={loading}
          />
          <button className="btn-primary" onClick={sendChat} disabled={loading || !input.trim()}>
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
