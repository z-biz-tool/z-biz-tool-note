import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronUp, ChevronDown, ArrowRight, Replace } from 'lucide-react';

interface FindReplaceProps {
  onClose: () => void;
  editor: any;
}

interface Match {
  from: number;
  to: number;
}

export const FindReplace = ({ onClose, editor }: FindReplaceProps) => {
  const [findTerm, setFindTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const findInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    findInputRef.current?.focus();
  }, []);

  const computeMatches = useCallback((): Match[] => {
    if (!findTerm || !editor) return [];
    const result: Match[] = [];
    const doc = editor.state.doc;
    const flags = matchCase ? 'g' : 'gi';
    const escaped = findTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
    const regex = new RegExp(pattern, flags);
    doc.descendants((node: any, pos: number) => {
      if (node.isText && node.text) {
        regex.lastIndex = 0;
        let m;
        while ((m = regex.exec(node.text)) !== null) {
          result.push({ from: pos + m.index, to: pos + m.index + m[0].length });
          if (m.index === regex.lastIndex) regex.lastIndex++;
        }
      }
    });
    return result;
  }, [findTerm, matchCase, wholeWord, editor]);

  useEffect(() => {
    const result = computeMatches();
    setMatches(result);
    setCurrentIndex(0);
    if (result.length > 0 && editor) {
      editor
        .chain()
        .setTextSelection({ from: result[0].from, to: result[0].to })
        .scrollIntoView()
        .run();
    }
  }, [computeMatches, editor]);

  const selectMatch = (matchList: Match[], index: number) => {
    const match = matchList[index];
    if (!match || !editor) return;
    editor
      .chain()
      .setTextSelection({ from: match.from, to: match.to })
      .scrollIntoView()
      .run();
  };

  const handleFindNext = () => {
    if (matches.length === 0) return;
    const next = (currentIndex + 1) % matches.length;
    setCurrentIndex(next);
    selectMatch(matches, next);
  };

  const handleFindPrev = () => {
    if (matches.length === 0) return;
    const prev = (currentIndex - 1 + matches.length) % matches.length;
    setCurrentIndex(prev);
    selectMatch(matches, prev);
  };

  const handleReplace = () => {
    if (matches.length === 0 || !editor) return;
    const match = matches[currentIndex];
    const tr = editor.state.tr.insertText(replaceTerm, match.from, match.to);
    editor.view.dispatch(tr);
    const newMatches = computeMatches();
    setMatches(newMatches);
    const newIndex = Math.min(currentIndex, Math.max(newMatches.length - 1, 0));
    setCurrentIndex(newIndex);
    if (newMatches.length > 0) {
      selectMatch(newMatches, newIndex);
    }
  };

  const handleReplaceAll = () => {
    if (matches.length === 0 || !editor) return;
    const tr = editor.state.tr;
    matches
      .slice()
      .reverse()
      .forEach((m) => {
        tr.insertText(replaceTerm, m.from, m.to);
      });
    editor.view.dispatch(tr);
    setMatches([]);
    setCurrentIndex(0);
  };

  const handleFindKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        handleFindPrev();
      } else {
        handleFindNext();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const matchCount = matches.length;
  const infoText = findTerm ? `${matchCount === 0 ? 0 : currentIndex + 1}/${matchCount}` : '';

  return (
    <div className="find-replace-bar">
      <div className="find-replace-row">
        <input
          ref={findInputRef}
          className="find-replace-input"
          type="text"
          placeholder="Find"
          value={findTerm}
          onChange={(e) => setFindTerm(e.target.value)}
          onKeyDown={handleFindKeyDown}
        />
        <button className="find-replace-btn" onClick={() => setMatchCase((v) => !v)} title="Match case">
          {matchCase ? '✓ Aa' : 'Aa'}
        </button>
        <button className="find-replace-btn" onClick={() => setWholeWord((v) => !v)} title="Whole word">
          {wholeWord ? '✓ W' : 'W'}
        </button>
        <span className="find-replace-info">{infoText}</span>
        <button className="find-replace-btn" onClick={handleFindPrev} title="Previous match">
          <ChevronUp size={14} />
        </button>
        <button className="find-replace-btn" onClick={handleFindNext} title="Next match">
          <ChevronDown size={14} />
        </button>
        <button className="find-replace-btn" onClick={onClose} title="Close">
          <X size={14} />
        </button>
      </div>
      <div className="find-replace-row">
        <input
          className="find-replace-input"
          type="text"
          placeholder="Replace"
          value={replaceTerm}
          onChange={(e) => setReplaceTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <button className="find-replace-btn" onClick={handleReplace} title="Replace">
          <ArrowRight size={14} />
        </button>
        <button className="find-replace-btn" onClick={handleReplaceAll} title="Replace All">
          <Replace size={14} />
        </button>
      </div>
    </div>
  );
};
