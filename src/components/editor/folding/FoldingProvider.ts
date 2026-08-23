/**
 * FoldingProvider.ts — Indentation-based code folding range detection.
 * Detects foldable regions by comparing line indentation levels.
 */

export interface FoldingRange {
  startLine: number;
  endLine: number;
}

function getIndentLevel(line: string): number {
  let i = 0;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
    i += line[i] === '\t' ? 4 : 1;
  }
  return i;
}

/**
 * Compute all foldable ranges from the given lines array.
 * A region is foldable when a line is followed by lines with greater indentation.
 */
export function computeFoldingRanges(lines: string[]): FoldingRange[] {
  const ranges: FoldingRange[] = [];

  for (let i = 0; i < lines.length - 1; i++) {
    const currentLine = lines[i];
    if (currentLine.trim() === '') continue;

    const currentIndent = getIndentLevel(currentLine);

    // Look for consecutive lines with higher indentation
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;

    if (j >= lines.length) continue;

    const nextIndent = getIndentLevel(lines[j]);
    if (nextIndent <= currentIndent) continue;

    // Found a foldable region — find its end
    let endLine = j;
    for (let k = j + 1; k < lines.length; k++) {
      const kLine = lines[k];
      if (kLine.trim() === '') {
        endLine = k;
        continue;
      }
      const kIndent = getIndentLevel(kLine);
      if (kIndent <= currentIndent) break;
      endLine = k;
    }

    if (endLine > i) {
      ranges.push({ startLine: i, endLine });
    }
  }

  return ranges;
}

/**
 * Build a map of which lines are the start of a foldable region.
 */
export function buildFoldableLineSet(ranges: FoldingRange[]): Set<number> {
  return new Set(ranges.map((r) => r.startLine));
}

/**
 * Get all line numbers that should be hidden when the given startLine is folded.
 */
export function getHiddenLines(
  foldedSet: Set<number>,
  ranges: FoldingRange[]
): Set<number> {
  const hidden = new Set<number>();

  for (const startLine of foldedSet) {
    const range = ranges.find((r) => r.startLine === startLine);
    if (range) {
      for (let l = range.startLine + 1; l <= range.endLine; l++) {
        hidden.add(l);
      }
    }
  }

  return hidden;
}
