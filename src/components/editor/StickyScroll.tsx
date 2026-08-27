import { useMemo } from 'react';
import styles from './StickyScroll.module.css';

interface StickyScrollProps {
  lines: string[];
  startLine: number;
  onJumpToLine: (line: number) => void;
}

const SCOPE_OPEN_RE = /[{([]/;
// Patterns that indicate a scope-opening line worth pinning
const SCOPE_HEADER_RE = /^\s*(pub\s+)?(async\s+)?fn\s|^\s*(pub\s+)?(struct|enum|impl|trait|mod|type)\s|^\s*(class|function|async function|interface|type)\s|^\s*[A-Za-z_]\w*\s*[:=]\s*(function|async\s+function|class|\()/;

function findStickyLines(lines: string[], startLine: number): Array<{ line: number; text: string }> {
  if (startLine <= 0) return [];

  const result: Array<{ line: number; text: string }> = [];

  // Walk upward from startLine looking for scope header lines
  // that have an indentation ≤ the current line's indentation
  const currentIndent = getIndent(lines[startLine] ?? '');
  let targetIndent = currentIndent;
  let seenAtCurrentIndent = false;

  for (let l = startLine - 1; l >= 0; l--) {
    const text = lines[l] ?? '';
    if (text.trim() === '') continue;

    const indent = getIndent(text);

    if (indent < targetIndent || !seenAtCurrentIndent) {
      if (SCOPE_HEADER_RE.test(text) || (SCOPE_OPEN_RE.test(text) && indent < targetIndent)) {
        result.unshift({ line: l, text: text.trimEnd() });
        targetIndent = indent;
        seenAtCurrentIndent = true;

        if (indent === 0) break; // reached root
      }
    }
  }

  // Limit to 3 sticky lines max
  return result.slice(-3);
}

function getIndent(line: string): number {
  let i = 0;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
  return i;
}

export function StickyScroll({ lines, startLine, onJumpToLine }: StickyScrollProps) {
  const stickyLines = useMemo(
    () => findStickyLines(lines, startLine),
    [lines, startLine]
  );

  if (stickyLines.length === 0) return null;

  return (
    <div className={styles.container}>
      {stickyLines.map(({ line, text }) => (
        <div
          key={line}
          className={styles.stickyLine}
          onClick={() => onJumpToLine(line)}
          title={`Line ${line + 1}: ${text.trim()}`}
        >
          <span className={styles.gutter}>{line + 1}</span>
          <span className={styles.content}>{text}</span>
        </div>
      ))}
    </div>
  );
}
