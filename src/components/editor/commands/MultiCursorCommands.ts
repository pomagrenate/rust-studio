/**
 * MultiCursorCommands.ts - Multi-cursor manipulation commands
 * Implements Alt+Click, Ctrl+D, Ctrl+Shift+L, Ctrl+Alt+Up/Down
 */

import { commandRegistry } from './CommandRegistry';
import { Position, Selection } from './NavigationCommands';
import { MultiCursorState } from '../viewModel/MultiCursorState';

export interface MultiCursorArgs {
  viewModel: any;
  multiCursorState: MultiCursorState;
  position?: Position;
}

/**
 * Add cursor at position (Alt+Click)
 */
export function addCursorAtPosition(args: MultiCursorArgs): void {
  const { multiCursorState, position } = args;
  if (!position) return;
  
  multiCursorState.addCursor(position);
}

/**
 * Select next occurrence of current selection (Ctrl+D)
 */
export function selectNextOccurrence(args: MultiCursorArgs): void {
  const { viewModel, multiCursorState } = args;
  
  const primaryCursor = multiCursorState.getPrimaryCursor();
  if (!primaryCursor) return;
  
  const currentSelection = primaryCursor.selection;
  let searchText = '';
  
  if (currentSelection) {
    // Get selected text
    const startLine = Math.min(currentSelection.start.line, currentSelection.end.line);
    const endLine = Math.max(currentSelection.start.line, currentSelection.end.line);
    
    if (startLine === endLine) {
      const line = viewModel.getLine(startLine);
      const startCol = Math.min(currentSelection.start.column, currentSelection.end.column);
      const endCol = Math.max(currentSelection.start.column, currentSelection.end.column);
      searchText = line.substring(startCol, endCol);
    }
  } else {
    // Get current word
    const cursor = primaryCursor.position;
    const line = viewModel.getLine(cursor.line);
    const wordStart = findWordStart(line, cursor.column);
    const wordEnd = findWordEnd(line, cursor.column);
    searchText = line.substring(wordStart, wordEnd);
  }
  
  if (!searchText) return;
  
  // Find next occurrence
  const lineCount = viewModel.getLineCount();
  const currentLine = primaryCursor.position.line;
  
  for (let line = currentLine + 1; line < lineCount; line++) {
    const lineContent = viewModel.getLine(line);
    const index = lineContent.indexOf(searchText);
    if (index !== -1) {
      // Add cursor at this occurrence
      const newPosition: Position = { line, column: index };
      multiCursorState.addCursor(newPosition);
      
      // Set selection for the new cursor
      const cursorIndex = multiCursorState.getCursorCount() - 1;
      const newSelection: Selection = {
        start: { line, column: index },
        end: { line, column: index + searchText.length }
      };
      multiCursorState.setSelection(cursorIndex, newSelection);
      
      break;
    }
  }
}

/**
 * Select all occurrences of current selection (Ctrl+Shift+L)
 */
export function selectAllOccurrences(args: MultiCursorArgs): void {
  const { viewModel, multiCursorState } = args;
  
  const primaryCursor = multiCursorState.getPrimaryCursor();
  if (!primaryCursor) return;
  
  const currentSelection = primaryCursor.selection;
  let searchText = '';
  
  if (currentSelection) {
    const startLine = Math.min(currentSelection.start.line, currentSelection.end.line);
    const endLine = Math.max(currentSelection.start.line, currentSelection.end.line);
    
    if (startLine === endLine) {
      const line = viewModel.getLine(startLine);
      const startCol = Math.min(currentSelection.start.column, currentSelection.end.column);
      const endCol = Math.max(currentSelection.start.column, currentSelection.end.column);
      searchText = line.substring(startCol, endCol);
    }
  } else {
    const cursor = primaryCursor.position;
    const line = viewModel.getLine(cursor.line);
    const wordStart = findWordStart(line, cursor.column);
    const wordEnd = findWordEnd(line, cursor.column);
    searchText = line.substring(wordStart, wordEnd);
  }
  
  if (!searchText) return;
  
  // Reset cursors and find all occurrences
  multiCursorState.reset(primaryCursor.position);
  
  const lineCount = viewModel.getLineCount();
  for (let line = 0; line < lineCount; line++) {
    const lineContent = viewModel.getLine(line);
    let index = lineContent.indexOf(searchText);
    
    while (index !== -1) {
      const newPosition: Position = { line, column: index };
      multiCursorState.addCursor(newPosition);
      
      const cursorIndex = multiCursorState.getCursorCount() - 1;
      const newSelection: Selection = {
        start: { line, column: index },
        end: { line, column: index + searchText.length }
      };
      multiCursorState.setSelection(cursorIndex, newSelection);
      
      index = lineContent.indexOf(searchText, index + 1);
    }
  }
}

/**
 * Add cursor above (Ctrl+Alt+Up)
 */
export function addCursorAbove(args: MultiCursorArgs): void {
  const { multiCursorState } = args;
  
  const primaryCursor = multiCursorState.getPrimaryCursor();
  if (!primaryCursor) return;
  
  const currentLine = primaryCursor.position.line;
  if (currentLine === 0) return;
  
  const newPosition: Position = {
    line: currentLine - 1,
    column: primaryCursor.position.column
  };
  
  multiCursorState.addCursor(newPosition);
}

/**
 * Add cursor below (Ctrl+Alt+Down)
 */
export function addCursorBelow(args: MultiCursorArgs): void {
  const { viewModel, multiCursorState } = args;
  
  const primaryCursor = multiCursorState.getPrimaryCursor();
  if (!primaryCursor) return;
  
  const currentLine = primaryCursor.position.line;
  const lineCount = viewModel.getLineCount();
  if (currentLine >= lineCount - 1) return;
  
  const newPosition: Position = {
    line: currentLine + 1,
    column: primaryCursor.position.column
  };
  
  multiCursorState.addCursor(newPosition);
}

/**
 * Remove secondary cursors (Escape when multiple cursors)
 */
export function removeSecondaryCursors(args: MultiCursorArgs): void {
  const { multiCursorState } = args;
  multiCursorState.removeSecondaryCursors();
}

/**
 * Find word start position
 */
function findWordStart(line: string, column: number): number {
  if (column === 0) return 0;
  
  let i = column - 1;
  while (i >= 0 && !/[a-zA-Z0-9_]/.test(line[i])) {
    i--;
  }
  while (i >= 0 && /[a-zA-Z0-9_]/.test(line[i])) {
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
  while (i < line.length && /[a-zA-Z0-9_]/.test(line[i])) {
    i++;
  }
  while (i < line.length && !/[a-zA-Z0-9_]/.test(line[i])) {
    i++;
  }
  return i;
}

// Register multi-cursor commands
commandRegistry.registerCommand({
  command: {
    id: 'addCursorAtPosition',
    execute: (args: MultiCursorArgs) => {
      addCursorAtPosition(args);
    }
  },
  keybindings: [] // Alt+Click is handled by mouse handler
});

commandRegistry.registerCommand({
  command: {
    id: 'selectNextOccurrence',
    execute: (args: MultiCursorArgs) => {
      selectNextOccurrence(args);
    }
  },
  keybindings: [
    { key: 'Ctrl+D' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'selectAllOccurrences',
    execute: (args: MultiCursorArgs) => {
      selectAllOccurrences(args);
    }
  },
  keybindings: [
    { key: 'Ctrl+Shift+L' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'addCursorAbove',
    execute: (args: MultiCursorArgs) => {
      addCursorAbove(args);
    }
  },
  keybindings: [
    { key: 'Ctrl+Alt+Up', platform: 'windows' },
    { key: 'Ctrl+Alt+Up', platform: 'linux' },
    { key: 'Cmd+Alt+Up', platform: 'mac' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'addCursorBelow',
    execute: (args: MultiCursorArgs) => {
      addCursorBelow(args);
    }
  },
  keybindings: [
    { key: 'Ctrl+Alt+Down', platform: 'windows' },
    { key: 'Ctrl+Alt+Down', platform: 'linux' },
    { key: 'Cmd+Alt+Down', platform: 'mac' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'removeSecondaryCursors',
    execute: (args: MultiCursorArgs) => {
      removeSecondaryCursors(args);
    }
  },
  keybindings: [] // Handled by Escape key in selection commands
});
