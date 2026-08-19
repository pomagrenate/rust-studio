/**
 * ClipboardCommands.ts - Clipboard operations (Cut, Copy, Paste)
 * Implements clipboard integration using browser clipboard API
 */

import { commandRegistry } from './CommandRegistry';
import { Selection } from './NavigationCommands';

/**
 * Read text from clipboard
 */
async function readText(): Promise<string> {
  try {
    return await navigator.clipboard.readText();
  } catch (e) {
    console.error('Failed to read from clipboard:', e);
    return '';
  }
}

/**
 * Write text to clipboard
 */
async function writeText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    console.error('Failed to write to clipboard:', e);
  }
}

export interface ClipboardArgs {
  viewModel: any;
}

/**
 * Copy selected text to clipboard
 */
export async function copySelection(args: ClipboardArgs): Promise<void> {
  const { viewModel } = args;
  
  if (!viewModel.hasSelection()) {
    return;
  }
  
  const selection = viewModel.getSelection();
  const text = getSelectedText(viewModel, selection);
  
  await writeText(text);
}

/**
 * Cut selected text to clipboard
 */
export async function cutSelection(args: ClipboardArgs): Promise<void> {
  const { viewModel } = args;
  
  if (!viewModel.hasSelection()) {
    return;
  }
  
  const selection = viewModel.getSelection();
  const text = getSelectedText(viewModel, selection);
  
  // Copy to clipboard
  await writeText(text);
  
  // Delete selected text
  deleteSelectedText(viewModel, selection);
}

/**
 * Paste text from clipboard at cursor position
 */
export async function pasteText(args: ClipboardArgs): Promise<void> {
  const { viewModel } = args;
  
  const text = await readText();
  if (!text) return;
  
  const cursor = viewModel.getCursorPosition();
  
  if (viewModel.hasSelection()) {
    // Delete selection first
    const selection = viewModel.getSelection();
    deleteSelectedText(viewModel, selection);
  }
  
  // Insert text
  insertTextAtPosition(viewModel, cursor, text);
}

/**
 * Get selected text from selection
 */
function getSelectedText(viewModel: any, selection: Selection): string {
  const startLine = Math.min(selection.start.line, selection.end.line);
  const endLine = Math.max(selection.start.line, selection.end.line);
  const startCol = Math.min(selection.start.column, selection.end.column);
  const endCol = Math.max(selection.start.column, selection.end.column);
  
  if (startLine === endLine) {
    // Single line selection
    const line = viewModel.getLine(startLine);
    return line.substring(startCol, endCol);
  } else {
    // Multi-line selection
    let text = '';
    
    // First line (from startCol to end)
    const firstLine = viewModel.getLine(startLine);
    text += firstLine.substring(startCol) + '\n';
    
    // Middle lines (full lines)
    for (let line = startLine + 1; line < endLine; line++) {
      text += viewModel.getLine(line) + '\n';
    }
    
    // Last line (from start to endCol)
    const lastLine = viewModel.getLine(endLine);
    text += lastLine.substring(0, endCol);
    
    return text;
  }
}

/**
 * Delete selected text
 */
function deleteSelectedText(viewModel: any, selection: Selection): void {
  const startLine = Math.min(selection.start.line, selection.end.line);
  const endLine = Math.max(selection.start.line, selection.end.line);
  const startCol = Math.min(selection.start.column, selection.end.column);
  const endCol = Math.max(selection.start.column, selection.end.column);
  
  if (startLine === endLine) {
    // Single line deletion
    const line = viewModel.getLine(startLine);
    const newLine = line.substring(0, startCol) + line.substring(endCol);
    viewModel.setLine(startLine, newLine);
    viewModel.setCursorPosition({ line: startLine, column: startCol });
  } else {
    // Multi-line deletion
    const firstLine = viewModel.getLine(startLine);
    const lastLine = viewModel.getLine(endLine);
    
    // Combine first line (before selection) with last line (after selection)
    const newLine = firstLine.substring(0, startCol) + lastLine.substring(endCol);
    viewModel.setLine(startLine, newLine);
    
    // Delete middle lines
    for (let line = endLine; line > startLine; line--) {
      viewModel.deleteLine(line);
    }
    
    viewModel.setCursorPosition({ line: startLine, column: startCol });
  }
  
  viewModel.clearSelection();
}

/**
 * Insert text at position
 */
function insertTextAtPosition(viewModel: any, position: { line: number; column: number }, text: string): void {
  const lines = text.split('\n');
  
  if (lines.length === 1) {
    // Single line insertion
    const line = viewModel.getLine(position.line);
    const newLine = line.substring(0, position.column) + text + line.substring(position.column);
    viewModel.setLine(position.line, newLine);
    viewModel.setCursorPosition({ line: position.line, column: position.column + text.length });
  } else {
    // Multi-line insertion
    const line = viewModel.getLine(position.line);
    const before = line.substring(0, position.column);
    const after = line.substring(position.column);
    
    // First line
    viewModel.setLine(position.line, before + lines[0]);
    
    // Middle lines
    for (let i = 1; i < lines.length - 1; i++) {
      viewModel.insertLine(position.line + i, lines[i]);
    }
    
    // Last line
    const lastLine = lines[lines.length - 1] + after;
    viewModel.insertLine(position.line + lines.length - 1, lastLine);
    
    // Set cursor at end of inserted text
    viewModel.setCursorPosition({ 
      line: position.line + lines.length - 1, 
      column: lines[lines.length - 1].length 
    });
  }
}

/**
 * Paste with smart indentation
 */
export async function pasteWithSmartIndent(args: ClipboardArgs): Promise<void> {
  const { viewModel } = args;
  
  const text = await readText();
  if (!text) return;
  
  const cursor = viewModel.getCursorPosition();
  const currentLine = viewModel.getLine(cursor.line);
  const currentIndent = currentLine.match(/^\s*/)?.[0] || '';
  
  // Adjust indentation of pasted text
  const lines = text.split('\n');
  const adjustedLines = lines.map((line: string, index: number) => {
    if (index === 0) return line;
    return currentIndent + line.trimStart();
  });
  
  const adjustedText = adjustedLines.join('\n');
  
  if (viewModel.hasSelection()) {
    const selection = viewModel.getSelection();
    deleteSelectedText(viewModel, selection);
  }
  
  insertTextAtPosition(viewModel, cursor, adjustedText);
}

// Register clipboard commands
commandRegistry.registerCommand({
  command: {
    id: 'copy',
    execute: async (args: ClipboardArgs) => {
      await copySelection(args);
    }
  },
  keybindings: [
    { key: 'Ctrl+C' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'cut',
    execute: async (args: ClipboardArgs) => {
      await cutSelection(args);
    }
  },
  keybindings: [
    { key: 'Ctrl+X' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'paste',
    execute: async (args: ClipboardArgs) => {
      await pasteText(args);
    }
  },
  keybindings: [
    { key: 'Ctrl+V' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'pasteWithIndent',
    execute: async (args: ClipboardArgs) => {
      await pasteWithSmartIndent(args);
    }
  },
  keybindings: []
});
