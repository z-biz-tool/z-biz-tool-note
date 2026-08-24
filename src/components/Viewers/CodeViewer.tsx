import { useMemo, useState } from 'react';
import { baseName, codeLangOf } from '../../lib/fileTypes';
import { createLowlight } from 'lowlight';
import html from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';
import yamlLang from 'highlight.js/lib/languages/yaml';
import markdownLang from 'highlight.js/lib/languages/markdown';
import { Copy, Check } from 'lucide-react';

const lowlight = createLowlight({
  html, css, javascript, typescript, python, java, go, rust, json, bash, sql,
  yaml: yamlLang, markdown: markdownLang,
  tsx: typescript, jsx: javascript,
  cpp: javascript, // fallback
  xml: html,
});

interface Props {
  filePath: string;
  content: string;
}

// 行数上限:大文件截断,显示"加载全部"
const LINE_CAP = 5000;

export const CodeViewer = ({ filePath, content }: Props) => {
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);
  const name = baseName(filePath);
  const lang = codeLangOf(filePath);

  const { lines, truncated } = useMemo(() => {
    const all = content.split(/\r?\n/);
    if (showAll || all.length <= LINE_CAP) return { lines: all, truncated: false };
    return { lines: all.slice(0, LINE_CAP), truncated: true };
  }, [content, showAll]);

  // lowlight 渲染整段文本,然后按 \n 切回行(每行保留自己的高亮)
  const highlightedHtml = useMemo(() => {
    try {
      // plaintext 没有注册,用 nullish -> 返回原文
      if (lang === 'plaintext') return null;
      const result = lowlight.highlight(lang, content);
      return result.children?.map((c) => ('value' in c ? c.value : '')).join('') || null;
    } catch {
      return null;
    }
  }, [lang, content]);

  // 把高亮 HTML 切成行(根据原始 \n 数量)
  const highlightedLines = useMemo(() => {
    if (!highlightedHtml) return null;
    return highlightedHtml.split('\n');
  }, [highlightedHtml]);

  const copy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="viewer code-viewer">
      <div className="viewer-toolbar">
        <span className="viewer-title" title={filePath}>📄 {name}</span>
        <span className="toolbar-label">{lang} · {lines.length} 行{truncated ? ' (已截断)' : ''}</span>
        <div className="viewer-toolbar-right">
          <button className="toolbar-btn" onClick={copy} title="复制全文">
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
      </div>
      <div className="viewer-body code-viewer-body">
        <pre className={`code-viewer-pre language-${lang}`}>
          {highlightedLines ? (
            <code>
              {highlightedLines.map((line, i) => (
                <div key={i} className="code-viewer-line">
                  <span className="code-viewer-lineno">{i + 1}</span>
                  <span className="code-viewer-code" dangerouslySetInnerHTML={{ __html: line || '&nbsp;' }} />
                </div>
              ))}
            </code>
          ) : (
            <code>
              {lines.map((line, i) => (
                <div key={i} className="code-viewer-line">
                  <span className="code-viewer-lineno">{i + 1}</span>
                  <span className="code-viewer-code">{line || ' '}</span>
                </div>
              ))}
            </code>
          )}
        </pre>
        {truncated && (
          <div className="code-viewer-truncated">
            文件过大,已截断到 {LINE_CAP} 行。
            <button className="text-btn" onClick={() => setShowAll(true)}>加载全部 ({lines.length === LINE_CAP ? '可能卡顿' : ''})</button>
          </div>
        )}
      </div>
    </div>
  );
};
