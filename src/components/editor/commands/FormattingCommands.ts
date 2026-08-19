/**
 * FormattingCommands.ts - Code formatting commands
 * Integrates with rustfmt for Rust code formatting
 */

import { commandRegistry } from './CommandRegistry';
import { invoke } from '@tauri-apps/api/core';

export interface FormattingArgs {
  viewModel: any;
  filePath?: string;
}

/**
 * Format entire document
 */
export async function formatDocument(args: FormattingArgs): Promise<void> {
  const { viewModel, filePath } = args;
  
  if (!filePath) {
    console.warn('Cannot format: no file path provided');
    return;
  }
  
  try {
    // Call rustfmt through Tauri
    const formattedLines = await invoke<string[]>('format_rust_file', { 
      filePath 
    });
    
    if (formattedLines && formattedLines.length > 0) {
      viewModel.setLines(formattedLines);
    }
  } catch (e) {
    console.error('Failed to format document:', e);
  }
}

/**
 * Format selected text
 */
export async function formatSelection(args: FormattingArgs): Promise<void> {
  const { viewModel, filePath } = args;
  
  if (!viewModel.hasSelection()) {
    return;
  }
  
  if (!filePath) {
    console.warn('Cannot format selection: no file path provided');
    return;
  }
  
  try {
    // Format the selection (this would need a more sophisticated integration)
    // For now, we'll format the entire document and then restore the selection
    const formattedLines = await invoke<string[]>('format_rust_file', { 
      filePath 
    });
    
    if (formattedLines && formattedLines.length > 0) {
      viewModel.setLines(formattedLines);
    }
  } catch (e) {
    console.error('Failed to format selection:', e);
  }
}

/**
 * Format on paste
 */
export async function formatOnPaste(_args: FormattingArgs & { text: string }): Promise<void> {
  // For Rust files, we could format the pasted text
  // This would require detecting the file type and applying appropriate formatting
  // For now, this is a placeholder for future implementation
}

/**
 * Toggle line comment (language-agnostic)
 */
export function toggleLineComment(args: FormattingArgs): void {
  const { viewModel } = args;
  
  if (!viewModel.hasSelection()) {
    // Toggle comment on current line
    const cursor = viewModel.getCursorPosition();
    const line = viewModel.getLine(cursor.line);
    const toggled = toggleSingleLineComment(line);
    viewModel.setLine(cursor.line, toggled);
  } else {
    // Toggle comment on selection
    const selection = viewModel.getSelection();
    const startLine = Math.min(selection.start.line, selection.end.line);
    const endLine = Math.max(selection.start.line, selection.end.line);
    
    const lines = viewModel.getLines();
    const newLines = [...lines];
    
    for (let i = startLine; i <= endLine; i++) {
      newLines[i] = toggleSingleLineComment(newLines[i]);
    }
    
    viewModel.setLines(newLines);
  }
}

/**
 * Toggle block comment
 */
export function toggleBlockComment(args: FormattingArgs): void {
  const { viewModel } = args;
  
  if (!viewModel.hasSelection()) {
    return;
  }
  
  const selection = viewModel.getSelection();
  const startLine = Math.min(selection.start.line, selection.end.line);
  const endLine = Math.max(selection.start.line, selection.end.line);
  
  const lines = viewModel.getLines();
  const newLines = [...lines];
  
  if (startLine === endLine) {
    // Single line - wrap in block comment
    const line = newLines[startLine];
    const trimmed = line.trim();
    
    if (trimmed.startsWith('/*') && trimmed.endsWith('*/')) {
      // Remove block comment
      const inner = trimmed.substring(2, trimmed.length - 2).trim();
      const indent = line.match(/^\s*/)?.[0] || '';
      newLines[startLine] = indent + inner;
    } else {
      // Add block comment
      const indent = line.match(/^\s*/)?.[0] || '';
      newLines[startLine] = indent + '/* ' + trimmed + ' */';
    }
  } else {
    // Multi-line
    const firstLine = newLines[startLine].trim();
    const lastLine = newLines[endLine].trim();
    
    if (firstLine.startsWith('/*') && lastLine.endsWith('*/')) {
      // Remove block comment
      const firstIndent = newLines[startLine].match(/^\s*/)?.[0] || '';
      const lastIndent = newLines[endLine].match(/^\s*/)?.[0] || '';
      
      newLines[startLine] = firstIndent + firstLine.substring(2).trimStart();
      newLines[endLine] = lastIndent + lastLine.substring(0, lastLine.length - 2).trimEnd();
    } else {
      // Add block comment
      const firstIndent = newLines[startLine].match(/^\s*/)?.[0] || '';
      const lastIndent = newLines[endLine].match(/^\s*/)?.[0] || '';
      
      newLines[startLine] = firstIndent + '/* ' + newLines[startLine].trim();
      newLines[endLine] = lastIndent + ' */' + newLines[endLine].trim();
    }
  }
  
  viewModel.setLines(newLines);
}

/**
 * Toggle single line comment
 */
function toggleSingleLineComment(line: string): string {
  const trimmed = line.trim();
  
  if (trimmed.startsWith('//')) {
    // Remove comment
    const afterComment = trimmed.substring(2).trimStart();
    const indent = line.match(/^\s*/)?.[0] || '';
    return indent + afterComment;
  } else {
    // Add comment
    const indent = line.match(/^\s*/)?.[0] || '';
    return indent + '// ' + trimmed;
  }
}

// Register formatting commands
commandRegistry.registerCommand({
  command: {
    id: 'formatDocument',
    execute: async (args: FormattingArgs) => {
      await formatDocument(args);
    }
  },
  keybindings: [
    { key: 'Shift+Alt+F' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'formatSelection',
    execute: async (args: FormattingArgs) => {
      await formatSelection(args);
    }
  },
  keybindings: [
    { key: 'Ctrl+K', platform: 'windows' },
    { key: 'Ctrl+K', platform: 'linux' },
    { key: 'Cmd+K', platform: 'mac' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'toggleLineComment',
    execute: (args: FormattingArgs) => {
      toggleLineComment(args);
    }
  },
  keybindings: [
    { key: 'Ctrl+/' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'toggleBlockComment',
    execute: (args: FormattingArgs) => {
      toggleBlockComment(args);
    }
  },
  keybindings: [
    { key: 'Ctrl+Shift+/' }
  ]
});
