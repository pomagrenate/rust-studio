/**
 * NavigationCommands.ts - Cursor navigation commands
 * Implements word, line, and document navigation
 */

import { commandRegistry } from './CommandRegistry';

export interface Position {
  line: number;
  column: number;
}

export interface Selection {
  start: Position;
  end: Position;
}

export interface NavigationArgs {
  viewModel: any; // Will be typed when ViewModel is implemented
  inSelectionMode?: boolean;
}

/**
 * Word boundary detection
 * Returns true if character is a word character (alphanumeric or underscore)
 */
function isWordChar(char: string): boolean {
  return /[a-zA-Z0-9_]/.test(char);
}

/**
 * Find word start position
 */
function findWordStart(line: string, column: number): number {
  if (column === 0) return 0;
  
  let i = column - 1;
  // Skip non-word characters
  while (i >= 0 && !isWordChar(line[i])) {
    i--;
  }
  // Skip word characters
  while (i >= 0 && isWordChar(line[i])) {
    i--;
  }
  return i + 1;
}

/**
 * Find word end position
 */
function findWordEnd(line: string, column: number): number {
  if (column >= line.length) return line.length;
  
  let i = column;
  // Skip word characters
  while (i < line.length && isWordChar(line[i])) {
    i++;
  }
  // Skip non-word characters
  while (i < line.length && !isWordChar(line[i])) {
    i++;
  }
  return i;
}

/**
 * Move cursor to previous word
 */
export function moveToWordStart(viewModel: any): Position {
  const cursor = viewModel.getCursorPosition();
  const line = viewModel.getLine(cursor.line);
  const newColumn = findWordStart(line, cursor.column);
  return { line: cursor.line, column: newColumn };
}

/**
 * Move cursor to next word
 */
export function moveToWordEnd(viewModel: any): Position {
  const cursor = viewModel.getCursorPosition();
  const line = viewModel.getLine(cursor.line);
  const newColumn = findWordEnd(line, cursor.column);
  return { line: cursor.line, column: newColumn };
}

/**
 * Move cursor to line start (first non-whitespace)
 */
export function moveToLineStart(viewModel: any): Position {
  const cursor = viewModel.getCursorPosition();
  const line = viewModel.getLine(cursor.line);
  const trimmed = line.trimLeft();
  const firstNonWhitespace = line.indexOf(trimmed);
  const newColumn = cursor.column === firstNonWhitespace ? 0 : firstNonWhitespace;
  return { line: cursor.line, column: newColumn };
}

/**
 * Move cursor to line end
 */
export function moveToLineEnd(viewModel: any): Position {
  const cursor = viewModel.getCursorPosition();
  const line = viewModel.getLine(cursor.line);
  return { line: cursor.line, column: line.length };
}

/**
 * Move cursor to document start
 */
export function moveToDocumentStart(): Position {
  return { line: 0, column: 0 };
}

/**
 * Move cursor to document end
 */
export function moveToDocumentEnd(viewModel: any): Position {
  const lineCount = viewModel.getLineCount();
  const lastLine = viewModel.getLine(lineCount - 1);
  return { line: lineCount - 1, column: lastLine.length };
}

/**
 * Move cursor left
 */
export function moveLeft(viewModel: any): Position {
  const cursor = viewModel.getCursorPosition();
  if (cursor.column > 0) {
    return { line: cursor.line, column: cursor.column - 1 };
  }
  return cursor;
}

/**
 * Move cursor right
 */
export function moveRight(viewModel: any): Position {
  const cursor = viewModel.getCursorPosition();
  const line = viewModel.getLine(cursor.line);
  if (cursor.column < line.length) {
    return { line: cursor.line, column: cursor.column + 1 };
  }
  return cursor;
}

/**
 * Move cursor up
 */
export function moveUp(viewModel: any): Position {
  const cursor = viewModel.getCursorPosition();
  if (cursor.line > 0) {
    const line = viewModel.getLine(cursor.line - 1);
    const newColumn = Math.min(cursor.column, line.length);
    return { line: cursor.line - 1, column: newColumn };
  }
  return cursor;
}

/**
 * Move cursor down
 */
export function moveDown(viewModel: any): Position {
  const cursor = viewModel.getCursorPosition();
  const lineCount = viewModel.getLineCount();
  if (cursor.line < lineCount - 1) {
    const line = viewModel.getLine(cursor.line + 1);
    const newColumn = Math.min(cursor.column, line.length);
    return { line: cursor.line + 1, column: newColumn };
  }
  return cursor;
}

// Register navigation commands
commandRegistry.registerCommand({
  command: {
    id: 'cursorWordStart',
    execute: (args: NavigationArgs) => {
      const newPos = moveToWordStart(args.viewModel);
      args.viewModel.setCursorPosition(newPos);
    }
  },
  keybindings: [
    { key: 'Ctrl+Left', platform: 'windows' },
    { key: 'Ctrl+Left', platform: 'linux' },
    { key: 'Alt+Left', platform: 'mac' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'cursorWordEnd',
    execute: (args: NavigationArgs) => {
      const newPos = moveToWordEnd(args.viewModel);
      args.viewModel.setCursorPosition(newPos);
    }
  },
  keybindings: [
    { key: 'Ctrl+Right', platform: 'windows' },
    { key: 'Ctrl+Right', platform: 'linux' },
    { key: 'Alt+Right', platform: 'mac' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'cursorLineStart',
    execute: (args: NavigationArgs) => {
      const newPos = moveToLineStart(args.viewModel);
      args.viewModel.setCursorPosition(newPos);
    }
  },
  keybindings: [
    { key: 'Home' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'cursorLineEnd',
    execute: (args: NavigationArgs) => {
      const newPos = moveToLineEnd(args.viewModel);
      args.viewModel.setCursorPosition(newPos);
    }
  },
  keybindings: [
    { key: 'End' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'cursorDocumentStart',
    execute: (args: NavigationArgs) => {
      const newPos = moveToDocumentStart();
      args.viewModel.setCursorPosition(newPos);
    }
  },
  keybindings: [
    { key: 'Ctrl+Home', platform: 'windows' },
    { key: 'Ctrl+Home', platform: 'linux' },
    { key: 'Cmd+Up', platform: 'mac' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'cursorDocumentEnd',
    execute: (args: NavigationArgs) => {
      const newPos = moveToDocumentEnd(args.viewModel);
      args.viewModel.setCursorPosition(newPos);
    }
  },
  keybindings: [
    { key: 'Ctrl+End', platform: 'windows' },
    { key: 'Ctrl+End', platform: 'linux' },
    { key: 'Cmd+Down', platform: 'mac' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'cursorLeft',
    execute: (args: NavigationArgs) => {
      const newPos = moveLeft(args.viewModel);
      args.viewModel.setCursorPosition(newPos);
    }
  },
  keybindings: [
    { key: 'LeftArrow' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'cursorRight',
    execute: (args: NavigationArgs) => {
      const newPos = moveRight(args.viewModel);
      args.viewModel.setCursorPosition(newPos);
    }
  },
  keybindings: [
    { key: 'RightArrow' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'cursorUp',
    execute: (args: NavigationArgs) => {
      const newPos = moveUp(args.viewModel);
      args.viewModel.setCursorPosition(newPos);
    }
  },
  keybindings: [
    { key: 'UpArrow' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'cursorDown',
    execute: (args: NavigationArgs) => {
      const newPos = moveDown(args.viewModel);
      args.viewModel.setCursorPosition(newPos);
    }
  },
  keybindings: [
    { key: 'DownArrow' }
  ]
});
