/**
 * ViewModel.ts - Abstract view model for editor state management
 * Separates cursor/selection state from rendering
 */

import { Position, Selection } from '../commands/NavigationCommands';
export type { Position, Selection };

export class ViewModel {
  private lines: string[];
  private cursor: Position;
  private selection: Selection | null;
  private onLinesChange?: (lines: string[], activeLine: number, activeCol: number) => void;

  constructor(
    lines: string[],
    onLinesChange?: (lines: string[], activeLine: number, activeCol: number) => void
  ) {
    this.lines = [...lines];
    this.cursor = { line: 0, column: 0 };
    this.selection = null;
    this.onLinesChange = onLinesChange;
  }

  /**
   * Get current cursor position
   */
  getCursorPosition(): Position {
    return { ...this.cursor };
  }

  /**
   * Set cursor position
   */
  setCursorPosition(position: Position): void {
    this.cursor = { ...position };
  }

  /**
   * Get current selection
   */
  getSelection(): Selection {
    if (this.selection) {
      return { ...this.selection };
    }
    // Return empty selection at cursor position
    return {
      start: { ...this.cursor },
      end: { ...this.cursor }
    };
  }

  /**
   * Set selection
   */
  setSelection(selection: Selection): void {
    this.selection = { ...selection };
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    this.selection = null;
  }

  /**
   * Check if has selection
   */
  hasSelection(): boolean {
    if (!this.selection) return false;
    return (
      this.selection.start.line !== this.selection.end.line ||
      this.selection.start.column !== this.selection.end.column
    );
  }

  /**
   * Get line content
   */
  getLine(line: number): string {
    if (line < 0 || line >= this.lines.length) {
      return '';
    }
    return this.lines[line];
  }

  /**
   * Set line content
   */
  setLine(line: number, content: string): void {
    if (line >= 0 && line < this.lines.length) {
      this.lines[line] = content;
      this.notifyChange();
    }
  }

  /**
   * Get all lines
   */
  getLines(): string[] {
    return [...this.lines];
  }

  /**
   * Set all lines
   */
  setLines(lines: string[]): void {
    this.lines = [...lines];
    this.notifyChange();
  }

  /**
   * Get line count
   */
  getLineCount(): number {
    return this.lines.length;
  }

  /**
   * Insert line at position
   */
  insertLine(line: number, content: string): void {
    if (line >= 0 && line <= this.lines.length) {
      this.lines.splice(line, 0, content);
      this.notifyChange();
    }
  }

  /**
   * Delete line at position
   */
  deleteLine(line: number): void {
    if (line >= 0 && line < this.lines.length) {
      this.lines.splice(line, 1);
      this.notifyChange();
    }
  }

  /**
   * Notify parent of changes
   */
  private notifyChange(): void {
    if (this.onLinesChange) {
      this.onLinesChange(this.lines, this.cursor.line, this.cursor.column);
    }
  }
}
