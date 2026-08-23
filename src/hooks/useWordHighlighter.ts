/**
 * useWordHighlighter.ts — Hook that computes word highlight ranges in the
 * visible viewport based on the current cursor word (like VSCode's word
 * occurrence highlighter).
 *
 * Returns a Map<lineIndex, { startCol, endCol }[]> for all visible lines.
 */

import { useMemo } from 'react';

const WORD_RE = /[a-zA-Z0-9_]/;

function getWordAt(line: string, col: number): string | null {
  if (col < 0 || col > line.length) return null;
  const ch = line[col] ?? line[col - 1];
  if (!ch || !WORD_RE.test(ch)) return null;

  let start = col;
  let end = col;

  while (start > 0 && WORD_RE.test(line[start - 1])) start--;
  while (end < line.length && WORD_RE.test(line[end])) end++;

  if (end <= start) return null;
  return line.slice(start, end);
}

function findWordOccurrences(
  lines: string[],
  startLine: number,
  endLine: number,
  word: string
): Map<number, { startCol: number; endCol: number }[]> {
  const result = new Map<number, { startCol: number; endCol: number }[]>();
  const wordLen = word.length;

  for (let l = startLine; l <= endLine; l++) {
    const line = lines[l] ?? '';
    const matches: { startCol: number; endCol: number }[] = [];
    let idx = 0;
    while ((idx = line.indexOf(word, idx)) !== -1) {
      // Ensure whole-word match
      const before = idx > 0 ? line[idx - 1] : ' ';
      const after = idx + wordLen < line.length ? line[idx + wordLen] : ' ';
      if (!WORD_RE.test(before) && !WORD_RE.test(after)) {
        matches.push({ startCol: idx, endCol: idx + wordLen });
      }
      idx += wordLen;
    }
    if (matches.length > 0) result.set(l, matches);
  }

  return result;
}

export interface WordHighlightMap {
  ranges: Map<number, { startCol: number; endCol: number }[]>;
  currentWord: string | null;
}

export function useWordHighlighter(
  lines: string[],
  cursorLine: number,
  cursorCol: number,
  startLine: number,
  endLine: number,
  enabled: boolean
): WordHighlightMap {
  return useMemo(() => {
    if (!enabled || lines.length === 0) {
      return { ranges: new Map(), currentWord: null };
    }

    const line = lines[cursorLine] ?? '';
    const word = getWordAt(line, cursorCol);

    if (!word || word.length < 2) {
      return { ranges: new Map(), currentWord: null };
    }

    const ranges = findWordOccurrences(lines, startLine, endLine, word);
    return { ranges, currentWord: word };
  }, [lines, cursorLine, cursorCol, startLine, endLine, enabled]);
}
