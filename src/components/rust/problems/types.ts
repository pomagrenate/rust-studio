/**
 * types.ts — Type definitions for ProblemsPanel subcomponents
 */

import { CargoDiagnostic, WorkspaceDiagnostics } from "../../../extensions/builtin/rust/CargoProvider";
import { LspDiagnostic } from "../../../ipc/lsp";

export interface LinterFinding {
  check_id: string;
  path: string;
  start_line: number;
  start_col: number;
  end_line: number;
  end_col: number;
  message: string;
  severity: "ERROR" | "WARNING" | "INFO" | string;
  code_snippet?: string;
}

export type usize = number;

export interface LinterReport {
  success: boolean;
  findings: LinterFinding[];
  scanned_files_count: usize;
  scan_duration_ms: number;
  engine: string;
}

export interface ProblemsPanelProps {
  activeFile?: string;
  workspaceRoot?: string;
  workspaceDiagnostics?: WorkspaceDiagnostics | null;
  diagnostics?: CargoDiagnostic[];
  lspDiagnostics?: Record<string, LspDiagnostic[]>;
  onNavigateToProblem?: (filePath: string, line: number, col: number) => void;
  onClose?: () => void;
  onOpenFile?: (filePath: string) => void;
  onReloadFile?: (filePath: string) => void;
}
