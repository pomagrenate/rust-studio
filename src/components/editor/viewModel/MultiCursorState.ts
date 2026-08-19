/**
 * MultiCursorState.ts - Multi-cursor state management
 * Supports multiple cursor positions and selections
 */

import { Position, Selection } from '../commands/NavigationCommands';

export interface CursorState {
  position: Position;
  selection: Selection | null;
}

export class MultiCursorState {
  private cursors: CursorState[];
  private primaryCursorIndex: number;

  constructor() {
    this.cursors = [];
    this.primaryCursorIndex = 0;
  }

  /**
   * Get all cursor states
   */
  getCursors(): CursorState[] {
    return this.cursors.map(c => ({ ...c }));
  }

  /**
   * Get primary cursor state
   */
  getPrimaryCursor(): CursorState | null {
    if (this.cursors.length === 0) return null;
    return { ...this.cursors[this.primaryCursorIndex] };
  }

  /**
   * Get primary cursor index
   */
  getPrimaryCursorIndex(): number {
    return this.primaryCursorIndex;
  }

  /**
   * Set primary cursor index
   */
  setPrimaryCursorIndex(index: number): void {
    if (index >= 0 && index < this.cursors.length) {
      this.primaryCursorIndex = index;
    }
  }

  /**
   * Add cursor at position
   */
  addCursor(position: Position): void {
    // Check if cursor already exists at this position
    const existingIndex = this.cursors.findIndex(
      c => c.position.line === position.line && c.position.column === position.column
    );
    
    if (existingIndex !== -1) {
      // Remove cursor if it already exists (toggle behavior)
      this.cursors.splice(existingIndex, 1);
      // Adjust primary cursor index if needed
      if (this.primaryCursorIndex >= this.cursors.length) {
        this.primaryCursorIndex = Math.max(0, this.cursors.length - 1);
      }
    } else {
      // Add new cursor
      this.cursors.push({
        position: { ...position },
        selection: null
      });
    }
  }

  /**
   * Remove cursor at index
   */
  removeCursor(index: number): void {
    if (index >= 0 && index < this.cursors.length) {
      this.cursors.splice(index, 1);
      // Adjust primary cursor index if needed
      if (this.primaryCursorIndex >= this.cursors.length) {
        this.primaryCursorIndex = Math.max(0, this.cursors.length - 1);
      }
    }
  }

  /**
   * Remove all secondary cursors (keep only primary)
   */
  removeSecondaryCursors(): void {
    if (this.cursors.length > 1) {
      const primary = this.cursors[this.primaryCursorIndex];
      this.cursors = [{ ...primary }];
      this.primaryCursorIndex = 0;
    }
  }

  /**
   * Set cursor position at index
   */
  setCursorPosition(index: number, position: Position): void {
    if (index >= 0 && index < this.cursors.length) {
      this.cursors[index].position = { ...position };
    }
  }

  /**
   * Set selection at index
   */
  setSelection(index: number, selection: Selection): void {
    if (index >= 0 && index < this.cursors.length) {
      this.cursors[index].selection = { ...selection };
    }
  }

  /**
   * Clear selection at index
   */
  clearSelection(index: number): void {
    if (index >= 0 && index < this.cursors.length) {
      this.cursors[index].selection = null;
    }
  }

  /**
   * Clear all selections
   */
  clearAllSelections(): void {
    this.cursors.forEach(c => c.selection = null);
  }

  /**
   * Get cursor count
   */
  getCursorCount(): number {
    return this.cursors.length;
  }

  /**
   * Check if has multiple cursors
   */
  hasMultipleCursors(): boolean {
    return this.cursors.length > 1;
  }

  /**
   * Reset to single cursor
   */
  reset(position: Position): void {
    this.cursors = [{ position: { ...position }, selection: null }];
    this.primaryCursorIndex = 0;
  }

  /**
   * Set all cursors from array
   */
  setCursors(cursors: CursorState[]): void {
    this.cursors = cursors.map(c => ({ ...c }));
    this.primaryCursorIndex = 0;
  }
}
