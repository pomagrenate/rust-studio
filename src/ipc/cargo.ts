/**
 * ipc/cargo.ts — Typed IPC bridge for Cargo build & diagnostic streaming
 * 
 * All `invoke` calls and event listeners are isolated here.
 * Components import only these typed wrappers.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ── Cargo Diagnostic Types (mirror of Rust backend) ────────────────────────

export interface DiagnosticRange {
  start_line: number;
  start_character: number;
  end_line: number;
  end_character: number;
}

export type DiagnosticSeverity = "error" | "warning" | "information" | "hint";

export interface RelatedInformation {
  file_path: string;
  range: DiagnosticRange;
  message: string;
}

export interface CodeSuggestion {
  range: DiagnosticRange;
  replacement: string;
  applicability: string;
}

export interface CargoDiagnostic {
  file_path: string;
  range: DiagnosticRange;
  severity: DiagnosticSeverity;
  code: string | null;
  rendered_message: string;
  message: string;
  related: RelatedInformation[];
  suggestions: CodeSuggestion[];
}

// ── Cargo Command Types ─────────────────────────────────────────────────────

export type CargoCommand = "check" | "clippy" | "build" | "test";

// ── Cargo Commands ─────────────────────────────────────────────────────────

export async function cargoCheckStreaming(projectPath: string): Promise<void> {
  return invoke<void>("cargo_check_streaming", { projectPath });
}

export async function cargoClippyStreaming(projectPath: string): Promise<void> {
  return invoke<void>("cargo_clippy_streaming", { projectPath });
}

export async function cargoBuildStreaming(projectPath: string): Promise<void> {
  return invoke<void>("cargo_build_streaming", { projectPath });
}

export async function cargoCancelBuild(): Promise<void> {
  return invoke<void>("cargo_cancel_build");
}

export async function cargoGetActiveProcess(): Promise<string | null> {
  return invoke<string | null>("cargo_get_active_process");
}

// ── Event Listeners ─────────────────────────────────────────────────────────

export const CARGO_EVENT_DIAGNOSTIC = "cargo://diagnostic";
export const CARGO_EVENT_PROGRESS = "cargo://progress";
export const CARGO_EVENT_FINISHED = "cargo://finished";

export function onCargoDiagnostic(
  callback: (diagnostic: CargoDiagnostic) => void
): Promise<UnlistenFn> {
  return listen<CargoDiagnostic>(CARGO_EVENT_DIAGNOSTIC, (e) => callback(e.payload));
}

export function onCargoProgress(
  callback: (message: string) => void
): Promise<UnlistenFn> {
  return listen<string>(CARGO_EVENT_PROGRESS, (e) => callback(e.payload));
}

export function onCargoFinished(
  callback: (success: boolean) => void
): Promise<UnlistenFn> {
  return listen<boolean>(CARGO_EVENT_FINISHED, (e) => callback(e.payload));
}
