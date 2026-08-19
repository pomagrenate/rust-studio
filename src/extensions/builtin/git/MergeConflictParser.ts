/**
 * MergeConflictParser.ts
 * Parses Git conflict blocks (<<<<<<<, |||||||, =======, >>>>>>>)
 * and provides one-click resolution helpers.
 */

export interface MergeConflictBlock {
  index: number;
  startLine: number;     // Line with <<<<<<<
  baseStartLine?: number; // Line with |||||||
  separatorLine: number; // Line with =======
  endLine: number;       // Line with >>>>>>>
  currentHeader: string; // e.g. "HEAD" or "HEAD (Current Change)"
  baseHeader?: string;
  incomingHeader: string; // e.g. "feature/xyz (Incoming Change)"
  currentContent: string[];
  baseContent?: string[];
  incomingContent: string[];
}

export type ConflictResolutionChoice =
  | "current"
  | "incoming"
  | "both-current-first"
  | "both-incoming-first";

/**
 * Scan lines array to discover all merge conflict blocks.
 */
export function findMergeConflicts(lines: string[]): MergeConflictBlock[] {
  const conflicts: MergeConflictBlock[] = [];
  let inConflict = false;
  let inBase = false;
  let inIncoming = false;

  let currentBlock: Partial<MergeConflictBlock> = {};
  let currentLines: string[] = [];
  let baseLines: string[] = [];
  let incomingLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("<<<<<<<")) {
      inConflict = true;
      inBase = false;
      inIncoming = false;
      currentLines = [];
      baseLines = [];
      incomingLines = [];
      currentBlock = {
        index: conflicts.length,
        startLine: i,
        currentHeader: line.replace(/^<<<<<<<\s*/, "").trim() || "Current Change (HEAD)",
      };
    } else if (inConflict && line.startsWith("|||||||")) {
      inBase = true;
      currentBlock.baseStartLine = i;
      currentBlock.baseHeader = line.replace(/^\|\|\|\|\|\|\|\s*/, "").trim() || "Base (Ancestor)";
    } else if (inConflict && line.startsWith("=======")) {
      inBase = false;
      inIncoming = true;
      currentBlock.separatorLine = i;
    } else if (inConflict && line.startsWith(">>>>>>>")) {
      inConflict = false;
      inIncoming = false;
      inBase = false;
      currentBlock.endLine = i;
      currentBlock.incomingHeader = line.replace(/^>>>>>>>\s*/, "").trim() || "Incoming Change";
      currentBlock.currentContent = currentLines;
      if (currentBlock.baseStartLine !== undefined) {
        currentBlock.baseContent = baseLines;
      }
      currentBlock.incomingContent = incomingLines;

      if (currentBlock.separatorLine !== undefined) {
        conflicts.push(currentBlock as MergeConflictBlock);
      }
      currentBlock = {};
    } else if (inConflict) {
      if (inIncoming) {
        incomingLines.push(line);
      } else if (inBase) {
        baseLines.push(line);
      } else {
        currentLines.push(line);
      }
    }
  }

  return conflicts;
}

/**
 * Check if the text contains any conflict markers.
 */
export function hasMergeConflicts(text: string): boolean {
  return text.includes("<<<<<<<") && text.includes("=======") && text.includes(">>>>>>>");
}

/**
 * Resolves a single conflict block by index and returns the new array of lines.
 */
export function resolveSingleConflict(
  lines: string[],
  conflict: MergeConflictBlock,
  choice: ConflictResolutionChoice
): string[] {
  let replacement: string[] = [];

  switch (choice) {
    case "current":
      replacement = [...conflict.currentContent];
      break;
    case "incoming":
      replacement = [...conflict.incomingContent];
      break;
    case "both-current-first":
      replacement = [...conflict.currentContent, ...conflict.incomingContent];
      break;
    case "both-incoming-first":
      replacement = [...conflict.incomingContent, ...conflict.currentContent];
      break;
  }

  const before = lines.slice(0, conflict.startLine);
  const after = lines.slice(conflict.endLine + 1);

  return [...before, ...replacement, ...after];
}

/**
 * Resolve ALL conflicts in a document with either all Current or all Incoming.
 */
export function resolveAllConflicts(
  lines: string[],
  choice: "current" | "incoming"
): string[] {
  let currentLines = [...lines];
  let conflicts = findMergeConflicts(currentLines);

  while (conflicts.length > 0) {
    const c = conflicts[0];
    currentLines = resolveSingleConflict(currentLines, c, choice);
    conflicts = findMergeConflicts(currentLines);
  }

  return currentLines;
}
