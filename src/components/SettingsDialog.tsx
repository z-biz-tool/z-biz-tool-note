import { useState, useEffect } from 'react';
import { X, Save, Plus, Trash2, FileText, RotateCw } from 'lucide-react';
import type { AIConfig, Template, Config } from '../types';
import { getIndexStatus, rebuildIndex, type IndexStatus } from '../lib/searchIndex';
import { BUILTIN_TEMPLATES } from '../lib/templates';
import { useI18n } from '../lib/i18n';

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
  const { t: tr } = useI18n();
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
      name: tr('settings', 'unnamedTpl'),
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
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={tr('settings', 'title')} onClick={closeAndRevert}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{tr('settings', 'title')}</h2>
          <button className="toolbar-btn" onClick={closeAndRevert} aria-label={tr('settings', 'close')}><X size={16} /></button>
        </div>

        <div className="modal-tabs">
          <button className={`modal-tab ${tab === 'ai' ? 'active' : ''}`} onClick={() => setTab('ai')}>
            {tr('settings', 'tabAI')}
          </button>
          <button className={`modal-tab ${tab === 'appearance' ? 'active' : ''}`} onClick={() => setTab('appearance')}>
            {tr('settings', 'tabAppearance')}
          </button>
          <button className={`modal-tab ${tab === 'templates' ? 'active' : ''}`} onClick={() => setTab('templates')}>
            {tr('settings', 'tabTemplates')}
          </button>
          <button className={`modal-tab ${tab === 'search' ? 'active' : ''}`} onClick={() => setTab('search')}>
            {tr('settings', 'tabSearch')}
          </button>
        </div>

        <div className="modal-body">
          {tab === 'ai' && (
            <div className="settings-form">
              <p className="settings-hint">
                {tr('settings', 'aiHint')}<code>http://localhost:11434/v1</code>{tr('settings', 'aiHintTail')}
              </p>

              <label className="settings-label">
                <span>{tr('settings', 'enableAI')}</span>
                <input
                  type="checkbox"
                  checked={ai.enabled}
                  onChange={(e) => setAI({ ...ai, enabled: e.target.checked })}
                />
              </label>

              <label className="settings-label">
                <span>{tr('settings', 'baseURL')}</span>
                <input
                  type="text"
                  value={ai.baseURL}
                  onChange={(e) => setAI({ ...ai, baseURL: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                />
              </label>

              <label className="settings-label">
                <span>{tr('settings', 'apiKey')}</span>
                <input
                  type="password"
                  value={ai.apiKey}
                  onChange={(e) => setAI({ ...ai, apiKey: e.target.value })}
                  placeholder="sk-..."
                />
              </label>

              <label className="settings-label">
                <span>{tr('settings', 'model')}</span>
                <input
                  type="text"
                  value={ai.model}
                  onChange={(e) => setAI({ ...ai, model: e.target.value })}
                  placeholder="gpt-4o-mini / deepseek-chat / glm-4-flash / qwen-turbo"
                />
              </label>

              <div className="settings-presets">
                <span>{tr('settings', 'presets')}</span>
                <button onClick={() => setAI({ ...ai, baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini' })}>OpenAI</button>
                <button onClick={() => setAI({ ...ai, baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat' })}>DeepSeek</button>
                <button onClick={() => setAI({ ...ai, baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' })}>{tr('settings', 'zhipu')}</button>
                <button onClick={() => setAI({ ...ai, baseURL: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' })}>Kimi</button>
                <button onClick={() => setAI({ ...ai, baseURL: 'http://localhost:11434/v1', model: 'llama3.1' })}>Ollama</button>
              </div>
            </div>
          )}

          {tab === 'appearance' && (
            <div className="settings-form">
              {/* 字体大小设置 */}
              <div className="setting-item">
                <label>{tr('settings', 'fontSize')}</label>
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
                <label>{tr('settings', 'font')}</label>
                <select
                  value={cfg.fontFamily || 'system-ui'}
                  onChange={(e) => {
                    const next = { ...cfg, fontFamily: e.target.value };
                    setCfg(next);
                    applyFontVars(next);
                  }}
                >
                  <option value="system-ui">{tr('settings', 'fontSystem')}</option>
                  <option value="'Helvetica Neue', sans-serif">Helvetica Neue</option>
                  <option value="'PingFang SC', sans-serif">{tr('settings', 'fontPingFang')}</option>
                  <option value="'Source Han Sans SC', sans-serif">{tr('settings', 'fontSourceSans')}</option>
                  <option value="'Source Han Serif SC', serif">{tr('settings', 'fontSourceSerif')}</option>
                  <option value="Georgia, serif">Georgia</option>
                  <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
                </select>
              </div>
            </div>
          )}

          {tab === 'search' && (
            <div className="settings-form">
              <p className="settings-hint">
                {tr('settings', 'searchHint')}
              </p>

              <div className="setting-item">
                <label>{tr('settings', 'indexDir')}</label>
                <span className="settings-value-path" title={currentDir}>
                  {currentDir || tr('settings', 'noFolder')}
                </span>
              </div>

              <div className="setting-item">
                <label>{tr('settings', 'indexed')}</label>
                <span className="settings-value">
                  {indexStatus
                    ? tr('settings', 'indexedValue').replace('{a}', String(indexStatus.indexed)).replace('{total}', String(indexStatus.total))
                    : tr('settings', 'unavailable')}
                </span>
              </div>

              <div className="setting-item">
                <label>{tr('settings', 'lastBuild')}</label>
                <span className="settings-value">
                  {indexStatus?.last_build_ms
                    ? tr('settings', 'buildTime').replace('{sec}', (Number(indexStatus.last_build_ms) / 1000).toFixed(2))
                    : tr('settings', 'neverBuilt')}
                </span>
              </div>

              <div className="setting-item">
                <label>{tr('settings', 'manualRebuild')}</label>
                <button className="btn-secondary" disabled={!currentDir || rebuilding} onClick={handleRebuild}>
                  <RotateCw size={13} className={rebuilding ? 'settings-spin' : undefined} />
                  {rebuilding ? tr('settings', 'rebuilding') : tr('settings', 'rebuildNow')}
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
                    {t.builtin && <span className="badge">{tr('settings', 'builtin')}</span>}
                    {!t.builtin && (
                      <button
                        className="tpl-delete"
                        onClick={(e) => { e.stopPropagation(); deleteTemplate(t.id); }}
                        title={tr('settings', 'deleteTpl')}
                        aria-label={tr('settings', 'deleteTpl')}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
                <button className="tpl-add" onClick={addTemplate}>
                  <Plus size={14} /> {tr('settings', 'newTpl')}
                </button>
              </div>

              {editingTpl && (
                <div className="template-editor">
                  <input
                    type="text"
                    value={editingTpl.name}
                    onChange={(e) => updateTemplate(editingTpl.id, { name: e.target.value })}
                    placeholder={tr('settings', 'tplName')}
                  />
                  <textarea
                    value={editingTpl.content}
                    onChange={(e) => updateTemplate(editingTpl.id, { content: e.target.value })}
                    placeholder={tr('settings', 'tplContent')}
                  />
                  <p className="settings-hint">
                    {tr('settings', 'placeholders')}<code>{'{{date}}'}</code> · <code>{'{{time}}'}</code> · <code>{'{{title}}'}</code>
                    {editingTpl.builtin && tr('settings', 'builtinNote')}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={closeAndRevert}>{tr('settings', 'cancel')}</button>
          <button className="btn-primary" onClick={handleSave}>
            <Save size={14} /> {tr('settings', 'save')}
          </button>
        </div>
      </div>
    </div>
  );
};
