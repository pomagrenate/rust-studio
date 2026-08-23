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

function normalizeSelection(selection: Selection): { startLine: number; startCol: number; endLine: number; endCol: number } {
  const { line: l1, column: c1 } = selection.start;
  const { line: l2, column: c2 } = selection.end;
  if (l1 < l2 || (l1 === l2 && c1 <= c2)) {
    return { startLine: l1, startCol: c1, endLine: l2, endCol: c2 };
  }
  return { startLine: l2, startCol: c2, endLine: l1, endCol: c1 };
}

/**
 * Copy selected text to clipboard (or current line if no selection)
 */
export async function copySelection(args: ClipboardArgs): Promise<void> {
  const { viewModel } = args;
  
  if (!viewModel.hasSelection()) {
    const cursor = viewModel.getCursorPosition();
    const line = viewModel.getLine(cursor.line);
    await writeText(line + '\n');
    return;
  }
  
  const selection = viewModel.getSelection();
  const text = getSelectedText(viewModel, selection);
  
  await writeText(text);
}

/**
 * Cut selected text to clipboard (or current line if no selection)
 */
export async function cutSelection(args: ClipboardArgs): Promise<void> {
  const { viewModel } = args;
  
  if (!viewModel.hasSelection()) {
    const cursor = viewModel.getCursorPosition();
    const line = viewModel.getLine(cursor.line);
    await writeText(line + '\n');
    viewModel.deleteLine(cursor.line);
    const lineCount = viewModel.getLineCount();
    if (lineCount === 0) {
      viewModel.setLines(['']);
      viewModel.setCursorPosition({ line: 0, column: 0 });
    } else {
      const newLine = Math.min(cursor.line, lineCount - 1);
      const newCol = Math.min(cursor.column, viewModel.getLine(newLine).length);
      viewModel.setCursorPosition({ line: newLine, column: newCol });
    }
    return;
  }
  
  const selection = viewModel.getSelection();
  const text = getSelectedText(viewModel, selection);
  
  await writeText(text);
  deleteSelectedText(viewModel, selection);
}

/**
 * Paste text from clipboard at cursor position
 */
export async function pasteText(args: ClipboardArgs): Promise<void> {
  const { viewModel } = args;
  
  const text = await readText();
  if (!text) return;
  
  let cursor = viewModel.getCursorPosition();
  
  if (viewModel.hasSelection()) {
    const selection = viewModel.getSelection();
    deleteSelectedText(viewModel, selection);
    cursor = viewModel.getCursorPosition();
  }
  
  insertTextAtPosition(viewModel, cursor, text);
}

/**
 * Get selected text from selection
 */
function getSelectedText(viewModel: any, selection: Selection): string {
  const { startLine, startCol, endLine, endCol } = normalizeSelection(selection);
  
  if (startLine === endLine) {
    const line = viewModel.getLine(startLine);
    return line.substring(startCol, endCol);
  } else {
    let text = '';
    const firstLine = viewModel.getLine(startLine);
    text += firstLine.substring(startCol) + '\n';
    
    for (let line = startLine + 1; line < endLine; line++) {
      text += viewModel.getLine(line) + '\n';
    }
    
    const lastLine = viewModel.getLine(endLine);
    text += lastLine.substring(0, endCol);
    
    return text;
  }
}

/**
 * Delete selected text
 */
function deleteSelectedText(viewModel: any, selection: Selection): void {
  const { startLine, startCol, endLine, endCol } = normalizeSelection(selection);
  
  if (startLine === endLine) {
    const line = viewModel.getLine(startLine);
    const newLine = line.substring(0, startCol) + line.substring(endCol);
    viewModel.setLine(startLine, newLine);
    viewModel.setCursorPosition({ line: startLine, column: startCol });
  } else {
    const firstLine = viewModel.getLine(startLine);
    const lastLine = viewModel.getLine(endLine);
    
    const newLine = firstLine.substring(0, startCol) + lastLine.substring(endCol);
    viewModel.setLine(startLine, newLine);
    
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
  ],
  title: 'Copy',
  category: 'Clipboard'
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
  ],
  title: 'Cut',
  category: 'Clipboard'
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
  ],
  title: 'Paste',
  category: 'Clipboard'
});

commandRegistry.registerCommand({
  command: {
    id: 'pasteWithIndent',
    execute: async (args: ClipboardArgs) => {
      await pasteWithSmartIndent(args);
    }
  },
  keybindings: [],
  title: 'Paste with Smart Indent',
  category: 'Clipboard'
});
