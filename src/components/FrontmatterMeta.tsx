import { useState, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronRight, Hash, Calendar, FileText, X } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { sanitizeAlias, sanitizeTag } from '../lib/frontmatter';

interface FrontmatterMetaProps {
  meta: Record<string, unknown>;
  /** 允许编辑标签与别名（改完由调用方写回文件） */
  editable?: boolean;
  onTagsChange?: (tags: string[]) => void;
  onAliasesChange?: (aliases: string[]) => void;
}

/** 一排 chip + 一个加号输入框；标签和别名共用这一套交互 */
function ChipEditor({
  items,
  editable,
  onChange,
  addLabel,
  removeLabel,
  sanitize,
}: {
  items: string[];
  editable: boolean;
  onChange?: (next: string[]) => void;
  addLabel: string;
  removeLabel: (item: string) => string;
  sanitize: (s: string) => string;
}) {
  const [draft, setDraft] = useState('');
  const canEdit = editable && !!onChange;

  const commit = () => {
    const next = sanitize(draft);
    setDraft('');
    if (!next || !onChange || items.includes(next)) return;
    onChange([...items, next]);
  };

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {items.map(item => (
        <span
          key={item}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            padding: '1px 6px',
            borderRadius: 4,
            background: 'var(--tag-bg, rgba(102,126,234,0.1))',
            color: 'var(--tag-color, #667eea)',
          }}
        >
          {item}
          {canEdit && (
            <button
              type="button"
              aria-label={removeLabel(item)}
              title={removeLabel(item)}
              onClick={() => onChange!(items.filter(x => x !== item))}
              style={{
                border: 'none',
                background: 'none',
                color: 'inherit',
                cursor: 'pointer',
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <X size={10} />
            </button>
          )}
        </span>
      ))}
      {canEdit && (
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            // 逗号/中文逗号也能提交：一口气打「读书, 笔记」是常见输入法
            if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
              e.preventDefault();
              commit();
              return;
            }
            // 空输入框上按退格删掉最后一个（和多数笔记应用的标签框一致）
            if (e.key === 'Backspace' && !draft && items.length) {
              e.preventDefault();
              onChange!(items.slice(0, -1));
            }
          }}
          aria-label={addLabel}
          placeholder={addLabel}
          style={{
            width: 96,
            border: '1px dashed var(--border-color, rgba(0,0,0,0.12))',
            borderRadius: 4,
            background: 'transparent',
            color: 'inherit',
            fontSize: 12,
            padding: '1px 6px',
          }}
        />
      )}
    </span>
  );
}

/**
 * 顶部元数据卡片：把 frontmatter 字段以可折叠形式展示在编辑器上方。
 *
 * 默认展示 title / date / tags / aliases 四个常用字段；其它字段折叠在"更多"里，
 * 避免干扰笔记正文。可编辑的是标签与别名 —— 它们是最常改、且能安全写回的两项
 * （写回走 frontmatter.setFrontmatter* ，只动对应那几行）。
 */
export function FrontmatterMeta({ meta, editable = false, onTagsChange, onAliasesChange }: FrontmatterMetaProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  // 提取常用字段
  const title = (meta.title as string) || '';
  const date = (meta.date as string) || (meta.created as string) || '';
  const tags = Array.isArray(meta.tags) ? (meta.tags as string[]).map(String) : [];
  const aliases = Array.isArray(meta.aliases) ? (meta.aliases as string[]).map(String) : [];
  const otherKeys = Object.keys(meta).filter(
    k => !['title', 'date', 'created', 'tags', 'aliases'].includes(k),
  );

  const hasContent = title || date || tags.length > 0 || aliases.length > 0 || otherKeys.length > 0
    || editable;
  if (!hasContent) return null;

  return (
    <div
      className="frontmatter-meta"
      style={{
        padding: '8px 16px',
        background: 'var(--bg-secondary, rgba(102,126,234,0.04))',
        borderBottom: '1px solid var(--border-color, rgba(0,0,0,0.06))',
        fontSize: 12,
        color: 'var(--text-muted, #666)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {title && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <FileText size={12} />
            <strong>{title}</strong>
          </span>
        )}
        {date && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Calendar size={12} />
            {date.slice(0, 10)}
          </span>
        )}
        {(tags.length > 0 || editable) && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Hash size={12} />
            <ChipEditor
              items={tags}
              editable={editable}
              onChange={onTagsChange}
              addLabel={t('meta', 'addTag')}
              removeLabel={(v) => t('meta', 'removeTag').replace('{tag}', v)}
              sanitize={sanitizeTag}
            />
          </span>
        )}
        {(aliases.length > 0 || editable) && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontStyle: 'italic' }}>{t('meta', 'aliases')}</span>
            <ChipEditor
              items={aliases}
              editable={editable}
              onChange={onAliasesChange}
              addLabel={t('meta', 'addAlias')}
              removeLabel={(v) => t('meta', 'removeAlias').replace('{alias}', v)}
              sanitize={sanitizeAlias}
            />
          </span>
        )}
        {otherKeys.length > 0 && (
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              padding: 0,
            }}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {otherKeys.length} {t('meta', 'fields')}
          </button>
        )}
      </div>
      {expanded && otherKeys.length > 0 && (
        <div
          style={{
            marginTop: 6,
            paddingTop: 6,
            borderTop: '1px dashed var(--border-color, rgba(0,0,0,0.06))',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 4,
          }}
        >
          {otherKeys.map(k => (
            <div key={k} style={{ display: 'flex', gap: 4 }}>
              <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{k}:</span>
              <span style={{ wordBreak: 'break-all' }}>
                {Array.isArray(meta[k]) ? (meta[k] as unknown[]).join(', ') : String(meta[k] ?? '')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
