import { useState, useEffect, useMemo, useRef } from 'react';
import { X, Save, Plus, Trash2, FileText, RotateCw } from 'lucide-react';
import type { AIConfig, Template, Config } from '../types';
import { getIndexStatus, rebuildIndex, type IndexStatus } from '../lib/searchIndex';
import { BUILTIN_TEMPLATES } from '../lib/templates';
import { useI18n } from '../lib/i18n';
import { useKeyboard } from '../hooks/useKeyboard';
import type { KeyboardShortcut } from '../lib/keyboardShortcuts';
import { electronAPI } from '../lib/electronAPI';
import { findPreset, llmNeedsApiKey } from '../lib/llmNeedsKey';

/**
 * 供应商预设的界面视图（由 Rust `list_llm_presets` 提供）。
 *
 * 前端**不留第二份表**：以前这里是 6 个手写按钮，地址与模型名都写死，
 * 模型名半年一换代 ⇒ 用户点一下、看着全对、实际 404。
 */
interface PresetView {
  id: string;
  label: string;
  base_url: string;
  category: string;
  category_label: string;
  requires_api_key: boolean;
  aliases: string[];
  verified_on: string;
}

/** 结构化失败的界面视图（由 Rust `LlmFailure` 提供）。 */
interface LlmFailure {
  kind: string;
  status?: number | null;
  message: string;
  hint: string;
  /** 该把光标送进哪一栏 —— 与 hint 的文案必须一致。 */
  focus: 'apiKey' | 'baseUrl' | 'model' | 'none';
}

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

  // ── AI 服务商的交互状态 ──
  // 预设、模型列表、进行中的动作、上一次失败/成功。全部是「瞬态」，
  // 关窗即丢，不进 AIConfig（配置只存用户真正保存过的东西）。
  const [presets, setPresets] = useState<PresetView[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState<'models' | 'test' | null>(null);
  const [failure, setFailure] = useState<LlmFailure | null>(null);
  const [okText, setOkText] = useState<string | null>(null);
  const keyRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLInputElement>(null);
  const advRef = useRef<HTMLDetailsElement>(null);

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
      // 每次打开都从干净状态开始：否则上次的「连接失败」会跟着出现在
      // 下次打开的界面上，用户会以为刚刚又失败了一次。
      setModels([]);
      setFailure(null);
      setOkText(null);
      setBusy(null);
    }
  }, [open, aiConfig, templates, config]);

  // 预设从 Rust 取（单一事实源在 cap-llm::presets）。
  // 拿不到（浏览器演示区 / 后端异常）就留空，界面退回「自定义」手填地址 ——
  // 不假装「一家服务商都没有」。
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void electronAPI
      .invoke('list-llm-presets')
      .then((r: any) => {
        if (!cancelled && r?.success && Array.isArray(r.presets)) setPresets(r.presets);
      })
      .catch(() => { /* 读不到就用手填，不打扰用户 */ });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open || tab !== 'search') return;
    let cancelled = false;
    void getIndexStatus().then(s => { if (!cancelled) setIndexStatus(s); });
    return () => { cancelled = true; };
  }, [open, tab]);

  // Esc 必须走 closeAndRevert，否则实时预览的字号会留在页面上
  const escapeShortcuts = useMemo<KeyboardShortcut[]>(
    () => [
      {
        key: 'escape',
        handler: () => {
          applyFontVars(config);
          onClose();
        },
      },
    ],
    [config, onClose],
  );
  useKeyboard(escapeShortcuts, { enabled: open });

  /**
   * 当前选中的预设。
   *
   * 2026-10-31 修：此前只按 `p.id === ai.provider` 或**整串**地址相等来找。
   * 后端 `detect_preset()` 是按 **host** 反查的 —— `http://localhost:11434/v1`
   * 与 `http://localhost:11434` 是同一个服务，尾斜杠、`/v1` 后缀不该影响身份。
   * 前端整串比较 ⇒ 同一个服务前后端得出不同结论（判据分裂）。
   */
  const currentPreset = useMemo(
    () => findPreset(presets, ai.provider, ai.baseURL),
    [presets, ai.provider, ai.baseURL],
  );

  /**
   * 该服务商要不要密钥。
   *
   * 2026-10-31 修：此前是 `currentPreset ? currentPreset.requires_api_key : true`
   * —— 只认预设，自定义地址一律要 Key。而后端 `to_cap()` 放行私网地址
   * （自建服务没有鉴权层），于是出现**判据分裂**：后端放行、前端逼用户
   * 填一个无处可用的密钥，且没有任何编译错误能暴露它。
   *
   * shared 的 `needsApiKey()` 是 Rust `LlmConfig::needs_api_key()` 的逐条镜像。
   */
  const requiresKey = llmNeedsApiKey(presets, ai.provider, ai.baseURL);

  /** 按分组排好（cap-llm 的预设本身已按组排列，这里只做归拢）。 */
  const groups = useMemo(() => {
    const out: { key: string; label: string; items: PresetView[] }[] = [];
    for (const p of presets) {
      let g = out.find(x => x.key === p.category);
      if (!g) {
        g = { key: p.category, label: p.category_label, items: [] };
        out.push(g);
      }
      g.items.push(p);
    }
    return out;
  }, [presets]);

  /** 换服务商：地址跟着走，模型名不动（预设不提供模型名，见 Rust 侧注释）。 */
  const pickProvider = (id: string) => {
    setFailure(null);
    setOkText(null);
    setModels([]);
    const p = presets.find(x => x.id === id);
    if (!p) {
      // 自定义：保留用户已填的地址，只是不再挂任何厂商身份
      setAI({ ...ai, provider: undefined });
      return;
    }
    setAI({ ...ai, provider: p.id, baseURL: p.base_url });
  };

  /** 获取模型列表。失败要把结构化错误交给界面分流，不能只吞成一句文本。 */
  const fetchModels = async () => {
    setBusy('models');
    setFailure(null);
    setOkText(null);
    const r: any = await electronAPI.invoke('list-llm-models', ai);
    setBusy(null);
    if (!r?.success) {
      setFailure(
        r?.failure ?? { kind: 'http', status: null, message: r?.error || '获取模型失败', hint: '', focus: 'none' },
      );
      return;
    }
    const list: string[] = Array.isArray(r.models) ? r.models : [];
    setModels(list);
    if (list.length === 0) {
      // 空列表不是「成功」：用户点这个按钮就是为了拿一个能填的模型名
      setFailure({
        kind: 'notConfigured',
        status: null,
        message: tr('settings', 'fetchEmpty'),
        hint: '',
        focus: 'model',
      });
      return;
    }
    if (!ai.model.trim()) setAI({ ...ai, model: list[0] });
  };

  /** 测试连接：后端发一个 1 token 的对话，能回就说明 key/地址/模型三项全对。 */
  const testConn = async () => {
    setBusy('test');
    setFailure(null);
    setOkText(null);
    const r: any = await electronAPI.invoke('test-ai-config', ai);
    setBusy(null);
    if (!r?.success) {
      setFailure(
        r?.failure ?? { kind: 'http', status: null, message: r?.error || '连接失败', hint: '', focus: 'none' },
      );
      return;
    }
    setOkText(r.detail || '');
  };

  /** 「去改密钥 / 去改地址 / 去选模型」—— 把光标和注意力一起送过去。 */
  const focusFailure = (f: LlmFailure) => {
    if (f.focus === 'apiKey') {
      keyRef.current?.focus();
    } else if (f.focus === 'baseUrl') {
      // 地址在折叠区里：不先展开，focus 会落在一个看不见的输入框上
      if (advRef.current) advRef.current.open = true;
      urlRef.current?.focus();
    } else if (f.focus === 'model') {
      modelRef.current?.focus();
    }
  };

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

              {/* 服务商：从 Rust 取预设（单一事实源）。
                  改造前这里是一排手写按钮，连模型名一起写死 ——
                  模型名半年一换代，点一下就 404，而界面看起来毫无异常。 */}
              <label className="settings-label">
                <span>{tr('settings', 'provider')}</span>
                <select
                  value={currentPreset?.id ?? ''}
                  onChange={(e) => pickProvider(e.target.value)}
                  disabled={presets.length === 0}
                >
                  {presets.length === 0 && (
                    <option value="">{tr('settings', 'providerCustom')}</option>
                  )}
                  {groups.map((g) => (
                    <optgroup key={g.key} label={g.label}>
                      {g.items.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </optgroup>
                  ))}
                  <option value="">{tr('settings', 'providerCustom')}</option>
                </select>
              </label>
              <p className="settings-hint">{tr('settings', 'providerHint')}</p>

              {requiresKey && (
                <>
                  <label className="settings-label">
                    <span>{tr('settings', 'apiKey')}</span>
                    <input
                      ref={keyRef}
                      type="password"
                      value={ai.apiKey}
                      onChange={(e) => setAI({ ...ai, apiKey: e.target.value })}
                      placeholder="sk-..."
                    />
                  </label>
                  <p className="settings-hint">{tr('settings', 'apiKeyHint')}</p>
                </>
              )}

              {/* 模型名：可拉取、也可手填。datalist 而不是 select ——
                  有些自建代理会临时挂一个不在列表里的模型名，
                  换成下拉就把这条路堵死了。 */}
              <div className="settings-label">
                <span>{tr('settings', 'model')}</span>
                <div className="settings-inline">
                  <input
                    ref={modelRef}
                    type="text"
                    value={ai.model}
                    onChange={(e) => setAI({ ...ai, model: e.target.value })}
                    placeholder="deepseek-chat / qwen-plus …"
                    list="ai-model-options"
                  />
                  <button type="button" onClick={fetchModels} disabled={busy !== null}>
                    {busy === 'models' ? tr('settings', 'fetching') : tr('settings', 'fetchModels')}
                  </button>
                </div>
                {models.length > 0 && (
                  <datalist id="ai-model-options">
                    {models.map((m) => <option key={m} value={m} />)}
                  </datalist>
                )}
              </div>
              <p className="settings-hint">{tr('settings', 'modelHint')}</p>

              {/* 地址折叠进「高级」：选服务商已经填好，绝大多数人不用看这一栏。
                  自定义（自建代理）时默认展开，否则用户会找不到该填哪儿。 */}
              <details className="settings-advanced" ref={advRef} open={!currentPreset}>
                <summary>{tr('settings', 'advanced')}</summary>
                <label className="settings-label">
                  <span>{tr('settings', 'baseURL')}</span>
                  <input
                    ref={urlRef}
                    type="text"
                    value={ai.baseURL}
                    onChange={(e) => setAI({ ...ai, baseURL: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                  />
                </label>
                <p className="settings-hint">
                  {tr('settings', 'advancedHint')}
                  {currentPreset ? ` ${tr('settings', 'verifiedOn').replace('{date}', currentPreset.verified_on)}` : ''}
                </p>
              </details>

              <div className="settings-inline settings-inline-end">
                <button type="button" onClick={testConn} disabled={busy !== null}>
                  {busy === 'test' ? tr('settings', 'testing') : tr('settings', 'testConn')}
                </button>
              </div>

              {okText && <p className="settings-ok">{okText}</p>}

              {/* 结构化失败：一句「为什么」+ 一个能点的动作。
                  「请求失败，请重试」这种文案价值为零 —— 用户已经知道失败了。 */}
              {failure && (
                <div className="settings-failure">
                  <strong>{failure.message.slice(0, 200)}</strong>
                  {failure.hint && <p>{failure.hint}</p>}
                  {failure.focus !== 'none' && (
                    <button type="button" onClick={() => focusFailure(failure)}>
                      {failure.focus === 'apiKey'
                        ? tr('settings', 'focusApiKey')
                        : failure.focus === 'baseUrl'
                          ? tr('settings', 'focusBaseUrl')
                          : tr('settings', 'focusModel')}
                    </button>
                  )}
                </div>
              )}
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
