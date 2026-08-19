/**
 * ColumnSelectionState.ts - Column (rectangular) selection state management
 * Implements VSCode-like column selection behavior
 */

import { Selection } from '../commands/NavigationCommands';

export interface ColumnSelection {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export class ColumnSelectionState {
  private columnSelection: ColumnSelection | null;
  private isActive: boolean;

  constructor() {
    this.columnSelection = null;
    this.isActive = false;
  }

  /**
   * Check if column selection is active
   */
  isColumnSelectionActive(): boolean {
    return this.isActive;
  }

  /**
   * Activate column selection mode
   */
  activate(startLine: number, startColumn: number): void {
    this.isActive = true;
    this.columnSelection = {
      startLine,
      startColumn,
      endLine: startLine,
      endColumn: startColumn
    };
  }

  /**
   * Deactivate column selection mode
   */
  deactivate(): void {
    this.isActive = false;
    this.columnSelection = null;
  }

  /**
   * Update column selection end position
   */
  updateEnd(endLine: number, endColumn: number): void {
    if (!this.columnSelection) return;
    
    this.columnSelection.endLine = endLine;
    this.columnSelection.endColumn = endColumn;
  }

  /**
   * Get column selection
   */
  getColumnSelection(): ColumnSelection | null {
    if (!this.columnSelection) return null;
    return { ...this.columnSelection };
  }

  /**
   * Get column selection as array of regular selections
   * Converts rectangular selection to multiple line selections
   */
  getSelections(viewModel: any): Selection[] {
    if (!this.columnSelection) return [];
    
    const { startLine, startColumn, endLine, endColumn } = this.columnSelection;
    
    const minLine = Math.min(startLine, endLine);
    const maxLine = Math.max(startLine, endLine);
    const minCol = Math.min(startColumn, endColumn);
    const maxCol = Math.max(startColumn, endColumn);
    
    const selections: Selection[] = [];
    
    for (let line = minLine; line <= maxLine; line++) {
      const lineContent = viewModel.getLine(line);
      const lineLength = lineContent.length;
      
      // Clamp columns to line bounds
      const actualMinCol = Math.min(minCol, lineLength);
      const actualMaxCol = Math.min(maxCol, lineLength);
      
      if (actualMinCol < actualMaxCol) {
        selections.push({
          start: { line, column: actualMinCol },
          end: { line, column: actualMaxCol }
        });
      }
    }
    
    return selections;
  }

  /**
   * Get selected text for each line
   */
  getSelectedText(viewModel: any): string[] {
    const selections = this.getSelections(viewModel);
    return selections.map(sel => {
      const line = viewModel.getLine(sel.start.line);
      return line.substring(sel.start.column, sel.end.column);
    });
  }

  /**
   * Check if position is within column selection
   */
  containsPosition(line: number, column: number): boolean {
    if (!this.columnSelection) return false;
    
    const { startLine, startColumn, endLine, endColumn } = this.columnSelection;
    
    const minLine = Math.min(startLine, endLine);
    const maxLine = Math.max(startLine, endLine);
    const minCol = Math.min(startColumn, endColumn);
    const maxCol = Math.max(startColumn, endColumn);
    
    return line >= minLine && line <= maxLine && column >= minCol && column <= maxCol;
  }
}
