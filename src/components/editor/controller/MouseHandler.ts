/**
 * MouseHandler.ts - Mouse event handling for editor interactions
 * Implements double/triple/quadruple click, drag selection, Shift+Click
 */

import { Position, Selection } from '../commands/NavigationCommands';

export interface MouseHandlerArgs {
  viewModel: any;
  onLinesChange?: (lines: string[], activeLine: number, activeCol: number) => void;
}

export class MouseHandler {
  private viewModel: any;
  private clickCount: number = 0;
  private lastClickTime: number = 0;
  private lastClickPosition: Position | null = null;
  private isDragging: boolean = false;
  private dragStartPosition: Position | null = null;

  constructor(args: MouseHandlerArgs) {
    this.viewModel = args.viewModel;
  }

  /**
   * Handle mouse down event
   */
  handleMouseDown(e: MouseEvent, position: Position): void {
    const now = Date.now();
    const timeSinceLastClick = now - this.lastClickTime;
    
    // Reset click count if too much time has passed or position changed significantly
    if (timeSinceLastClick > 400 || 
        (this.lastClickPosition && 
         (Math.abs(this.lastClickPosition.line - position.line) > 0 || 
          Math.abs(this.lastClickPosition.column - position.column) > 5))) {
      this.clickCount = 0;
    }
    
    this.clickCount++;
    this.lastClickTime = now;
    this.lastClickPosition = position;
    
    // Handle different click types
    switch (this.clickCount) {
      case 1:
        this.handleSingleClick(e, position);
        break;
      case 2:
        this.handleDoubleClick(e, position);
        break;
      case 3:
        this.handleTripleClick(e, position);
        break;
      case 4:
        this.handleQuadrupleClick(e, position);
        this.clickCount = 0; // Reset after quadruple click
        break;
    }
    
    // Start drag if left button
    if (e.button === 0) {
      this.isDragging = true;
      this.dragStartPosition = position;
    }
  }

  /**
   * Handle single click - move cursor to position
   */
  private handleSingleClick(e: MouseEvent, position: Position): void {
    if (e.shiftKey) {
      // Extend selection to click position
      const selection = this.viewModel.getSelection();
      const newSelection: Selection = {
        start: selection.start,
        end: position
      };
      this.viewModel.setSelection(newSelection);
    } else {
      // Move cursor to position
      this.viewModel.setCursorPosition(position);
      this.viewModel.clearSelection();
    }
  }

  /**
   * Handle double click - select word
   */
  private handleDoubleClick(_e: MouseEvent, position: Position): void {
    const line = this.viewModel.getLine(position.line);
    const wordStart = this.findWordStart(line, position.column);
    const wordEnd = this.findWordEnd(line, position.column);
    
    const selection: Selection = {
      start: { line: position.line, column: wordStart },
      end: { line: position.line, column: wordEnd }
    };
    
    this.viewModel.setSelection(selection);
  }

  /**
   * Handle triple click - select line
   */
  private handleTripleClick(_e: MouseEvent, position: Position): void {
    const line = this.viewModel.getLine(position.line);
    
    const selection: Selection = {
      start: { line: position.line, column: 0 },
      end: { line: position.line, column: line.length }
    };
    
    this.viewModel.setSelection(selection);
  }

  /**
   * Handle quadruple click - select entire document
   */
  private handleQuadrupleClick(_e: MouseEvent, _position: Position): void {
    const lineCount = this.viewModel.getLineCount();
    const lastLine = this.viewModel.getLine(lineCount - 1);
    
    const selection: Selection = {
      start: { line: 0, column: 0 },
      end: { line: lineCount - 1, column: lastLine.length }
    };
    
    this.viewModel.setSelection(selection);
  }

  /**
   * Handle mouse move during drag
   */
  handleMouseMove(_e: MouseEvent, position: Position): void {
    if (!this.isDragging || !this.dragStartPosition) {
      return;
    }
    
    const selection: Selection = {
      start: this.dragStartPosition,
      end: position
    };
    
    this.viewModel.setSelection(selection);
  }

  /**
   * Handle mouse up - end drag
   */
  handleMouseUp(_e: MouseEvent, _position: Position): void {
    this.isDragging = false;
    this.dragStartPosition = null;
  }

  /**
   * Find word start position
   */
  private findWordStart(line: string, column: number): number {
    if (column === 0) return 0;
    
    let i = column - 1;
    // Skip non-word characters
    while (i >= 0 && !/[a-zA-Z0-9_]/.test(line[i])) {
      i--;
    }
    // Skip word characters
    while (i >= 0 && /[a-zA-Z0-9_]/.test(line[i])) {
      i--;
    }
    return i + 1;
  }

  /**
   * Find word end position
   */
  private findWordEnd(line: string, column: number): number {
    if (column >= line.length) return line.length;
    
    let i = column;
    // Skip word characters
    while (i < line.length && /[a-zA-Z0-9_]/.test(line[i])) {
      i++;
    }
    // Skip non-word characters
    while (i < line.length && !/[a-zA-Z0-9_]/.test(line[i])) {
      i++;
    }
    return i;
  }

  /**
   * Reset click state
   */
  reset(): void {
    this.clickCount = 0;
    this.lastClickTime = 0;
    this.lastClickPosition = null;
    this.isDragging = false;
    this.dragStartPosition = null;
  }
}
