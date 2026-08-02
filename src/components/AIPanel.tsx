import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Loader2, FileText, Tag, ListTree, MessageSquare, Network } from 'lucide-react';

interface AIPanelProps {
  onAction: (action: AIAction, context?: string) => Promise<string>;
  onInsert: (text: string) => void;
  onClose: () => void;
  enabled: boolean;
  onOpenSettings: () => void;
}

export type AIAction = 'summarize' | 'tags' | 'outline' | 'suggest-links' | 'chat';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const ACTIONS: Array<{ id: AIAction; label: string; icon: any; desc: string }> = [
  { id: 'summarize', label: 'Summarize', icon: FileText, desc: 'Condense the current note into key points' },
  { id: 'tags', label: 'Extract Tags', icon: Tag, desc: 'Suggest #tags for this note' },
  { id: 'outline', label: 'Outline', icon: ListTree, desc: 'Generate a structured outline' },
  { id: 'suggest-links', label: 'Suggest Links', icon: Network, desc: 'Recommend wiki links to other notes' },
];

export const AIPanel = ({ onAction, onInsert, onClose, enabled, onOpenSettings }: AIPanelProps) => {
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<AIAction | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat, loading]);

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
      setChat(prev => [...prev, { role: 'assistant', content: `Error: ${e.message || e}` }]);
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
    try {
      const result = await onAction('chat', userMsg);
      setChat(prev => [...prev, { role: 'assistant', content: result }]);
    } catch (e: any) {
      setChat(prev => [...prev, { role: 'assistant', content: `Error: ${e.message || e}` }]);
    } finally {
      setLoading(false);
      setBusyAction(null);
    }
  };

  return (
    <div className="ai-panel">
      <div className="outline-header">
        <Sparkles size={14} />
        <span>AI Assistant</span>
        <button className="toolbar-btn" onClick={onClose} title="Close">×</button>
      </div>

      {!enabled && (
        <div className="ai-disabled-notice">
          <p>AI is not configured.</p>
          <button className="btn-primary" onClick={onOpenSettings}>Configure</button>
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
              <p>Ask anything about your notes, or run an action above.</p>
            </div>
          )}
          {chat.map((m, i) => (
            <div key={i} className={`ai-msg ai-msg-${m.role}`}>
              <div className="ai-msg-content">{m.content}</div>
              {m.role === 'assistant' && (
                <button className="ai-insert-btn" onClick={() => onInsert(m.content)} title="Insert into note">
                  Insert
                </button>
              )}
            </div>
          ))}
          {loading && busyAction === 'chat' && (
            <div className="ai-msg ai-msg-assistant">
              <Loader2 size={14} className="spin" /> Thinking...
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
            placeholder={enabled ? 'Ask about this note...' : 'Configure AI to start chatting...'}
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
