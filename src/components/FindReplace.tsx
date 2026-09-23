import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronUp, ChevronDown, ArrowRight, Replace } from 'lucide-react';
import { readSearchState } from '../lib/SearchEnhancedExtension';

interface FindReplaceProps {
  onClose: () => void;
  editor: any;
}

/**
 * 应用内查找替换条。
 *
 * 匹配、跳转、替换全部交给 SearchEnhanced 那一套命令（`search` / `nextMatch` /
 * `replaceCurrent` / `replaceAll`），这里只当它的遥控器：
 * 之前本组件自己写了一份正则和一份匹配表，插件状态里却是空的 ——
 * 于是「N 个匹配」数得出来、正文里一个高亮都不画（实测 searchMarks 为 0），
 * 两份匹配逻辑也迟早分叉。计数一律从插件状态读，不做第二次数。
 */
export const FindReplace = ({ onClose, editor }: FindReplaceProps) => {
  const [findTerm, setFindTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [total, setTotal] = useState(0);
  const [index, setIndex] = useState(-1);
  const findInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    findInputRef.current?.focus();
  }, []);

  const sync = useCallback(() => {
    if (!editor) return;
    const s = readSearchState(editor.state);
    setTotal(s.total);
    setIndex(s.index);
  }, [editor]);

  // 关掉条子要顺手清掉高亮，不然黄色块会一直留在正文里
  useEffect(() => () => { editor?.commands.clearSearch(); }, [editor]);

  useEffect(() => {
    if (!editor) return;
    if (!findTerm) {
      editor.commands.clearSearch();
      setTotal(0);
      setIndex(-1);
      return;
    }
    editor.commands.search(findTerm, { caseSensitive: matchCase, wholeWord });
    sync();
  }, [editor, findTerm, matchCase, wholeWord, sync]);

  const goNext = () => { editor?.commands.nextMatch(); sync(); };
  const goPrev = () => { editor?.commands.prevMatch(); sync(); };

  const replaceOne = () => {
    if (!editor || total === 0) return;
    editor.commands.replaceCurrent(replaceTerm);
    // 替换后插件会自己重算匹配；这里再补一次 search 让「第几个」和正文对齐
    if (findTerm) editor.commands.search(findTerm, { caseSensitive: matchCase, wholeWord });
    sync();
  };

  const replaceAll = () => {
    if (!editor || total === 0) return;
    editor.commands.replaceAll(replaceTerm);
    if (findTerm) editor.commands.search(findTerm, { caseSensitive: matchCase, wholeWord });
    sync();
  };

  const close = () => {
    editor?.commands.clearSearch();
    onClose();
  };

  const handleFindKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) goPrev();
      else goNext();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  const infoText = findTerm ? `${index < 0 ? 0 : index + 1}/${total}` : '';

  return (
    <div className="find-replace-bar">
      <div className="find-replace-row">
        <input
          ref={findInputRef}
          className="find-replace-input"
          type="text"
          placeholder="查找"
          aria-label="查找内容"
          value={findTerm}
          onChange={(e) => setFindTerm(e.target.value)}
          onKeyDown={handleFindKeyDown}
        />
        <button
          className="find-replace-btn"
          onClick={() => setMatchCase((v) => !v)}
          title="区分大小写"
          aria-label="区分大小写"
          aria-pressed={matchCase}
        >
          {/* 按下态只有这个勾能看见（样式表里没有 [aria-pressed] 规则），所以文案留着 */}
          {matchCase ? '✓ Aa' : 'Aa'}
        </button>
        <button
          className="find-replace-btn"
          onClick={() => setWholeWord((v) => !v)}
          title="全词匹配"
          aria-label="全词匹配"
          aria-pressed={wholeWord}
        >
          {wholeWord ? '✓ W' : 'W'}
        </button>
        <span className="find-replace-info" role="status" aria-live="polite">{infoText}</span>
        <button className="find-replace-btn" onClick={goPrev} title="上一个匹配" aria-label="上一个匹配" disabled={total === 0}>
          <ChevronUp size={14} />
        </button>
        <button className="find-replace-btn" onClick={goNext} title="下一个匹配" aria-label="下一个匹配" disabled={total === 0}>
          <ChevronDown size={14} />
        </button>
        <button className="find-replace-btn" onClick={close} title="关闭查找替换" aria-label="关闭查找替换">
          <X size={14} />
        </button>
      </div>
      <div className="find-replace-row">
        <input
          className="find-replace-input"
          type="text"
          placeholder="替换为"
          aria-label="替换为"
          value={replaceTerm}
          onChange={(e) => setReplaceTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              close();
            }
          }}
        />
        <button className="find-replace-btn" onClick={replaceOne} title="替换当前" aria-label="替换当前" disabled={total === 0}>
          <ArrowRight size={14} />
        </button>
        <button className="find-replace-btn" onClick={replaceAll} title="全部替换" aria-label="全部替换" disabled={total === 0}>
          <Replace size={14} />
        </button>
      </div>
    </div>
  );
};
