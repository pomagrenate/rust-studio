/**
 * useTauriIpc.ts — Tauri IPC bridge for the editor.
 *
 * Design:
 *   The frontend never calls `invoke` directly in components. All IPC is
 *   isolated here so components stay testable in a pure React environment
 *   (mock this hook in tests / Storybook).
 *
 *   Pattern: each hook wraps exactly one "domain" of IPC commands.
 */

import { invoke } from "@tauri-apps/api/core";

// ── Types (mirroring Rust structs) ──────────────────────────────────────────

export interface DocumentInfo {
  path: string | null;
  version: number;
  line_count: number;
  char_count: number;
  eol: "Lf" | "CrLf" | "Cr";
  is_dirty: boolean;
}

export interface ViewportData {
  start_line: number;
  end_line: number;
  total_lines: number;
  total_height: number;
  line_height: number;
  visible_height: number;
}

export interface TextEdit {
  range: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  new_text: string;
}

export interface EditResult {
  new_version: number;
  affected_range: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  line_delta: number;
}

// ── File System commands ─────────────────────────────────────────────────────

export interface OpenFileResult {
  path: string;
  content: string | null;
  line_count: number;
  version: number;
}

export async function ipcOpenFile(path: string): Promise<OpenFileResult> {
  return invoke<OpenFileResult>("open_file", { path });
}

export async function ipcSaveFile(path: string): Promise<void> {
  return invoke<void>("save_file", { path });
}

// ── Buffer / Document commands ───────────────────────────────────────────────

export async function ipcOpenDocument(path: string): Promise<DocumentInfo> {
  return invoke<DocumentInfo>("open_document", { path });
}

export async function ipcGetDocumentInfo(path: string): Promise<DocumentInfo> {
  return invoke<DocumentInfo>("get_document_info", { path });
}

export async function ipcApplyEdit(
  path: string,
  edit: TextEdit
): Promise<EditResult> {
  return invoke<EditResult>("apply_edit", { path, edit });
}

export async function ipcGetLineRange(
  path: string,
  startLine: number,
  endLine: number
): Promise<string[]> {
  return invoke<string[]>("get_line_range", {
    path,
    startLine,
    endLine,
  });
}

// ── Viewport commands ────────────────────────────────────────────────────────

export async function ipcGetViewportData(
  path: string,
  scrollTop: number,
  viewportHeight: number,
  lineHeight?: number
): Promise<ViewportData> {
  return invoke<ViewportData>("get_viewport_data", {
    path,
    scrollTop,
    viewportHeight,
    lineHeight,
  });
}
