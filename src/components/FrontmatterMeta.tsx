import { useState } from 'react';
import { ChevronDown, ChevronRight, Hash, Calendar, FileText } from 'lucide-react';

interface FrontmatterMetaProps {
  meta: Record<string, unknown>;
  /** 是否允许编辑元数据 */
  editable?: boolean;
  /** 编辑回调 */
  onChange?: (next: Record<string, unknown>) => void;
}

/**
 * 顶部元数据卡片：把 frontmatter 字段以可折叠形式展示在编辑器上方。
 *
 * 默认仅展示 title / date / tags / aliases 四个常用字段；
 * 其它字段折叠在"更多"里，避免干扰笔记正文。
 */
export function FrontmatterMeta({ meta, editable = false, onChange }: FrontmatterMetaProps) {
  const [expanded, setExpanded] = useState(false);

  // 提取常用字段
  const title = (meta.title as string) || '';
  const date = (meta.date as string) || (meta.created as string) || '';
  const tags = Array.isArray(meta.tags) ? (meta.tags as string[]) : [];
  const aliases = Array.isArray(meta.aliases) ? (meta.aliases as string[]) : [];
  const otherKeys = Object.keys(meta).filter(
    k => !['title', 'date', 'created', 'tags', 'aliases'].includes(k),
  );

  const hasContent = title || date || tags.length > 0 || aliases.length > 0 || otherKeys.length > 0;
  if (!hasContent) return null;

  const updateField = (key: string, value: unknown) => {
    if (!onChange) return;
    onChange({ ...meta, [key]: value });
  };

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
        {tags.length > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Hash size={12} />
            {tags.map(t => (
              <span
                key={t}
                style={{
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: 'var(--tag-bg, rgba(102,126,234,0.1))',
                  color: 'var(--tag-color, #667eea)',
                }}
              >
                {t}
              </span>
            ))}
          </span>
        )}
        {aliases.length > 0 && (
          <span style={{ fontStyle: 'italic' }}>
            别名: {aliases.join(', ')}
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
            {otherKeys.length} 个字段
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