/**
 * useBracketMatcher.ts — Finds the matching bracket pair for the bracket
 * adjacent to the cursor position, returning both positions for highlighting.
 *
 * Supports: (), [], {}
 */

import { useMemo } from 'react';

type BracketPos = { line: number; startCol: number; endCol: number } | null;

const OPEN_BRACKETS = new Set(['(', '[', '{']);
const CLOSE_BRACKETS = new Set([')', ']', '}']);
const BRACKET_PAIR: Record<string, string> = {
  '(': ')', '[': ']', '{': '}',
  ')': '(', ']': '[', '}': '{',
};

function findMatchingBracket(
  lines: string[],
  startLine: number,
  startCol: number,
  bracket: string
): { line: number; col: number } | null {
  const isOpen = OPEN_BRACKETS.has(bracket);
  const match = BRACKET_PAIR[bracket];
  let depth = 1;

  if (isOpen) {
    // Search forward
    let col = startCol + 1;
    for (let l = startLine; l < lines.length; l++) {
      const line = lines[l] ?? '';
      const from = l === startLine ? col : 0;
      for (let c = from; c < line.length; c++) {
        if (line[c] === bracket) depth++;
        else if (line[c] === match) {
          depth--;
          if (depth === 0) return { line: l, col: c };
        }
      }
    }
  } else {
    // Search backward
    let col = startCol - 1;
    for (let l = startLine; l >= 0; l--) {
      const line = lines[l] ?? '';
      const from = l === startLine ? col : line.length - 1;
      for (let c = from; c >= 0; c--) {
        if (line[c] === bracket) depth++;
        else if (line[c] === match) {
          depth--;
          if (depth === 0) return { line: l, col: c };
        }
      }
    }
  }

  return null;
}

export interface BracketMatch {
  source: BracketPos;
  target: BracketPos;
}

export function useBracketMatcher(
  lines: string[],
  cursorLine: number,
  cursorCol: number,
  enabled: boolean
): BracketMatch {
  return useMemo((): BracketMatch => {
    const empty: BracketMatch = { source: null, target: null };
    if (!enabled || lines.length === 0) return empty;

    const line = lines[cursorLine] ?? '';

    // Check character at cursor and one before
    const candidates = [
      { col: cursorCol, ch: line[cursorCol] },
      { col: cursorCol - 1, ch: line[cursorCol - 1] },
    ];

    for (const { col, ch } of candidates) {
      if (!ch) continue;
      if (!OPEN_BRACKETS.has(ch) && !CLOSE_BRACKETS.has(ch)) continue;

      const matched = findMatchingBracket(lines, cursorLine, col, ch);
      if (matched) {
        return {
          source: { line: cursorLine, startCol: col, endCol: col + 1 },
          target: { line: matched.line, startCol: matched.col, endCol: matched.col + 1 },
        };
      }
    }

    return empty;
  }, [lines, cursorLine, cursorCol, enabled]);
}
