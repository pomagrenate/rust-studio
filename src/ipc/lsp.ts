/**
 * ipc/lsp.ts — Typed IPC bridge for the LSP / rust-analyzer subsystem.
 *
 * All `invoke` calls are isolated here. Components import only these
 * typed wrappers, never `invoke` directly.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ── Shared LSP types (mirror of src-tauri/src/lsp/types.rs) ────────────────

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export type DiagnosticSeverity = "Error" | "Warning" | "Information" | "Hint";

export interface LspDiagnostic {
  uri: string;
  range: LspRange;
  severity: DiagnosticSeverity;
  code: string | null;
  message: string;
  source: string | null;
}

export interface DiagnosticBatch {
  uri: string;
  version: number;
  diagnostics: LspDiagnostic[];
}

export interface LspCapabilities {
  hover: boolean;
  goto_definition: boolean;
  completion: boolean;
  diagnostics: boolean;
}

export type LspStatus =
  | { kind: "starting" }
  | { kind: "ready" }
  | { kind: "indexing"; percent: number }
  | { kind: "error"; message: string }
  | { kind: "stopped" };

export interface HoverResult {
  uri: string;
  range: LspRange;
  content: string;
}

export interface CompletionItem {
  label: string;
  kind: string | null;
  detail: string | null;
  insert_text: string;
  documentation: string | null;
}

export interface GotoDefinitionResult {
  uri: string;
  range: LspRange;
}

export interface LocationLink {
  target_uri: string;
  target_range: LspRange;
  target_selection_range: LspRange;
  origin_selection_range?: LspRange;
}

export interface ResolvedDefinition {
  uri: string;
  range: LspRange;
  is_virtual: boolean;
  content?: string;
  language_id: string;
}

export interface RustSrcStatus {
  installed: boolean;
  sysroot: string;
  rust_src_path: string;
}

export interface TextDocumentContentChangeEvent {
  range?: LspRange;
  text: string;
}

export interface DocumentSyncPayload {
  uri: string;
  version: number;
  changes: TextDocumentContentChangeEvent[];
  full_text?: string;
}

// ── Code Actions ─────────────────────────────────────────────────────────

export type CodeActionKind =
  | "quickfix"
  | "refactor.extract"
  | "refactor.rewrite"
  | "source.generate"
  | "source.organizeImports"
  | string;

export interface TextEdit {
  range: LspRange;
  new_text: string;
}

export interface DocumentChange {
  uri: string;
  edits: TextEdit[];
}

export interface WorkspaceEdit {
  document_changes: DocumentChange[];
}

export interface Command {
  title: string;
  command: string;
  arguments?: unknown[];
}

export interface CodeAction {
  title: string;
  kind?: CodeActionKind;
  edit?: WorkspaceEdit;
  command?: Command;
  is_preferred?: boolean;
}

// ── Lifecycle commands ──────────────────────────────────────────────────────

export async function lspStart(workspaceRoot: string): Promise<LspCapabilities> {
  return invoke<LspCapabilities>("lsp_start", { workspaceRoot });
}

export async function lspStop(): Promise<void> {
  return invoke<void>("lsp_stop");
}

export function lspGetStatus(): Promise<LspStatus> {
  return invoke<LspStatus>("lsp_get_status");
}

// ── Document sync commands ─────────────────────────────────────────────────

export async function lspOpenDocument(
  uri: string,
  languageId: string,
  version: number,
  text: string
): Promise<void> {
  return invoke<void>("lsp_open_document", { uri, languageId, version, text });
}

export async function lspSyncDocument(payload: DocumentSyncPayload): Promise<void> {
  return invoke<void>("lsp_sync_document", { payload });
}

export async function lspCloseDocument(uri: string): Promise<void> {
  return invoke<void>("lsp_close_document", { uri });
}

// ── Feature commands ───────────────────────────────────────────────────────

export async function lspHover(
  uri: string,
  line: number,
  character: number
): Promise<HoverResult | null> {
  return invoke<HoverResult | null>("lsp_hover", { uri, line, character });
}

export async function lspGotoDefinition(
  uri: string,
  line: number,
  character: number
): Promise<ResolvedDefinition | null> {
  return invoke<ResolvedDefinition | null>("lsp_goto_definition", { uri, line, character });
}

export async function lspGotoImplementation(
  uri: string,
  line: number,
  character: number
): Promise<ResolvedDefinition | null> {
  return invoke<ResolvedDefinition | null>("lsp_goto_implementation", { uri, line, character });
}

export async function lspCheckRustSrc(): Promise<RustSrcStatus> {
  return invoke<RustSrcStatus>("lsp_check_rust_src");
}

export async function lspInstallRustSrc(): Promise<string> {
  return invoke<string>("lsp_install_rust_src");
}

export async function lspCompletion(
  uri: string,
  line: number,
  character: number
): Promise<CompletionItem[]> {
  return invoke<CompletionItem[]>("lsp_completion", { uri, line, character });
}

export async function lspCodeAction(
  uri: string,
  line: number,
  character: number
): Promise<CodeAction[]> {
  return invoke<CodeAction[]>("lsp_code_action", { uri, line, character });
}

// ── Event listeners ────────────────────────────────────────────────────────

export const LSP_EVENT_DIAGNOSTICS = "lsp://diagnostics";
export const LSP_EVENT_STATUS      = "lsp://status";

export function onLspDiagnostics(
  cb: (batch: DiagnosticBatch) => void
): Promise<UnlistenFn> {
  return listen<DiagnosticBatch>(LSP_EVENT_DIAGNOSTICS, (e) => cb(e.payload));
}

export function onLspStatus(
  cb: (status: LspStatus) => void
): Promise<UnlistenFn> {
  return listen<LspStatus>(LSP_EVENT_STATUS, (e) => cb(e.payload));
}

// ── Utilities ──────────────────────────────────────────────────────────────

/** Convert a local filesystem path to a file:// URI (cross-platform). */
export function pathToUri(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.startsWith("/")
    ? `file://${normalized}`
    : `file:///${normalized}`;
}

/** Strip file:// prefix back to a filesystem path. */
export function uriToPath(uri: string): string {
  return uri
    .replace(/^file:\/\/\//, "")   // Windows: file:///C:/...
    .replace(/^file:\/\//, "")     // Unix:    file:///home/...
    .replace(/\//g, (_, i) => {   // Re-normalise Windows paths
      // Check if we're on Windows by looking for drive letter pattern
      const isWindowsPath = /^[A-Za-z]:/.test(uri);
      return isWindowsPath && i === 0 ? "" : "\\";
    });
}
