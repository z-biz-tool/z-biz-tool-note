import { useState, useEffect } from 'react';
import { X, Save, Plus, Trash2, FileText } from 'lucide-react';
import type { AIConfig, Template } from '../types';

interface SettingsDialogProps {
  open: boolean;
  aiConfig: AIConfig;
  templates: Template[];
  onSaveAI: (config: AIConfig) => void;
  onSaveTemplates: (templates: Template[]) => void;
  onClose: () => void;
}

const DEFAULT_TEMPLATES: Template[] = [
  {
    id: 'tpl-meeting',
    name: 'Meeting Notes',
    builtin: true,
    content: `# {{title}}

**Date:** {{date}}
**Attendees:**

## Agenda
-

## Notes
-

## Action Items
- [ ]
`,
  },
  {
    id: 'tpl-daily',
    name: 'Daily Journal',
    builtin: true,
    content: `# {{date}}

## Plan
- [ ]

## Notes

## Reflection
`,
  },
  {
    id: 'tpl-todo',
    name: 'Task List',
    builtin: true,
    content: `# {{title}}

- [ ]
- [ ]
- [ ]
`,
  },
];

export const SettingsDialog = ({
  open, aiConfig, templates, onSaveAI, onSaveTemplates, onClose
}: SettingsDialogProps) => {
  const [tab, setTab] = useState<'ai' | 'templates'>('ai');
  const [ai, setAI] = useState<AIConfig>(aiConfig);
  const [tpls, setTpls] = useState<Template[]>(templates.length ? templates : DEFAULT_TEMPLATES);
  const [editingTpl, setEditingTpl] = useState<Template | null>(null);

  useEffect(() => {
    if (open) {
      setAI(aiConfig);
      setTpls(templates.length ? templates : DEFAULT_TEMPLATES);
    }
  }, [open, aiConfig, templates]);

  if (!open) return null;

  const handleSave = () => {
    onSaveAI(ai);
    onSaveTemplates(tpls);
    onClose();
  };

  const addTemplate = () => {
    const newTpl: Template = {
      id: 'tpl-' + Date.now(),
      name: 'New Template',
      content: '# {{title}}\n\n',
    };
    setTpls([...tpls, newTpl]);
    setEditingTpl(newTpl);
  };

  const updateTemplate = (id: string, patch: Partial<Template>) => {
    setTpls(tpls.map(t => t.id === id ? { ...t, ...patch } : t));
    if (editingTpl?.id === id) setEditingTpl({ ...editingTpl, ...patch });
  };

  const deleteTemplate = (id: string) => {
    setTpls(tpls.filter(t => t.id !== id));
    if (editingTpl?.id === id) setEditingTpl(null);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="toolbar-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="modal-tabs">
          <button className={`modal-tab ${tab === 'ai' ? 'active' : ''}`} onClick={() => setTab('ai')}>
            AI Provider
          </button>
          <button className={`modal-tab ${tab === 'templates' ? 'active' : ''}`} onClick={() => setTab('templates')}>
            Templates
          </button>
        </div>

        <div className="modal-body">
          {tab === 'ai' && (
            <div className="settings-form">
              <p className="settings-hint">
                Configure any OpenAI-compatible API. Works with OpenAI, DeepSeek, 智谱, Kimi, Ollama (via <code>http://localhost:11434/v1</code>), and more.
              </p>

              <label className="settings-label">
                <span>Enabled</span>
                <input
                  type="checkbox"
                  checked={ai.enabled}
                  onChange={(e) => setAI({ ...ai, enabled: e.target.checked })}
                />
              </label>

              <label className="settings-label">
                <span>Base URL</span>
                <input
                  type="text"
                  value={ai.baseURL}
                  onChange={(e) => setAI({ ...ai, baseURL: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                />
              </label>

              <label className="settings-label">
                <span>API Key</span>
                <input
                  type="password"
                  value={ai.apiKey}
                  onChange={(e) => setAI({ ...ai, apiKey: e.target.value })}
                  placeholder="sk-..."
                />
              </label>

              <label className="settings-label">
                <span>Model</span>
                <input
                  type="text"
                  value={ai.model}
                  onChange={(e) => setAI({ ...ai, model: e.target.value })}
                  placeholder="gpt-4o-mini / deepseek-chat / glm-4-flash / qwen-turbo"
                />
              </label>

              <div className="settings-presets">
                <span>Presets:</span>
                <button onClick={() => setAI({ ...ai, baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini' })}>OpenAI</button>
                <button onClick={() => setAI({ ...ai, baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat' })}>DeepSeek</button>
                <button onClick={() => setAI({ ...ai, baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' })}>智谱</button>
                <button onClick={() => setAI({ ...ai, baseURL: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' })}>Kimi</button>
                <button onClick={() => setAI({ ...ai, baseURL: 'http://localhost:11434/v1', model: 'llama3.1' })}>Ollama</button>
              </div>
            </div>
          )}

          {tab === 'templates' && (
            <div className="templates-section">
              <div className="templates-list">
                {tpls.map(t => (
                  <div
                    key={t.id}
                    className={`template-item ${editingTpl?.id === t.id ? 'active' : ''}`}
                    onClick={() => setEditingTpl(t)}
                  >
                    <FileText size={14} />
                    <span>{t.name}</span>
                    {t.builtin && <span className="badge">built-in</span>}
                    <button
                      className="tpl-delete"
                      onClick={(e) => { e.stopPropagation(); deleteTemplate(t.id); }}
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                <button className="tpl-add" onClick={addTemplate}>
                  <Plus size={14} /> New Template
                </button>
              </div>

              {editingTpl && (
                <div className="template-editor">
                  <input
                    type="text"
                    value={editingTpl.name}
                    onChange={(e) => updateTemplate(editingTpl.id, { name: e.target.value })}
                    placeholder="Template name"
                  />
                  <textarea
                    value={editingTpl.content}
                    onChange={(e) => updateTemplate(editingTpl.id, { content: e.target.value })}
                    placeholder="Template content. Use {{date}}, {{title}}, {{time}} as placeholders."
                  />
                  <p className="settings-hint">
                    Placeholders: <code>{'{{date}}'}</code> · <code>{'{{time}}'}</code> · <code>{'{{title}}'}</code>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>
            <Save size={14} /> Save
          </button>
        </div>
      </div>
    </div>
  );
};
