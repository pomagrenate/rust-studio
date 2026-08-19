import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

// ── Clippy Types ─────────────────────────────────────────────────────────

export interface ClippyDiagnostic {
  file_path: string;
  range: {
    start_line: number;
    start_character: number;
    end_line: number;
    end_character: number;
  };
  severity: "error" | "warning" | "information" | "hint";
  lint_name: string;
  message: string;
  suggestions: ClippySuggestion[];
  is_machine_applicable: boolean;
}

export interface ClippySuggestion {
  range: {
    start_line: number;
    start_character: number;
    end_line: number;
    end_character: number;
  };
  replacement: string;
  applicability: string;
}

export interface ClippyFixResult {
  success: boolean;
  files_modified: string[];
  fixes_applied: number;
  stdout: string;
  stderr: string;
}

export interface ClippyProgress {
  message: string;
  files_processed: number;
  total_files: number | null;
}

// ── Clippy Commands ───────────────────────────────────────────────────────

export async function runClippyDiagnostics(
  workspacePath: string
): Promise<ClippyDiagnostic[]> {
  return invoke<ClippyDiagnostic[]>("run_clippy_diagnostics", { workspacePath });
}

export async function applyClippyFix(
  workspacePath: string,
  allowDirty: boolean
): Promise<ClippyFixResult> {
  return invoke<ClippyFixResult>("apply_clippy_fix", {
    workspacePath,
    allowDirty,
  });
}

export async function applySingleClippyFix(
  filePath: string,
  suggestion: ClippySuggestion
): Promise<string> {
  return invoke<string>("apply_single_clippy_fix", {
    filePath,
    suggestion,
  });
}

// ── Event Listeners ───────────────────────────────────────────────────────

export const CLIPPY_PROGRESS_EVENT = "clippy-progress";

export function onClippyProgress(
  callback: (progress: ClippyProgress) => void
): Promise<UnlistenFn> {
  return listen<ClippyProgress>(CLIPPY_PROGRESS_EVENT, (event) =>
    callback(event.payload)
  );
}
