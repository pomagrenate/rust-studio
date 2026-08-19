/**
 * EditingCommands.ts - Text editing commands
 * Implements indentation, deletion, and basic text operations
 */

import { commandRegistry } from './CommandRegistry';

export interface EditingArgs {
  viewModel: any;
}

/**
 * Indent selection or current line
 */
export function indentSelection(viewModel: any): void {
  const selection = viewModel.getSelection();
  const startLine = Math.min(selection.start.line, selection.end.line);
  const endLine = Math.max(selection.start.line, selection.end.line);
  
  for (let line = startLine; line <= endLine; line++) {
    const lineContent = viewModel.getLine(line);
    viewModel.setLine(line, '    ' + lineContent);
  }
}

/**
 * Outdent selection or current line
 */
export function outdentSelection(viewModel: any): void {
  const selection = viewModel.getSelection();
  const startLine = Math.min(selection.start.line, selection.end.line);
  const endLine = Math.max(selection.start.line, selection.end.line);
  
  for (let line = startLine; line <= endLine; line++) {
    const lineContent = viewModel.getLine(line);
    if (lineContent.startsWith('    ')) {
      viewModel.setLine(line, lineContent.substring(4));
    } else if (lineContent.startsWith('\t')) {
      viewModel.setLine(line, lineContent.substring(1));
    } else if (lineContent.startsWith(' ')) {
      viewModel.setLine(line, lineContent.trimLeft());
    }
  }
}

/**
 * Delete word to the left of cursor
 */
export function deleteWordLeft(viewModel: any): void {
  const cursor = viewModel.getCursorPosition();
  const line = viewModel.getLine(cursor.line);
  
  // Find word start
  let i = cursor.column - 1;
  while (i >= 0 && !/[a-zA-Z0-9_]/.test(line[i])) {
    i--;
  }
  while (i >= 0 && /[a-zA-Z0-9_]/.test(line[i])) {
    i--;
  }
  const wordStart = i + 1;
  
  const newLine = line.substring(0, wordStart) + line.substring(cursor.column);
  viewModel.setLine(cursor.line, newLine);
  viewModel.setCursorPosition({ line: cursor.line, column: wordStart });
}

/**
 * Delete word to the right of cursor
 */
export function deleteWordRight(viewModel: any): void {
  const cursor = viewModel.getCursorPosition();
  const line = viewModel.getLine(cursor.line);
  
  // Find word end
  let i = cursor.column;
  while (i < line.length && /[a-zA-Z0-9_]/.test(line[i])) {
    i++;
  }
  while (i < line.length && !/[a-zA-Z0-9_]/.test(line[i])) {
    i++;
  }
  const wordEnd = i;
  
  const newLine = line.substring(0, cursor.column) + line.substring(wordEnd);
  viewModel.setLine(cursor.line, newLine);
  viewModel.setCursorPosition({ line: cursor.line, column: cursor.column });
}

/**
 * Delete to line start
 */
export function deleteToLineStart(viewModel: any): void {
  const cursor = viewModel.getCursorPosition();
  const line = viewModel.getLine(cursor.line);
  const newLine = line.substring(cursor.column);
  viewModel.setLine(cursor.line, newLine);
  viewModel.setCursorPosition({ line: cursor.line, column: 0 });
}

/**
 * Delete to line end
 */
export function deleteToLineEnd(viewModel: any): void {
  const cursor = viewModel.getCursorPosition();
  const line = viewModel.getLine(cursor.line);
  const newLine = line.substring(0, cursor.column);
  viewModel.setLine(cursor.line, newLine);
}

/**
 * Delete current line
 */
export function deleteLine(viewModel: any): void {
  const cursor = viewModel.getCursorPosition();
  const lineCount = viewModel.getLineCount();
  
  if (lineCount === 1) {
    viewModel.setLine(0, '');
    viewModel.setCursorPosition({ line: 0, column: 0 });
  } else if (cursor.line === lineCount - 1) {
    // Last line
    viewModel.deleteLine(cursor.line);
    const prevLine = viewModel.getLine(cursor.line - 1);
    viewModel.setCursorPosition({ line: cursor.line - 1, column: prevLine.length });
  } else {
    viewModel.deleteLine(cursor.line);
    viewModel.setCursorPosition({ line: cursor.line, column: 0 });
  }
}

/**
 * Insert line below
 */
export function insertLineBelow(viewModel: any): void {
  const cursor = viewModel.getCursorPosition();
  const line = viewModel.getLine(cursor.line);
  const indentation = line.match(/^\s*/)?.[0] || '';
  
  viewModel.insertLine(cursor.line + 1, indentation);
  viewModel.setCursorPosition({ line: cursor.line + 1, column: indentation.length });
}

/**
 * Insert line above
 */
export function insertLineAbove(viewModel: any): void {
  const cursor = viewModel.getCursorPosition();
  const line = viewModel.getLine(cursor.line);
  const indentation = line.match(/^\s*/)?.[0] || '';
  
  viewModel.insertLine(cursor.line, indentation);
  viewModel.setCursorPosition({ line: cursor.line, column: indentation.length });
}

/**
 * Duplicate selection or current line
 */
export function duplicateSelection(viewModel: any): void {
  const selection = viewModel.getSelection();
  
  if (viewModel.hasSelection()) {
    const startLine = Math.min(selection.start.line, selection.end.line);
    const endLine = Math.max(selection.start.line, selection.end.line);
    const linesToDuplicate = [];
    
    for (let line = startLine; line <= endLine; line++) {
      linesToDuplicate.push(viewModel.getLine(line));
    }
    
    let insertPosition = endLine + 1;
    for (const lineContent of linesToDuplicate) {
      viewModel.insertLine(insertPosition, lineContent);
      insertPosition++;
    }
  } else {
    const cursor = viewModel.getCursorPosition();
    const line = viewModel.getLine(cursor.line);
    viewModel.insertLine(cursor.line + 1, line);
    viewModel.setCursorPosition({ line: cursor.line + 1, column: cursor.column });
  }
}

// Register editing commands
commandRegistry.registerCommand({
  command: {
    id: 'indent',
    execute: (args: EditingArgs) => {
      indentSelection(args.viewModel);
    }
  },
  keybindings: [
    { key: 'Tab' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'outdent',
    execute: (args: EditingArgs) => {
      outdentSelection(args.viewModel);
    }
  },
  keybindings: [
    { key: 'Shift+Tab' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'deleteWordLeft',
    execute: (args: EditingArgs) => {
      deleteWordLeft(args.viewModel);
    }
  },
  keybindings: [
    { key: 'Ctrl+Backspace', platform: 'windows' },
    { key: 'Ctrl+Backspace', platform: 'linux' },
    { key: 'Alt+Backspace', platform: 'mac' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'deleteWordRight',
    execute: (args: EditingArgs) => {
      deleteWordRight(args.viewModel);
    }
  },
  keybindings: [
    { key: 'Ctrl+Delete', platform: 'windows' },
    { key: 'Ctrl+Delete', platform: 'linux' },
    { key: 'Alt+Delete', platform: 'mac' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'deleteToLineStart',
    execute: (args: EditingArgs) => {
      deleteToLineStart(args.viewModel);
    }
  },
  keybindings: [
    { key: 'Ctrl+Shift+Backspace', platform: 'windows' },
    { key: 'Ctrl+Shift+Backspace', platform: 'linux' },
    { key: 'Cmd+Shift+Backspace', platform: 'mac' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'deleteToLineEnd',
    execute: (args: EditingArgs) => {
      deleteToLineEnd(args.viewModel);
    }
  },
  keybindings: [
    { key: 'Ctrl+Shift+Delete', platform: 'windows' },
    { key: 'Ctrl+Shift+Delete', platform: 'linux' },
    { key: 'Cmd+Shift+Delete', platform: 'mac' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'deleteLine',
    execute: (args: EditingArgs) => {
      deleteLine(args.viewModel);
    }
  },
  keybindings: [
    { key: 'Ctrl+Shift+K' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'insertLineBelow',
    execute: (args: EditingArgs) => {
      insertLineBelow(args.viewModel);
    }
  },
  keybindings: [
    { key: 'Ctrl+Enter' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'insertLineAbove',
    execute: (args: EditingArgs) => {
      insertLineAbove(args.viewModel);
    }
  },
  keybindings: [
    { key: 'Ctrl+Shift+Enter' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'duplicateSelection',
    execute: (args: EditingArgs) => {
      duplicateSelection(args.viewModel);
    }
  },
  keybindings: [
    { key: 'Ctrl+D' }
  ]
});
