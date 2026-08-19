/**
 * AutoClosingCommands.ts - Auto-closing brackets and quotes
 * Implements automatic insertion of closing brackets, quotes, and tags
 * Enhanced with Rust-specific smart logic from surroundWith utility
 */

import { commandRegistry } from './CommandRegistry';
import { shouldAutoClose as shouldAutoCloseRust, shouldWrapSelection } from '../../../utils/surroundWith';

export interface AutoClosingArgs {
  viewModel: any;
  character: string;
  position: { line: number; column: number };
}

/**
 * Bracket pair configuration
 */
const BRACKET_PAIRS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  "'": "'",
  '`': '`',
  '<': '>',
};

/**
 * Check if a character should auto-close
 */
export function shouldAutoClose(character: string): boolean {
  return BRACKET_PAIRS.hasOwnProperty(character);
}

/**
 * Get the closing character for an opening character
 */
export function getClosingCharacter(opening: string): string {
  return BRACKET_PAIRS[opening] || '';
}

/**
 * Auto-insert closing bracket/quote
 */
export function autoInsertClosing(args: AutoClosingArgs): void {
  const { viewModel, character, position } = args;
  const closing = getClosingCharacter(character);
  
  if (!closing) return;
  
  const line = viewModel.getLine(position.line);
  const before = line.substring(0, position.column);
  const after = line.substring(position.column);
  
  // Insert opening and closing
  const newLine = before + character + closing + after;
  viewModel.setLine(position.line, newLine);
  
  // Move cursor between the pair
  viewModel.setCursorPosition({ line: position.line, column: position.column + 1 });
}

/**
 * Skip over closing bracket if already present
 */
export function skipOverClosing(args: AutoClosingArgs): void {
  const { viewModel, character, position } = args;
  const line = viewModel.getLine(position.line);
  
  if (position.column < line.length && line[position.column] === character) {
    // Skip over existing closing character
    viewModel.setCursorPosition({ line: position.line, column: position.column + 1 });
  } else {
    // Just insert the character
    const before = line.substring(0, position.column);
    const after = line.substring(position.column);
    const newLine = before + character + after;
    viewModel.setLine(position.line, newLine);
    viewModel.setCursorPosition({ line: position.line, column: position.column + 1 });
  }
}

/**
 * Wrap selection in brackets
 */
export function wrapSelection(args: AutoClosingArgs): void {
  const { viewModel, character } = args;
  const closing = getClosingCharacter(character);
  
  if (!closing) return;
  
  const selection = viewModel.getSelection();
  if (!viewModel.hasSelection()) {
    // No selection, just auto-insert
    autoInsertClosing(args);
    return;
  }
  
  const startLine = Math.min(selection.start.line, selection.end.line);
  const endLine = Math.max(selection.start.line, selection.end.line);
  const startCol = Math.min(selection.start.column, selection.end.column);
  const endCol = Math.max(selection.start.column, selection.end.column);
  
  if (startLine === endLine) {
    // Single line selection
    const line = viewModel.getLine(startLine);
    const before = line.substring(0, startCol);
    const selected = line.substring(startCol, endCol);
    const after = line.substring(endCol);
    
    const newLine = before + character + selected + closing + after;
    viewModel.setLine(startLine, newLine);
    
    // Clear selection and move cursor after closing
    viewModel.clearSelection();
    viewModel.setCursorPosition({ line: startLine, column: endCol + 2 });
  }
  // Multi-line wrapping is more complex and would need additional logic
}

/**
 * Check if cursor is inside a string literal
 */
export function isInsideString(viewModel: any, position: { line: number; column: number }): boolean {
  const line = viewModel.getLine(position.line);
  let inString = false;
  let stringChar = '';
  
  for (let i = 0; i < position.column; i++) {
    const char = line[i];
    
    if (char === '\\' && i + 1 < line.length) {
      // Escape sequence, skip next character
      i++;
      continue;
    }
    
    if (!inString && (char === '"' || char === '\'' || char === '`')) {
      inString = true;
      stringChar = char;
    } else if (inString && char === stringChar) {
      inString = false;
      stringChar = '';
    }
  }
  
  return inString;
}

/**
 * Check if cursor is inside a comment
 */
export function isInsideComment(viewModel: any, position: { line: number; column: number }): boolean {
  const line = viewModel.getLine(position.line);
  const trimmed = line.trim();
  
  // Check for line comment
  if (trimmed.startsWith('//')) {
    return true;
  }
  
  // Check for block comment (simplified)
  if (trimmed.startsWith('/*') || trimmed.contains('*/')) {
    return true;
  }
  
  return false;
}

/**
 * Smart auto-close that considers context
 * Enhanced with Rust-specific logic from surroundWith utility
 */
export function smartAutoClose(args: AutoClosingArgs): void {
  const { viewModel, character, position } = args;
  
  // Get context for Rust-specific logic
  const line = viewModel.getLine(position.line);
  const before = line.substring(0, position.column);
  const after = line.substring(position.column);
  
  // Use Rust-specific smart auto-close check
  if (!shouldAutoCloseRust(character, before, after)) {
    skipOverClosing(args);
    return;
  }
  
  // Don't auto-close inside strings or comments
  if (isInsideString(viewModel, position) || isInsideComment(viewModel, position)) {
    skipOverClosing(args);
    return;
  }
  
  // Check if there's a selection and character should wrap it
  if (viewModel.hasSelection() && shouldWrapSelection(character)) {
    wrapSelection(args);
    return;
  }
  
  // Auto-insert closing character
  autoInsertClosing(args);
}

// Register auto-closing commands (these are typically triggered by typing, not keybindings)
commandRegistry.registerCommand({
  command: {
    id: 'autoCloseParen',
    execute: (args: AutoClosingArgs) => {
      smartAutoClose({ ...args, character: '(' });
    }
  },
  keybindings: []
});

commandRegistry.registerCommand({
  command: {
    id: 'autoCloseBracket',
    execute: (args: AutoClosingArgs) => {
      smartAutoClose({ ...args, character: '[' });
    }
  },
  keybindings: []
});

commandRegistry.registerCommand({
  command: {
    id: 'autoCloseBrace',
    execute: (args: AutoClosingArgs) => {
      smartAutoClose({ ...args, character: '{' });
    }
  },
  keybindings: []
});

commandRegistry.registerCommand({
  command: {
    id: 'autoCloseDoubleQuote',
    execute: (args: AutoClosingArgs) => {
      smartAutoClose({ ...args, character: '"' });
    }
  },
  keybindings: []
});

commandRegistry.registerCommand({
  command: {
    id: 'autoCloseSingleQuote',
    execute: (args: AutoClosingArgs) => {
      smartAutoClose({ ...args, character: "'" });
    }
  },
  keybindings: []
});

commandRegistry.registerCommand({
  command: {
    id: 'autoCloseBacktick',
    execute: (args: AutoClosingArgs) => {
      smartAutoClose({ ...args, character: '`' });
    }
  },
  keybindings: []
});
