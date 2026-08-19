/**
 * ipc/buffer.ts — IPC functions for buffer operations.
 */

import { invoke } from "@tauri-apps/api/core";

export interface Position {
  line: number;
  column: number;
}

export interface EditRange {
  start: Position;
  end: Position;
}

export interface TextEdit {
  range: EditRange;
  new_text: string;
}

export interface EditResult {
  new_version: number;
  affected_range: EditRange;
  line_delta: number;
}

/**
 * Apply a text edit to the document.
 */
export async function applyEdit(
  path: string,
  edit: TextEdit,
  cursorBefore?: Position
): Promise<EditResult> {
  return await invoke("apply_edit", {
    path,
    edit,
    cursorBefore,
  });
}

/**
 * Undo the last edit.
 */
export async function undoEdit(path: string): Promise<{ edit: TextEdit; cursor: Position }> {
  return await invoke("undo_edit", { path });
}

/**
 * Redo the last undone edit.
 */
export async function redoEdit(path: string): Promise<{ edit: TextEdit; result: EditResult }> {
  return await invoke("redo_edit", { path });
}

/**
 * Check if undo is available.
 */
export async function canUndo(path: string): Promise<boolean> {
  return await invoke("can_undo", { path });
}

/**
 * Check if redo is available.
 */
export async function canRedo(path: string): Promise<boolean> {
  return await invoke("can_redo", { path });
}

/**
 * Get the total line count of a document.
 */
export async function getLineCount(path: string): Promise<number> {
  return await invoke("get_line_count", { path });
}

/**
 * Get a range of lines from the document.
 */
export async function getLineRange(
  path: string,
  startLine: number,
  endLine: number
): Promise<string[]> {
  return await invoke("get_line_range", {
    path,
    startLine,
    endLine,
  });
}
