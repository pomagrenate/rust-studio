/**
 * SelectionCommands.ts - Selection manipulation commands
 * Implements select all, selection extension, and cancellation
 */

import { commandRegistry } from './CommandRegistry';
import { Position, Selection } from './NavigationCommands';

export interface SelectionArgs {
  viewModel: any;
}

/**
 * Select all text in the document
 */
export function selectAll(viewModel: any): Selection {
  const lineCount = viewModel.getLineCount();
  const lastLine = viewModel.getLine(lineCount - 1);
  return {
    start: { line: 0, column: 0 },
    end: { line: lineCount - 1, column: lastLine.length }
  };
}

/**
 * Cancel selection and move cursor to anchor
 */
export function cancelSelection(viewModel: any): Position {
  const selection = viewModel.getSelection();
  return selection.start;
}

/**
 * Extend selection to position
 */
export function extendSelection(viewModel: any, position: Position): Selection {
  const selection = viewModel.getSelection();
  const anchor = selection.start;
  return {
    start: anchor,
    end: position
  };
}

/**
 * Extend selection left with line-boundary wrapping
 */
export function extendSelectionLeft(viewModel: any): Selection {
  const selection = viewModel.getSelection();
  const cursor = selection.end;
  if (cursor.column > 0) {
    return {
      start: selection.start,
      end: { line: cursor.line, column: cursor.column - 1 }
    };
  } else if (cursor.line > 0) {
    const prevLineLen = viewModel.getLine(cursor.line - 1).length;
    return {
      start: selection.start,
      end: { line: cursor.line - 1, column: prevLineLen }
    };
  }
  return selection;
}

/**
 * Extend selection right with line-boundary wrapping
 */
export function extendSelectionRight(viewModel: any): Selection {
  const selection = viewModel.getSelection();
  const cursor = selection.end;
  const line = viewModel.getLine(cursor.line);
  if (cursor.column < line.length) {
    return {
      start: selection.start,
      end: { line: cursor.line, column: cursor.column + 1 }
    };
  } else if (cursor.line < viewModel.getLineCount() - 1) {
    return {
      start: selection.start,
      end: { line: cursor.line + 1, column: 0 }
    };
  }
  return selection;
}

/**
 * Extend selection up
 */
export function extendSelectionUp(viewModel: any): Selection {
  const selection = viewModel.getSelection();
  const cursor = selection.end;
  if (cursor.line > 0) {
    const line = viewModel.getLine(cursor.line - 1);
    const newColumn = Math.min(cursor.column, line.length);
    return {
      start: selection.start,
      end: { line: cursor.line - 1, column: newColumn }
    };
  }
  return selection;
}

/**
 * Extend selection down
 */
export function extendSelectionDown(viewModel: any): Selection {
  const selection = viewModel.getSelection();
  const cursor = selection.end;
  const lineCount = viewModel.getLineCount();
  if (cursor.line < lineCount - 1) {
    const line = viewModel.getLine(cursor.line + 1);
    const newColumn = Math.min(cursor.column, line.length);
    return {
      start: selection.start,
      end: { line: cursor.line + 1, column: newColumn }
    };
  }
  return selection;
}

/**
 * Extend selection to word start
 */
export function extendSelectionWordStart(viewModel: any): Selection {
  const selection = viewModel.getSelection();
  const cursor = selection.end;
  const line = viewModel.getLine(cursor.line);
  
  // Find word start
  let i = cursor.column - 1;
  while (i >= 0 && !/[a-zA-Z0-9_]/.test(line[i])) {
    i--;
  }
  while (i >= 0 && /[a-zA-Z0-9_]/.test(line[i])) {
    i--;
  }
  const newColumn = i + 1;
  
  return {
    start: selection.start,
    end: { line: cursor.line, column: newColumn }
  };
}

/**
 * Extend selection to word end
 */
export function extendSelectionWordEnd(viewModel: any): Selection {
  const selection = viewModel.getSelection();
  const cursor = selection.end;
  const line = viewModel.getLine(cursor.line);
  
  // Find word end
  let i = cursor.column;
  while (i < line.length && /[a-zA-Z0-9_]/.test(line[i])) {
    i++;
  }
  while (i < line.length && !/[a-zA-Z0-9_]/.test(line[i])) {
    i++;
  }
  const newColumn = i;
  
  return {
    start: selection.start,
    end: { line: cursor.line, column: newColumn }
  };
}

/**
 * Extend selection to line start
 */
export function extendSelectionLineStart(viewModel: any): Selection {
  const selection = viewModel.getSelection();
  const cursor = selection.end;
  const line = viewModel.getLine(cursor.line);
  const trimmed = line.trimLeft();
  const firstNonWhitespace = line.indexOf(trimmed);
  const newColumn = cursor.column === firstNonWhitespace ? 0 : firstNonWhitespace;
  
  return {
    start: selection.start,
    end: { line: cursor.line, column: newColumn }
  };
}

/**
 * Extend selection to line end
 */
export function extendSelectionLineEnd(viewModel: any): Selection {
  const selection = viewModel.getSelection();
  const cursor = selection.end;
  const line = viewModel.getLine(cursor.line);
  
  return {
    start: selection.start,
    end: { line: cursor.line, column: line.length }
  };
}

/**
 * Extend selection to document start
 */
export function extendSelectionDocumentStart(viewModel: any): Selection {
  const selection = viewModel.getSelection();
  return {
    start: selection.start,
    end: { line: 0, column: 0 }
  };
}

/**
 * Extend selection to document end
 */
export function extendSelectionDocumentEnd(viewModel: any): Selection {
  const selection = viewModel.getSelection();
  const lineCount = viewModel.getLineCount();
  const lastLine = viewModel.getLine(lineCount - 1);
  return {
    start: selection.start,
    end: { line: lineCount - 1, column: lastLine.length }
  };
}

// Register selection commands
commandRegistry.registerCommand({
  command: {
    id: 'selectAll',
    execute: (args: SelectionArgs) => {
      const newSelection = selectAll(args.viewModel);
      args.viewModel.setSelection(newSelection);
    }
  },
  keybindings: [
    { key: 'Ctrl+A' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'cancelSelection',
    execute: (args: SelectionArgs) => {
      const newPos = cancelSelection(args.viewModel);
      args.viewModel.setCursorPosition(newPos);
      args.viewModel.clearSelection();
    }
  },
  keybindings: [
    { key: 'Escape' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'cursorLeftSelect',
    execute: (args: SelectionArgs) => {
      const newSelection = extendSelectionLeft(args.viewModel);
      args.viewModel.setSelection(newSelection);
    }
  },
  keybindings: [
    { key: 'Shift+LeftArrow' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'cursorRightSelect',
    execute: (args: SelectionArgs) => {
      const newSelection = extendSelectionRight(args.viewModel);
      args.viewModel.setSelection(newSelection);
    }
  },
  keybindings: [
    { key: 'Shift+RightArrow' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'cursorUpSelect',
    execute: (args: SelectionArgs) => {
      const newSelection = extendSelectionUp(args.viewModel);
      args.viewModel.setSelection(newSelection);
    }
  },
  keybindings: [
    { key: 'Shift+UpArrow' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'cursorDownSelect',
    execute: (args: SelectionArgs) => {
      const newSelection = extendSelectionDown(args.viewModel);
      args.viewModel.setSelection(newSelection);
    }
  },
  keybindings: [
    { key: 'Shift+DownArrow' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'cursorWordStartSelect',
    execute: (args: SelectionArgs) => {
      const newSelection = extendSelectionWordStart(args.viewModel);
      args.viewModel.setSelection(newSelection);
    }
  },
  keybindings: [
    { key: 'Ctrl+Shift+Left', platform: 'windows' },
    { key: 'Ctrl+Shift+Left', platform: 'linux' },
    { key: 'Alt+Shift+Left', platform: 'mac' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'cursorWordEndSelect',
    execute: (args: SelectionArgs) => {
      const newSelection = extendSelectionWordEnd(args.viewModel);
      args.viewModel.setSelection(newSelection);
    }
  },
  keybindings: [
    { key: 'Ctrl+Shift+Right', platform: 'windows' },
    { key: 'Ctrl+Shift+Right', platform: 'linux' },
    { key: 'Alt+Shift+Right', platform: 'mac' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'cursorLineStartSelect',
    execute: (args: SelectionArgs) => {
      const newSelection = extendSelectionLineStart(args.viewModel);
      args.viewModel.setSelection(newSelection);
    }
  },
  keybindings: [
    { key: 'Shift+Home' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'cursorLineEndSelect',
    execute: (args: SelectionArgs) => {
      const newSelection = extendSelectionLineEnd(args.viewModel);
      args.viewModel.setSelection(newSelection);
    }
  },
  keybindings: [
    { key: 'Shift+End' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'cursorDocumentStartSelect',
    execute: (args: SelectionArgs) => {
      const newSelection = extendSelectionDocumentStart(args.viewModel);
      args.viewModel.setSelection(newSelection);
    }
  },
  keybindings: [
    { key: 'Ctrl+Shift+Home', platform: 'windows' },
    { key: 'Ctrl+Shift+Home', platform: 'linux' },
    { key: 'Cmd+Shift+Up', platform: 'mac' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'cursorDocumentEndSelect',
    execute: (args: SelectionArgs) => {
      const newSelection = extendSelectionDocumentEnd(args.viewModel);
      args.viewModel.setSelection(newSelection);
    }
  },
  keybindings: [
    { key: 'Ctrl+Shift+End', platform: 'windows' },
    { key: 'Ctrl+Shift+End', platform: 'linux' },
    { key: 'Cmd+Shift+Down', platform: 'mac' }
  ]
});
