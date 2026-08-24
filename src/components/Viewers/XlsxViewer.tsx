import { useEffect, useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { baseName } from '../../lib/fileTypes';
import { Loader2 } from 'lucide-react';

interface Props {
  filePath: string;
  dataUrl: string;
  mime: string;
}

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const b64 = dataUrl.split(',')[1] || '';
  const bin = atob(b64);
  const len = bin.length;
  const buf = new ArrayBuffer(len);
  const view = new Uint8Array(buf);
  for (let i = 0; i < len; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

export const XlsxViewer = ({ filePath, dataUrl }: Props) => {
  const [sheets, setSheets] = useState<{ name: string; rows: any[][] }[] | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const name = baseName(filePath);

  useEffect(() => {
    let cancelled = false;
    try {
      const buf = dataUrlToArrayBuffer(dataUrl);
      const wb = XLSX.read(buf, { type: 'array' });
      const list = wb.SheetNames.map(n => {
        const sheet = wb.Sheets[n];
        const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
        return { name: n, rows };
      });
      if (!cancelled) { setSheets(list); setActiveIdx(0); }
    } catch (err) {
      if (!cancelled) setError(String(err));
    }
    return () => { cancelled = true; };
  }, [dataUrl]);

  const active = sheets?.[activeIdx];
  const visible = useMemo(() => {
    if (!active) return null;
    const [header, ...body] = active.rows;
    return { header, body: body.slice(0, 5000), truncated: body.length > 5000 };
  }, [active]);

  return (
    <div className="viewer xlsx-viewer">
      <div className="viewer-toolbar">
        <span className="viewer-title" title={filePath}>📗 {name}</span>
        {sheets && sheets.length > 1 && (
          <select
            className="xlsx-sheet-select"
            value={activeIdx}
            onChange={e => setActiveIdx(parseInt(e.target.value))}
          >
            {sheets.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
          </select>
        )}
        {sheets && <span className="toolbar-label">{sheets.length} 个工作表</span>}
      </div>
      <div className="viewer-body xlsx-viewer-body">
        {error && <div className="xlsx-error">解析失败: {error}</div>}
        {!error && !sheets && <div className="xlsx-loading"><Loader2 className="spin" size={32} /> 解析 Excel…</div>}
        {visible && visible.header && (
          <>
            <table className="xlsx-table">
              <thead>
                <tr>{visible.header.map((c: any, i: number) => <th key={i}>{String(c)}</th>)}</tr>
              </thead>
              <tbody>
                {visible.body.map((row, i) => (
                  <tr key={i}>
                    {row.map((c, j) => <td key={j}>{c === null || c === undefined ? '' : String(c)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.truncated && <div className="xlsx-truncated">已截断到 5000 行</div>}
          </>
        )}
        {visible && !visible.header && <div className="xlsx-empty">空工作表</div>}
      </div>
    </div>
  );
};
