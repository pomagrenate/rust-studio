/**
 * LinesOperationsCommands.ts - VSCode-parity line manipulation commands
 * Sourced from vscode/src/vs/editor/contrib/linesOperations
 *
 * Implements:
 *  - Move Line Up / Down          (Alt+Up / Alt+Down)
 *  - Copy Line Up / Down          (Alt+Shift+Up / Alt+Shift+Down)
 *  - Sort Lines Ascending/Desc    (no default binding)
 *  - Trim Trailing Whitespace      (Ctrl+K Ctrl+X — chord not supported yet, so no binding)
 *  - Delete Duplicate Lines        (no default binding)
 *  - Join Lines                    (Ctrl+J)
 *  - Transpose Characters          (no default binding)
 *  - Transform: UPPERCASE          (no default binding)
 *  - Transform: lowercase          (no default binding)
 *  - Transform: Title Case         (no default binding)
 *  - Add Cursor Above              (Ctrl+Alt+Up)
 *  - Add Cursor Below              (Ctrl+Alt+Down)
 */

import { commandRegistry } from './CommandRegistry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getLineRange(vm: any): { startLine: number; endLine: number } {
  if (vm.hasSelection()) {
    const sel = vm.getSelection();
    let l1 = sel.start.line;
    let l2 = sel.end.line;
    // If selection ends at col 0 of a line and spans multiple lines, exclude that last line
    if (l2 > l1 && sel.end.column === 0) l2--;
    return { startLine: Math.min(l1, l2), endLine: Math.max(l1, l2) };
  }
  const c = vm.getCursorPosition();
  return { startLine: c.line, endLine: c.line };
}

function getLinesArray(vm: any, startLine: number, endLine: number): string[] {
  const result: string[] = [];
  for (let i = startLine; i <= endLine; i++) {
    result.push(vm.getLine(i));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Move Line Up (Alt+Up)
// ---------------------------------------------------------------------------
function moveLinesUp(vm: any): void {
  const { startLine, endLine } = getLineRange(vm);
  if (startLine === 0) return; // already at top

  const lines = vm.getLines() as string[];
  const moved = lines.splice(startLine, endLine - startLine + 1);
  lines.splice(startLine - 1, 0, ...moved);
  vm.setLines(lines);

  const cursor = vm.getCursorPosition();
  vm.setCursorPosition({ line: cursor.line - 1, column: cursor.column });
  if (vm.hasSelection()) {
    const sel = vm.getSelection();
    vm.setSelection({
      start: { line: sel.start.line - 1, column: sel.start.column },
      end: { line: sel.end.line - 1, column: sel.end.column },
    });
  }
}

// ---------------------------------------------------------------------------
// Move Line Down (Alt+Down)
// ---------------------------------------------------------------------------
function moveLinesDown(vm: any): void {
  const { startLine, endLine } = getLineRange(vm);
  const lineCount = vm.getLineCount();
  if (endLine >= lineCount - 1) return; // already at bottom

  const lines = vm.getLines() as string[];
  const moved = lines.splice(startLine, endLine - startLine + 1);
  lines.splice(startLine + 1, 0, ...moved);
  vm.setLines(lines);

  const cursor = vm.getCursorPosition();
  vm.setCursorPosition({ line: cursor.line + 1, column: cursor.column });
  if (vm.hasSelection()) {
    const sel = vm.getSelection();
    vm.setSelection({
      start: { line: sel.start.line + 1, column: sel.start.column },
      end: { line: sel.end.line + 1, column: sel.end.column },
    });
  }
}

// ---------------------------------------------------------------------------
// Copy Line Up (Alt+Shift+Up)
// ---------------------------------------------------------------------------
function copyLinesUp(vm: any): void {
  const { startLine, endLine } = getLineRange(vm);
  const block = getLinesArray(vm, startLine, endLine);
  const lines = vm.getLines() as string[];
  lines.splice(startLine, 0, ...block);
  vm.setLines(lines);

  // Cursor stays on original (now shifted down)
  const cursor = vm.getCursorPosition();
  vm.setCursorPosition({ line: cursor.line + block.length, column: cursor.column });
  if (vm.hasSelection()) {
    const sel = vm.getSelection();
    const offset = block.length;
    vm.setSelection({
      start: { line: sel.start.line + offset, column: sel.start.column },
      end: { line: sel.end.line + offset, column: sel.end.column },
    });
  }
}

// ---------------------------------------------------------------------------
// Copy Line Down (Alt+Shift+Down)
// ---------------------------------------------------------------------------
function copyLinesDown(vm: any): void {
  const { startLine, endLine } = getLineRange(vm);
  const block = getLinesArray(vm, startLine, endLine);
  const lines = vm.getLines() as string[];
  lines.splice(endLine + 1, 0, ...block);
  vm.setLines(lines);
  // cursor stays where it is
}

// ---------------------------------------------------------------------------
// Sort Lines Ascending
// ---------------------------------------------------------------------------
function sortLinesAscending(vm: any): void {
  const { startLine, endLine } = getLineRange(vm);
  const block = getLinesArray(vm, startLine, endLine).sort((a, b) =>
    a.localeCompare(b)
  );
  const lines = vm.getLines() as string[];
  lines.splice(startLine, endLine - startLine + 1, ...block);
  vm.setLines(lines);
}

// ---------------------------------------------------------------------------
// Sort Lines Descending
// ---------------------------------------------------------------------------
function sortLinesDescending(vm: any): void {
  const { startLine, endLine } = getLineRange(vm);
  const block = getLinesArray(vm, startLine, endLine).sort((a, b) =>
    b.localeCompare(a)
  );
  const lines = vm.getLines() as string[];
  lines.splice(startLine, endLine - startLine + 1, ...block);
  vm.setLines(lines);
}

// ---------------------------------------------------------------------------
// Trim Trailing Whitespace
// ---------------------------------------------------------------------------
function trimTrailingWhitespace(vm: any): void {
  const lines = vm.getLines() as string[];
  const trimmed = lines.map((l: string) => l.replace(/\s+$/, ''));
  vm.setLines(trimmed);
}

// ---------------------------------------------------------------------------
// Delete Duplicate Lines
// ---------------------------------------------------------------------------
function deleteDuplicateLines(vm: any): void {
  const lines = vm.getLines() as string[];
  const seen = new Set<string>();
  const unique = lines.filter((l: string) => {
    if (seen.has(l)) return false;
    seen.add(l);
    return true;
  });
  vm.setLines(unique);
  const cursor = vm.getCursorPosition();
  vm.setCursorPosition({
    line: Math.min(cursor.line, unique.length - 1),
    column: cursor.column,
  });
}

// ---------------------------------------------------------------------------
// Join Lines (Ctrl+J) — joins current line with the next
// ---------------------------------------------------------------------------
function joinLines(vm: any): void {
  const { startLine, endLine } = getLineRange(vm);
  const lines = vm.getLines() as string[];

  let targetEndLine = endLine;
  if (startLine === endLine) {
    // No selection — join current with next
    targetEndLine = Math.min(startLine + 1, lines.length - 1);
  }

  if (targetEndLine <= startLine) return;

  const joined = lines
    .slice(startLine, targetEndLine + 1)
    .map((l: string) => l.trimEnd())
    .join(' ');

  lines.splice(startLine, targetEndLine - startLine + 1, joined);
  vm.setLines(lines);

  vm.setCursorPosition({ line: startLine, column: Math.max(0, joined.length) });
  vm.clearSelection();
}

// ---------------------------------------------------------------------------
// Transpose Characters — swap char before and at cursor
// ---------------------------------------------------------------------------
function transposeCharacters(vm: any): void {
  const cursor = vm.getCursorPosition();
  const line = vm.getLine(cursor.line) as string;
  if (cursor.column < 1 || cursor.column > line.length) return;

  const col = cursor.column === line.length ? cursor.column - 1 : cursor.column;
  if (col < 1) return;

  const newLine =
    line.slice(0, col - 1) +
    line[col] +
    line[col - 1] +
    line.slice(col + 1);
  vm.setLine(cursor.line, newLine);
  vm.setCursorPosition({ line: cursor.line, column: col + 1 });
}

// ---------------------------------------------------------------------------
// Transform UPPERCASE
// ---------------------------------------------------------------------------
function transformToUppercase(vm: any): void {
  if (vm.hasSelection()) {
    const sel = vm.getSelection();
    let l1 = sel.start.line, c1 = sel.start.column;
    let l2 = sel.end.line, c2 = sel.end.column;
    if (l1 > l2 || (l1 === l2 && c1 > c2)) { [l1, l2] = [l2, l1]; [c1, c2] = [c2, c1]; }
    for (let l = l1; l <= l2; l++) {
      const lineText = vm.getLine(l) as string;
      const sc = l === l1 ? c1 : 0;
      const ec = l === l2 ? c2 : lineText.length;
      vm.setLine(l, lineText.slice(0, sc) + lineText.slice(sc, ec).toUpperCase() + lineText.slice(ec));
    }
  } else {
    const cursor = vm.getCursorPosition();
    const line = vm.getLine(cursor.line) as string;
    vm.setLine(cursor.line, line.toUpperCase());
  }
}

// ---------------------------------------------------------------------------
// Transform lowercase
// ---------------------------------------------------------------------------
function transformToLowercase(vm: any): void {
  if (vm.hasSelection()) {
    const sel = vm.getSelection();
    let l1 = sel.start.line, c1 = sel.start.column;
    let l2 = sel.end.line, c2 = sel.end.column;
    if (l1 > l2 || (l1 === l2 && c1 > c2)) { [l1, l2] = [l2, l1]; [c1, c2] = [c2, c1]; }
    for (let l = l1; l <= l2; l++) {
      const lineText = vm.getLine(l) as string;
      const sc = l === l1 ? c1 : 0;
      const ec = l === l2 ? c2 : lineText.length;
      vm.setLine(l, lineText.slice(0, sc) + lineText.slice(sc, ec).toLowerCase() + lineText.slice(ec));
    }
  } else {
    const cursor = vm.getCursorPosition();
    const line = vm.getLine(cursor.line) as string;
    vm.setLine(cursor.line, line.toLowerCase());
  }
}

// ---------------------------------------------------------------------------
// Transform Title Case
// ---------------------------------------------------------------------------
function transformToTitlecase(vm: any): void {
  const toTitle = (s: string) =>
    s.replace(/\b\w/g, (c) => c.toUpperCase());

  if (vm.hasSelection()) {
    const sel = vm.getSelection();
    let l1 = sel.start.line, c1 = sel.start.column;
    let l2 = sel.end.line, c2 = sel.end.column;
    if (l1 > l2 || (l1 === l2 && c1 > c2)) { [l1, l2] = [l2, l1]; [c1, c2] = [c2, c1]; }
    for (let l = l1; l <= l2; l++) {
      const lineText = vm.getLine(l) as string;
      const sc = l === l1 ? c1 : 0;
      const ec = l === l2 ? c2 : lineText.length;
      vm.setLine(l, lineText.slice(0, sc) + toTitle(lineText.slice(sc, ec)) + lineText.slice(ec));
    }
  } else {
    const cursor = vm.getCursorPosition();
    const line = vm.getLine(cursor.line) as string;
    vm.setLine(cursor.line, toTitle(line));
  }
}

// ---------------------------------------------------------------------------
// Register all commands
// ---------------------------------------------------------------------------

commandRegistry.registerCommand({
  command: { id: 'moveLinesUp', execute: ({ viewModel }) => moveLinesUp(viewModel) },
  keybindings: [{ key: 'Alt+ArrowUp' }],
  title: 'Move Line Up',
  category: 'Editor',
});

commandRegistry.registerCommand({
  command: { id: 'moveLinesDown', execute: ({ viewModel }) => moveLinesDown(viewModel) },
  keybindings: [{ key: 'Alt+ArrowDown' }],
  title: 'Move Line Down',
  category: 'Editor',
});

commandRegistry.registerCommand({
  command: { id: 'copyLinesUp', execute: ({ viewModel }) => copyLinesUp(viewModel) },
  keybindings: [{ key: 'Alt+Shift+ArrowUp' }],
  title: 'Copy Line Up',
  category: 'Editor',
});

commandRegistry.registerCommand({
  command: { id: 'copyLinesDown', execute: ({ viewModel }) => copyLinesDown(viewModel) },
  keybindings: [{ key: 'Alt+Shift+ArrowDown' }],
  title: 'Copy Line Down',
  category: 'Editor',
});

commandRegistry.registerCommand({
  command: { id: 'sortLinesAscending', execute: ({ viewModel }) => sortLinesAscending(viewModel) },
  keybindings: [],
  title: 'Sort Lines Ascending',
  category: 'Editor',
});

commandRegistry.registerCommand({
  command: { id: 'sortLinesDescending', execute: ({ viewModel }) => sortLinesDescending(viewModel) },
  keybindings: [],
  title: 'Sort Lines Descending',
  category: 'Editor',
});

commandRegistry.registerCommand({
  command: { id: 'trimTrailingWhitespace', execute: ({ viewModel }) => trimTrailingWhitespace(viewModel) },
  keybindings: [],
  title: 'Trim Trailing Whitespace',
  category: 'Editor',
});

commandRegistry.registerCommand({
  command: { id: 'deleteDuplicateLines', execute: ({ viewModel }) => deleteDuplicateLines(viewModel) },
  keybindings: [],
  title: 'Delete Duplicate Lines',
  category: 'Editor',
});

commandRegistry.registerCommand({
  command: { id: 'joinLines', execute: ({ viewModel }) => joinLines(viewModel) },
  keybindings: [{ key: 'Ctrl+J' }],
  title: 'Join Lines',
  category: 'Editor',
});

commandRegistry.registerCommand({
  command: { id: 'transposeCharacters', execute: ({ viewModel }) => transposeCharacters(viewModel) },
  keybindings: [],
  title: 'Transpose Characters',
  category: 'Editor',
});

commandRegistry.registerCommand({
  command: { id: 'transformToUppercase', execute: ({ viewModel }) => transformToUppercase(viewModel) },
  keybindings: [],
  title: 'Transform to UPPERCASE',
  category: 'Editor',
});

commandRegistry.registerCommand({
  command: { id: 'transformToLowercase', execute: ({ viewModel }) => transformToLowercase(viewModel) },
  keybindings: [],
  title: 'Transform to lowercase',
  category: 'Editor',
});

commandRegistry.registerCommand({
  command: { id: 'transformToTitlecase', execute: ({ viewModel }) => transformToTitlecase(viewModel) },
  keybindings: [],
  title: 'Transform to Title Case',
  category: 'Editor',
});
