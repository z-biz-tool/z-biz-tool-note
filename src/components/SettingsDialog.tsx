import { useState, useEffect } from 'react';
import { X, Save, Plus, Trash2, FileText, RotateCw } from 'lucide-react';
import type { AIConfig, Template, Config } from '../types';
import { getIndexStatus, rebuildIndex, type IndexStatus } from '../lib/searchIndex';
import { BUILTIN_TEMPLATES } from '../lib/templates';

interface SettingsDialogProps {
  open: boolean;
  aiConfig: AIConfig;
  templates: Template[];
  config: Config;
  currentDir: string;
  onSaveAI: (config: AIConfig) => void;
  onSaveTemplates: (templates: Template[]) => void;
  onSaveConfig: (config: Config) => void;
  onClose: () => void;
}

export const SettingsDialog = ({
  open, aiConfig, templates, config, currentDir, onSaveAI, onSaveTemplates, onSaveConfig, onClose
}: SettingsDialogProps) => {
  const [tab, setTab] = useState<'ai' | 'templates' | 'appearance' | 'search'>('ai');
  const [ai, setAI] = useState<AIConfig>(aiConfig);
  const [tpls, setTpls] = useState<Template[]>(templates.length ? templates : BUILTIN_TEMPLATES);
  const [editingTpl, setEditingTpl] = useState<Template | null>(null);
  const [cfg, setCfg] = useState<Config>(config);
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  // 外观滑块会直接改 CSS 变量（实时预览），取消时要退回已保存的配置
  const applyFontVars = (c: Config) => {
    document.documentElement.style.setProperty('--font-size-base', `${c.fontSize || 16}px`);
    document.documentElement.style.setProperty('--font-family', c.fontFamily || 'system-ui');
  };

  const closeAndRevert = () => {
    applyFontVars(config);
    onClose();
  };

  useEffect(() => {
    if (open) {
      setAI(aiConfig);
      setTpls(templates.length ? templates : BUILTIN_TEMPLATES);
      setCfg(config);
    }
  }, [open, aiConfig, templates, config]);

  useEffect(() => {
    if (!open || tab !== 'search') return;
    let cancelled = false;
    void getIndexStatus().then(s => { if (!cancelled) setIndexStatus(s); });
    return () => { cancelled = true; };
  }, [open, tab]);

  // Esc 必须走 closeAndRevert，否则实时预览的字号会留在页面上
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        applyFontVars(config);
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, config, onClose]);

  if (!open) return null;

  const handleSave = () => {
    onSaveAI(ai);
    onSaveTemplates(tpls);
    onSaveConfig(cfg);
    onClose();
  };

  const handleRebuild = async () => {
    if (!currentDir || rebuilding) return;
    setRebuilding(true);
    const status = await rebuildIndex(currentDir);
    if (status) setIndexStatus(status);
    setRebuilding(false);
  };

  const addTemplate = () => {
    const newTpl: Template = {
      id: 'tpl-' + Date.now(),
      name: '未命名模板',
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
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="设置" onClick={closeAndRevert}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>设置</h2>
          <button className="toolbar-btn" onClick={closeAndRevert} aria-label="关闭设置"><X size={16} /></button>
        </div>

        <div className="modal-tabs">
          <button className={`modal-tab ${tab === 'ai' ? 'active' : ''}`} onClick={() => setTab('ai')}>
            AI 服务
          </button>
          <button className={`modal-tab ${tab === 'appearance' ? 'active' : ''}`} onClick={() => setTab('appearance')}>
            外观
          </button>
          <button className={`modal-tab ${tab === 'templates' ? 'active' : ''}`} onClick={() => setTab('templates')}>
            模板
          </button>
          <button className={`modal-tab ${tab === 'search' ? 'active' : ''}`} onClick={() => setTab('search')}>
            搜索
          </button>
        </div>

        <div className="modal-body">
          {tab === 'ai' && (
            <div className="settings-form">
              <p className="settings-hint">
                支持任意 OpenAI 兼容接口：OpenAI、DeepSeek、智谱、Kimi、Ollama（<code>http://localhost:11434/v1</code>）等。
              </p>

              <label className="settings-label">
                <span>启用 AI 助手</span>
                <input
                  type="checkbox"
                  checked={ai.enabled}
                  onChange={(e) => setAI({ ...ai, enabled: e.target.checked })}
                />
              </label>

              <label className="settings-label">
                <span>接口地址 Base URL</span>
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
                <span>模型</span>
                <input
                  type="text"
                  value={ai.model}
                  onChange={(e) => setAI({ ...ai, model: e.target.value })}
                  placeholder="gpt-4o-mini / deepseek-chat / glm-4-flash / qwen-turbo"
                />
              </label>

              <div className="settings-presets">
                <span>预设：</span>
                <button onClick={() => setAI({ ...ai, baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini' })}>OpenAI</button>
                <button onClick={() => setAI({ ...ai, baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat' })}>DeepSeek</button>
                <button onClick={() => setAI({ ...ai, baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' })}>智谱</button>
                <button onClick={() => setAI({ ...ai, baseURL: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' })}>Kimi</button>
                <button onClick={() => setAI({ ...ai, baseURL: 'http://localhost:11434/v1', model: 'llama3.1' })}>Ollama</button>
              </div>
            </div>
          )}

          {tab === 'appearance' && (
            <div className="settings-form">
              {/* 字体大小设置 */}
              <div className="setting-item">
                <label>字体大小</label>
                <input
                  type="range"
                  min="12"
                  max="24"
                  value={cfg.fontSize || 16}
                  onChange={(e) => {
                    const size = parseInt(e.target.value);
                    const next = { ...cfg, fontSize: size };
                    setCfg(next);
                    applyFontVars(next);
                  }}
                />
                <span>{cfg.fontSize || 16}px</span>
              </div>

              {/* 字体选择 */}
              <div className="setting-item">
                <label>字体</label>
                <select
                  value={cfg.fontFamily || 'system-ui'}
                  onChange={(e) => {
                    const next = { ...cfg, fontFamily: e.target.value };
                    setCfg(next);
                    applyFontVars(next);
                  }}
                >
                  <option value="system-ui">系统默认</option>
                  <option value="'Helvetica Neue', sans-serif">Helvetica Neue</option>
                  <option value="'PingFang SC', sans-serif">苹方</option>
                  <option value="'Source Han Sans SC', sans-serif">思源黑体</option>
                  <option value="'Source Han Serif SC', serif">思源宋体</option>
                  <option value="Georgia, serif">Georgia</option>
                  <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
                </select>
              </div>
            </div>
          )}

          {tab === 'search' && (
            <div className="settings-form">
              <p className="settings-hint">
                全文搜索走本地 SQLite FTS5 索引。打开目录时会按 mtime 增量对齐，外部编辑器改过的文件也会自动重新入库。
              </p>

              <div className="setting-item">
                <label>索引目录</label>
                <span className="settings-value-path" title={currentDir}>
                  {currentDir || '尚未打开文件夹'}
                </span>
              </div>

              <div className="setting-item">
                <label>已索引</label>
                <span className="settings-value">
                  {indexStatus ? `${indexStatus.indexed} / ${indexStatus.total} 条` : '不可用'}
                </span>
              </div>

              <div className="setting-item">
                <label>上次对齐</label>
                <span className="settings-value">
                  {indexStatus?.last_build_ms
                    ? `耗时 ${(Number(indexStatus.last_build_ms) / 1000).toFixed(2)} 秒`
                    : '本会话尚未全量构建'}
                </span>
              </div>

              <div className="setting-item">
                <label>手动重建</label>
                <button className="btn-secondary" disabled={!currentDir || rebuilding} onClick={handleRebuild}>
                  <RotateCw size={13} className={rebuilding ? 'settings-spin' : undefined} />
                  {rebuilding ? '对齐中…' : '立即对齐索引'}
                </button>
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
                    {t.builtin && <span className="badge">内置</span>}
                    {!t.builtin && (
                      <button
                        className="tpl-delete"
                        onClick={(e) => { e.stopPropagation(); deleteTemplate(t.id); }}
                        title="删除模板"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
                <button className="tpl-add" onClick={addTemplate}>
                  <Plus size={14} /> 新建模板
                </button>
              </div>

              {editingTpl && (
                <div className="template-editor">
                  <input
                    type="text"
                    value={editingTpl.name}
                    onChange={(e) => updateTemplate(editingTpl.id, { name: e.target.value })}
                    placeholder="模板名称"
                  />
                  <textarea
                    value={editingTpl.content}
                    onChange={(e) => updateTemplate(editingTpl.id, { content: e.target.value })}
                    placeholder="模板内容，可用 {{date}}、{{title}}、{{time}} 作为占位符"
                  />
                  <p className="settings-hint">
                    占位符：<code>{'{{date}}'}</code> · <code>{'{{time}}'}</code> · <code>{'{{title}}'}</code>
                    {editingTpl.builtin && ' · 内置模板可修改内容，但不可删除'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={closeAndRevert}>取消</button>
          <button className="btn-primary" onClick={handleSave}>
            <Save size={14} /> 保存
          </button>
        </div>
      </div>
    </div>
  );
};
