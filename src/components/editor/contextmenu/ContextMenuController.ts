/**
 * ContextMenuController.ts - Business logic for context menu
 * Manages context state, filtering, and command execution
 */

import { contextMenuRegistry } from "./ContextMenuRegistry";
import type { EditorContextState, MenuItem } from "./types";

export class ContextMenuController {
  private currentState: EditorContextState;
  private onExecuteCommand: (commandId: string) => void;

  constructor(
    initialState: EditorContextState,
    onExecuteCommand: (commandId: string) => void
  ) {
    this.currentState = initialState;
    this.onExecuteCommand = onExecuteCommand;
  }

  /**
   * Update the current context state
   */
  updateContextState(newState: Partial<EditorContextState>): void {
    this.currentState = { ...this.currentState, ...newState };
  }

  /**
   * Get the current context state
   */
  getContextState(): EditorContextState {
    return { ...this.currentState };
  }

  /**
   * Get filtered menu items based on current context
   */
  getMenuItems(): MenuItem[] {
    return contextMenuRegistry.getActionsForContext(this.currentState);
  }

  /**
   * Execute a menu item command
   */
  executeMenuItem(item: MenuItem): void {
    if (item.enabled) {
      this.onExecuteCommand(item.commandId);
    }
  }

  /**
   * Detect if cursor is inside a test context
   */
  static detectTestContext(lines: string[], cursorLine: number): boolean {
    // Check if inside #[test] or #[cfg(test)] block
    for (let i = cursorLine; i >= 0; i--) {
      const checkLine = lines[i] || "";
      
      // Found test attribute
      if (checkLine.includes("#[test]") || checkLine.includes("#[cfg(test)]")) {
        return true;
      }
      
      // Found function/block end - stop searching
      if (checkLine.trim().startsWith("}") && i < cursorLine) {
        return false;
      }
    }
    
    return false;
  }

  /**
   * Detect file type from file path
   */
  static detectFileType(filePath: string | undefined): string {
    if (!filePath) return "unknown";
    
    const ext = filePath.split(".").pop()?.toLowerCase() || "";
    const fileTypeMap: Record<string, string> = {
      "rs": "rs",
      "toml": "toml",
      "json": "json",
      "md": "markdown",
      "txt": "text",
    };
    
    return fileTypeMap[ext] || ext;
  }

  /**
   * Find diagnostic at cursor position
   */
  static findDiagnosticAtCursor(
    diagnostics: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; severity: string; message: string }>,
    cursorLine: number,
    cursorCol: number
  ): import("./types").Diagnostic | null {
    for (const diag of diagnostics) {
      const startLine = diag.range.start.line;
      const endLine = diag.range.end.line;
      const startCol = diag.range.start.character;
      const endCol = diag.range.end.character;

      // Check if cursor is within diagnostic range
      if (
        cursorLine >= startLine &&
        cursorLine <= endLine &&
        (cursorLine !== startLine || cursorCol >= startCol) &&
        (cursorLine !== endLine || cursorCol <= endCol)
      ) {
        return {
          range: diag.range,
          severity: diag.severity as "Error" | "Warning" | "Information" | "Hint",
          message: diag.message,
        };
      }
    }
    
    return null;
  }

  /**
   * Detect if there's a token under cursor (simplified)
   */
  static detectTokenUnderCursor(line: string, cursorCol: number): string | null {
    if (cursorCol < 0 || cursorCol >= line.length) return null;

    const char = line[cursorCol];
    
    // Check if cursor is on a word character
    if (/[a-zA-Z0-9_]/.test(char)) {
      // Find word boundaries
      let start = cursorCol;
      while (start > 0 && /[a-zA-Z0-9_]/.test(line[start - 1])) {
        start--;
      }
      
      let end = cursorCol;
      while (end < line.length && /[a-zA-Z0-9_]/.test(line[end])) {
        end++;
      }
      
      return line.substring(start, end);
    }
    
    return null;
  }
}
