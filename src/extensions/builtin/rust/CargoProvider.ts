/**
 * extensions/builtin/rust/CargoProvider.ts
 * Rust IDE Cargo Engine bridge communicating with Rust backend commands.
 */

import { invoke } from "@tauri-apps/api/core";

export interface CargoDependency {
  name: string;
  version: string;
  is_dev: boolean;
}

export interface CargoProjectInfo {
  is_cargo_project: boolean;
  package_name: string;
  version: string;
  edition: string;
  bin_targets: string[];
  has_lib: boolean;
  dependencies: CargoDependency[];
  workspace_members: string[];
}

export interface CargoDiagnostic {
  severity: "error" | "warning" | "info";
  message: string;
  file_path: string;
  line: number; // 0-based
  column: number; // 0-based
  code?: string;
  rendered: string;
  suggested_replacement?: string;
}

export interface FileDiagnosticSummary {
  filePath: string;
  errors: number;
  warnings: number;
  diagnostics: CargoDiagnostic[];
}

export interface WorkspaceDiagnostics {
  totalErrors: number;
  totalWarnings: number;
  files: Record<string, FileDiagnosticSummary>;
}

export interface CargoExecutionResult {
  success: boolean;
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
  diagnostics: CargoDiagnostic[];
}

export interface RustTestItem {
  name: string;
  file_path: string;
  line: number;
  module_path: string;
}

export class CargoProvider {
  static async getProjectInfo(projectPath: string): Promise<CargoProjectInfo> {
    if (!projectPath) {
      return {
        is_cargo_project: false,
        package_name: "",
        version: "",
        edition: "2021",
        bin_targets: [],
        has_lib: false,
        dependencies: [],
        workspace_members: [],
      };
    }

    try {
      if (window.__TAURI_INTERNALS__) {
        return await invoke<CargoProjectInfo>("cargo_get_project_info", { projectPath });
      } else {
        return {
          is_cargo_project: true,
          package_name: "pomai-studio",
          version: "0.1.0",
          edition: "2021",
          bin_targets: ["pomai-studio"],
          has_lib: true,
          dependencies: [
            { name: "tauri", version: "2", is_dev: false },
            { name: "serde", version: "1", is_dev: false },
            { name: "ropey", version: "1.6", is_dev: false },
            { name: "tokio", version: "1", is_dev: false },
          ],
          workspace_members: [],
        };
      }
    } catch (e) {
      console.error("Failed to get cargo project info:", e);
      return {
        is_cargo_project: false,
        package_name: "",
        version: "",
        edition: "2021",
        bin_targets: [],
        has_lib: false,
        dependencies: [],
        workspace_members: [],
      };
    }
  }

  static async checkDiagnostics(projectPath: string): Promise<CargoDiagnostic[]> {
    if (!projectPath) return [];
    try {
      if (window.__TAURI_INTERNALS__) {
        return await invoke<CargoDiagnostic[]>("cargo_check_diagnostics", { projectPath });
      } else {
        return [];
      }
    } catch (e) {
      console.error("Failed to check diagnostics:", e);
      return [];
    }
  }

  static async checkWorkspaceDiagnostics(projectPath: string): Promise<WorkspaceDiagnostics> {
    if (!projectPath) {
      return { totalErrors: 0, totalWarnings: 0, files: {} };
    }
    try {
      if (window.__TAURI_INTERNALS__) {
        const res = await invoke<{
          total_errors: number;
          total_warnings: number;
          files: Record<string, {
            file_path: string;
            errors: number;
            warnings: number;
            diagnostics: CargoDiagnostic[];
          }>;
        }>("cargo_check_workspace_diagnostics", { projectPath });

        const mappedFiles: Record<string, FileDiagnosticSummary> = {};
        for (const [k, v] of Object.entries(res.files || {})) {
          mappedFiles[k] = {
            filePath: v.file_path,
            errors: v.errors,
            warnings: v.warnings,
            diagnostics: v.diagnostics,
          };
        }

        return {
          totalErrors: res.total_errors,
          totalWarnings: res.total_warnings,
          files: mappedFiles,
        };
      } else {
        return { totalErrors: 0, totalWarnings: 0, files: {} };
      }
    } catch (e) {
      console.error("Failed to check workspace diagnostics:", e);
      return { totalErrors: 0, totalWarnings: 0, files: {} };
    }
  }

  static async runCommand(
    projectPath: string,
    action: "run" | "build" | "check" | "test" | "clippy" | "fmt" | "clean" | "doc",
    profile = "dev",
    extraArgs: string[] = []
  ): Promise<CargoExecutionResult> {
    if (!projectPath) {
      return {
        success: false,
        exit_code: 1,
        stdout: "",
        stderr: "No active workspace folder",
        duration_ms: 0,
        diagnostics: [],
      };
    }

    try {
      if (window.__TAURI_INTERNALS__) {
        return await invoke<CargoExecutionResult>("cargo_run_command", {
          projectPath,
          action,
          profile,
          extraArgs,
        });
      } else {
        return {
          success: true,
          exit_code: 0,
          stdout: `Finished \`${profile}\` profile in 0.42s`,
          stderr: "",
          duration_ms: 420,
          diagnostics: [],
        };
      }
    } catch (e) {
      return {
        success: false,
        exit_code: 1,
        stdout: "",
        stderr: String(e),
        duration_ms: 0,
        diagnostics: [],
      };
    }
  }

  static async discoverTests(projectPath: string): Promise<RustTestItem[]> {
    if (!projectPath) return [];
    try {
      if (window.__TAURI_INTERNALS__) {
        return await invoke<RustTestItem[]>("cargo_test_discovery", { projectPath });
      }
      return [];
    } catch (e) {
      console.error("Test discovery failed:", e);
      return [];
    }
  }

  static async format(projectPath: string, filePath?: string): Promise<void> {
    if (!projectPath) return;
    try {
      if (window.__TAURI_INTERNALS__) {
        await invoke("cargo_format", { projectPath, filePath });
      }
    } catch (e) {
      console.error("Format failed:", e);
    }
  }
}
