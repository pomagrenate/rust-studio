import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  VscChevronRight,
  VscChevronDown,
  VscCaseSensitive,
  VscWholeWord,
  VscRegex,
  VscReplace,
  VscReplaceAll,
  VscArrowUp,
  VscArrowDown,
  VscListSelection,
  VscClose
} from "react-icons/vsc";
import styles from "./FindWidget.module.css";

export interface FindMatch {
  lineIndex: number;
  startCol: number;
  length: number;
}

interface FindWidgetProps {
  isOpen: boolean;
  isReplaceOpen?: boolean;
  lines: string[];
  activeLine?: number;
  onNavigateToMatch?: (lineIndex: number, col: number) => void;
  onLinesChange?: (lines: string[], activeLine: number, activeCol: number) => void;
  onClose: () => void;
}

export function FindWidget({
  isOpen,
  isReplaceOpen: propReplaceOpen = false,
  lines,
  activeLine = 0,
  onNavigateToMatch,
  onLinesChange,
  onClose,
}: FindWidgetProps) {
  const [isReplaceOpen, setIsReplaceOpen] = useState(propReplaceOpen);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [matchWholeWord, setMatchWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);

  const findInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // Sync propReplaceOpen whenever it changes
  useEffect(() => {
    setIsReplaceOpen(propReplaceOpen);
  }, [propReplaceOpen]);

  // Focus find input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (propReplaceOpen && replaceInputRef.current) {
          findInputRef.current?.focus();
          findInputRef.current?.select();
        } else {
          findInputRef.current?.focus();
          findInputRef.current?.select();
        }
      }, 50);
    }
  }, [isOpen, propReplaceOpen]);

  // Compute all matches in current document lines
  const matches = useMemo(() => {
    if (!findText) return [];

    const result: FindMatch[] = [];
    let regex: RegExp;

    try {
      if (useRegex) {
        regex = new RegExp(findText, matchCase ? "g" : "gi");
      } else {
        const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = matchWholeWord ? `\\b${escaped}\\b` : escaped;
        regex = new RegExp(pattern, matchCase ? "g" : "gi");
      }
    } catch {
      return [];
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match: RegExpExecArray | null;
      regex.lastIndex = 0;

      while ((match = regex.exec(line)) !== null) {
        result.push({
          lineIndex: i,
          startCol: match.index,
          length: match[0].length,
        });
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
      }
    }

    return result;
  }, [findText, lines, matchCase, matchWholeWord, useRegex]);

  // Navigate to current match when matches or activeLine change
  useEffect(() => {
    if (matches.length > 0) {
      const closestIdx = matches.findIndex(m => m.lineIndex >= activeLine);
      const nextIdx = closestIdx !== -1 ? closestIdx : 0;
      setCurrentMatchIdx(nextIdx);
    } else {
      setCurrentMatchIdx(0);
    }
  }, [matches, activeLine]);

  const goToMatch = useCallback((index: number) => {
    if (matches.length === 0) return;
    const target = matches[index];
    if (target && onNavigateToMatch) {
      onNavigateToMatch(target.lineIndex, target.startCol);
    }
  }, [matches, onNavigateToMatch]);

  const handleNextMatch = useCallback(() => {
    if (matches.length === 0) return;
    const next = (currentMatchIdx + 1) % matches.length;
    setCurrentMatchIdx(next);
    goToMatch(next);
  }, [currentMatchIdx, matches.length, goToMatch]);

  const handlePrevMatch = useCallback(() => {
    if (matches.length === 0) return;
    const prev = (currentMatchIdx - 1 + matches.length) % matches.length;
    setCurrentMatchIdx(prev);
    goToMatch(prev);
  }, [currentMatchIdx, matches.length, goToMatch]);

  // Replace single match
  const handleReplaceCurrent = () => {
    if (matches.length === 0 || !onLinesChange) return;
    const match = matches[currentMatchIdx];
    if (!match) return;

    const newLines = [...lines];
    const line = newLines[match.lineIndex];
    const before = line.slice(0, match.startCol);
    const after = line.slice(match.startCol + match.length);
    newLines[match.lineIndex] = before + replaceText + after;

    onLinesChange(newLines, match.lineIndex, match.startCol + replaceText.length);
    handleNextMatch();
  };

  // Replace all matches
  const handleReplaceAll = () => {
    if (matches.length === 0 || !onLinesChange) return;

    let regex: RegExp;
    try {
      if (useRegex) {
        regex = new RegExp(findText, matchCase ? "g" : "gi");
      } else {
        const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = matchWholeWord ? `\\b${escaped}\\b` : escaped;
        regex = new RegExp(pattern, matchCase ? "g" : "gi");
      }
    } catch {
      return;
    }

    const newLines = lines.map(line => line.replace(regex, replaceText));
    onLinesChange(newLines, activeLine, 0);
  };

  const handleFindKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        handlePrevMatch();
      } else {
        handleNextMatch();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const handleReplaceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleReplaceCurrent();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.findWidget} role="dialog" aria-label="Find and Replace">
      {/* Toggle Expand/Collapse Replace */}
      <button
        className={styles.toggleReplaceBtn}
        onClick={() => setIsReplaceOpen(!isReplaceOpen)}
        title={isReplaceOpen ? "Collapse Replace" : "Expand Replace"}
        aria-label="Toggle Replace"
      >
        {isReplaceOpen ? <VscChevronDown /> : <VscChevronRight />}
      </button>

      {/* Input Rows */}
      <div className={styles.inputsContainer}>
        {/* Row 1: Find */}
        <div className={styles.inputRow}>
          <div className={styles.inputWrapper}>
            <input
              ref={findInputRef}
              className={styles.inputField}
              type="text"
              placeholder="Find"
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              onKeyDown={handleFindKeyDown}
            />
            <div className={styles.inputActions}>
              <button
                className={`${styles.optionBtn} ${matchCase ? styles.optionBtnActive : ""}`}
                onClick={() => setMatchCase(!matchCase)}
                title="Match Case (Alt+C)"
              >
                <VscCaseSensitive />
              </button>
              <button
                className={`${styles.optionBtn} ${matchWholeWord ? styles.optionBtnActive : ""}`}
                onClick={() => setMatchWholeWord(!matchWholeWord)}
                title="Match Whole Word (Alt+W)"
              >
                <VscWholeWord />
              </button>
              <button
                className={`${styles.optionBtn} ${useRegex ? styles.optionBtnActive : ""}`}
                onClick={() => setUseRegex(!useRegex)}
                title="Use Regular Expression (Alt+R)"
              >
                <VscRegex />
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Replace */}
        {isReplaceOpen && (
          <div className={styles.inputRow}>
            <div className={styles.inputWrapper}>
              <input
                ref={replaceInputRef}
                className={styles.inputField}
                type="text"
                placeholder="Replace"
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                onKeyDown={handleReplaceKeyDown}
              />
            </div>
            <div className={styles.replaceActions}>
              <button
                className={`${styles.controlBtn} ${matches.length === 0 ? styles.controlBtnDisabled : ""}`}
                onClick={handleReplaceCurrent}
                title="Replace (Ctrl+Shift+1)"
                disabled={matches.length === 0}
              >
                <VscReplace />
              </button>
              <button
                className={`${styles.controlBtn} ${matches.length === 0 ? styles.controlBtnDisabled : ""}`}
                onClick={handleReplaceAll}
                title="Replace All (Ctrl+Alt+Enter)"
                disabled={matches.length === 0}
              >
                <VscReplaceAll />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right Controls */}
      <div className={styles.controlsContainer}>
        <span className={styles.matchCount}>
          {findText ? (matches.length > 0 ? `${currentMatchIdx + 1} of ${matches.length}` : "No results") : "No results"}
        </span>

        <button
          className={`${styles.controlBtn} ${matches.length === 0 ? styles.controlBtnDisabled : ""}`}
          onClick={handlePrevMatch}
          title="Previous Match (Shift+Enter)"
          disabled={matches.length === 0}
        >
          <VscArrowUp />
        </button>

        <button
          className={`${styles.controlBtn} ${matches.length === 0 ? styles.controlBtnDisabled : ""}`}
          onClick={handleNextMatch}
          title="Next Match (Enter)"
          disabled={matches.length === 0}
        >
          <VscArrowDown />
        </button>

        <button
          className={styles.controlBtn}
          title="Find in Selection (Alt+L)"
        >
          <VscListSelection />
        </button>

        <button
          className={styles.controlBtn}
          onClick={onClose}
          title="Close (Escape)"
        >
          <VscClose />
        </button>
      </div>
    </div>
  );
}

export default FindWidget;
