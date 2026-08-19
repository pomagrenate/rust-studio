/**
 * utils/editorDiagnostics.ts — Custom editor diagnostic utilities
 * 
 * Features:
 * - Convert Cargo diagnostics to custom editor format
 * - Support severity mapping
 * - Handle related information and suggestions
 */

import type { CargoDiagnostic, DiagnosticSeverity } from "../ipc/cargo";

// ── Severity Mapping ─────────────────────────────────────────────────────────

const SEVERITY_MAP: Record<DiagnosticSeverity, "Error" | "Warning" | "Information" | "Hint"> = {
  error: "Error",
  warning: "Warning",
  information: "Information",
  hint: "Hint",
};

// ── Diagnostic Conversion ─────────────────────────────────────────────────────

export interface EditorDiagnostic {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  severity: "Error" | "Warning" | "Information" | "Hint";
  message: string;
  code?: string;
  source?: string;
}

export function convertDiagnostic(diagnostic: CargoDiagnostic): EditorDiagnostic {
  return {
    range: {
      start: {
        line: diagnostic.range.start_line,
        character: diagnostic.range.start_character,
      },
      end: {
        line: diagnostic.range.end_line,
        character: diagnostic.range.end_character,
      },
    },
    severity: SEVERITY_MAP[diagnostic.severity],
    message: diagnostic.message,
    code: diagnostic.code || undefined,
    source: "cargo",
  };
}

// ── Bulk Conversion ─────────────────────────────────────────────────────────

export function convertDiagnosticsForFile(
  diagnostics: CargoDiagnostic[]
): EditorDiagnostic[] {
  return diagnostics.map(convertDiagnostic);
}

export function convertDiagnosticsMap(
  diagnosticsMap: Record<string, CargoDiagnostic[]>
): Record<string, EditorDiagnostic[]> {
  const result: Record<string, EditorDiagnostic[]> = {};
  for (const [filePath, diagnostics] of Object.entries(diagnosticsMap)) {
    result[filePath] = convertDiagnosticsForFile(diagnostics);
  }
  return result;
}
