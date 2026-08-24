import { useMemo, useState } from 'react';
import { baseName, extOf } from '../../lib/fileTypes';

interface Props {
  filePath: string;
  content: string;
}

const ROW_CAP = 5000;

export const CsvViewer = ({ filePath, content }: Props) => {
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');

  const isTsv = extOf(filePath) === 'tsv';
  const sep = isTsv ? '\t' : detectSeparator(content);

  const rows = useMemo(() => parseCsv(content, sep), [content, sep]);
  const truncated = !showAll && rows.length > ROW_CAP;
  const visible = truncated ? rows.slice(0, ROW_CAP) : rows;

  const filtered = useMemo(() => {
    if (!search) return visible;
    const q = search.toLowerCase();
    return visible.filter(row => row.some(c => c.toLowerCase().includes(q)));
  }, [visible, search]);

  const name = baseName(filePath);
  const [header, ...body] = filtered;

  return (
    <div className="viewer csv-viewer">
      <div className="viewer-toolbar">
        <span className="viewer-title" title={filePath}>📊 {name}</span>
        <span className="toolbar-label">
          {isTsv ? 'TSV' : 'CSV'} · {rows.length} 行{header ? ` × ${header.length} 列` : ''}
          {truncated ? ' (已截断)' : ''}
        </span>
        <div className="viewer-toolbar-right">
          <input
            type="text"
            className="csv-search"
            placeholder="过滤…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="viewer-body csv-viewer-body">
        {header ? (
          <table className="csv-table">
            <thead>
              <tr>{header.map((c, i) => <th key={i}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((row, i) => (
                <tr key={i}>
                  {row.map((c, j) => <td key={j}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="csv-empty">空文件</div>
        )}
        {truncated && (
          <div className="csv-truncated">
            已截断到 {ROW_CAP} 行,共 {rows.length} 行。
            <button className="text-btn" onClick={() => setShowAll(true)}>加载全部</button>
          </div>
        )}
      </div>
    </div>
  );
};

// 简单 CSV 解析:支持引号转义,不支持 \r\n 之外的多行字段
function parseCsv(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuote = false;
      } else cell += c;
    } else {
      if (c === '"') inQuote = true;
      else if (c === sep) { cur.push(cell); cell = ''; }
      else if (c === '\n') { cur.push(cell); rows.push(cur); cur = []; cell = ''; }
      else if (c === '\r') { /* skip */ }
      else cell += c;
    }
  }
  if (cell !== '' || cur.length > 0) { cur.push(cell); rows.push(cur); }
  return rows;
}

function detectSeparator(text: string): string {
  // 统计前几行各分隔符出现次数,取最多
  const sample = text.split('\n').slice(0, 5).join('\n');
  const candidates = [',', ';', '\t', '|'];
  let best = ',', max = 0;
  for (const s of candidates) {
    const n = (sample.match(new RegExp(escapeReg(s), 'g')) || []).length;
    if (n > max) { max = n; best = s; }
  }
  return best;
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
