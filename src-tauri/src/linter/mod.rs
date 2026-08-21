//! linter/mod.rs — Native Pomai Linter sidecar runner and SARIF / JSON diagnostic parser.
//!
//! Spawns the bundled `pomai-linter` binary, feeds the workspace path, parses
//! JSON/SARIF diagnostic streams, and maps them to the IDE's Problems Tool Window.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Instant;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinterFinding {
    pub check_id: String,
    pub path: String,
    pub start_line: usize,
    pub start_col: usize,
    pub end_line: usize,
    pub end_col: usize,
    pub message: String,
    pub severity: String, // "ERROR", "WARNING", "INFO"
    pub code_snippet: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinterReport {
    pub success: bool,
    pub findings: Vec<LinterFinding>,
    pub scanned_files_count: usize,
    pub scan_duration_ms: u64,
    pub engine: String,
}

fn get_target_triple() -> &'static str {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    { "x86_64-pc-windows-msvc" }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    { "aarch64-apple-darwin" }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    { "x86_64-apple-darwin" }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    { "x86_64-unknown-linux-gnu" }
    #[cfg(not(any(
        all(target_os = "windows", target_arch = "x86_64"),
        all(target_os = "macos", any(target_arch = "aarch64", target_arch = "x86_64")),
        all(target_os = "linux", target_arch = "x86_64")
    )))]
    { "x86_64-pc-windows-msvc" }
}

/// Locates the bundled pomai-linter sidecar executable across dev and production bundles.
fn resolve_sidecar_binary(_app: &AppHandle) -> Option<PathBuf> {
    let target = get_target_triple();
    let ext = if cfg!(target_os = "windows") { ".exe" } else { "" };
    let expected_name = format!("pomai-linter-{}{}", target, ext);

    // 1. Check next to the current application executable (production bundle)
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            let p = exe_dir.join(&expected_name);
            if p.is_file() {
                return Some(p);
            }
            let direct = exe_dir.join(format!("pomai-linter{}", ext));
            if direct.is_file() {
                return Some(direct);
            }
        }
    }

    // 2. Check src-tauri/binaries/ during local development
    let dev_path = PathBuf::from("binaries").join(&expected_name);
    if dev_path.is_file() {
        return Some(dev_path);
    }

    let dev_direct = PathBuf::from("binaries").join(format!("pomai-linter{}", ext));
    if dev_direct.is_file() {
        return Some(dev_direct);
    }

    None
}

/// Runs the pomai-linter scan on the given workspace path.
pub async fn run_linter_scan(
    app: &AppHandle,
    workspace_path: &Path,
    rules_config: Option<&str>,
) -> Result<LinterReport, String> {
    let start_time = Instant::now();
    let config_arg = rules_config.unwrap_or("auto");

    if let Some(sidecar_path) = resolve_sidecar_binary(app) {
        let mut cmd = Command::new(&sidecar_path);
        cmd.arg("scan")
            .arg("--json")
            .arg("--metrics=off")
            .arg("--quiet")
            .arg(format!("--config={}", config_arg))
            .arg(workspace_path);

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        if let Ok(output) = cmd.output() {
            if !output.stdout.is_empty() {
                if let Ok(json_val) = serde_json::from_slice::<Value>(&output.stdout) {
                    let mut findings = Vec::new();
                    if let Some(results) = json_val.get("results").and_then(|r| r.as_array()) {
                        for res in results {
                            let check_id = res["check_id"].as_str().unwrap_or("pomai.rule").to_string();
                            let path = res["path"].as_str().unwrap_or("").to_string();
                            let start_line = res["start"]["line"].as_u64().unwrap_or(1) as usize;
                            let start_col = res["start"]["col"].as_u64().unwrap_or(1) as usize;
                            let end_line = res["end"]["line"].as_u64().unwrap_or(start_line as u64) as usize;
                            let end_col = res["end"]["col"].as_u64().unwrap_or(start_col as u64) as usize;
                            let message = res["extra"]["message"].as_str().unwrap_or("").to_string();
                            let severity = res["extra"]["severity"]
                                .as_str()
                                .unwrap_or("WARNING")
                                .to_uppercase();
                            let lines = res["extra"]["lines"].as_str().map(|s| s.to_string());

                            findings.push(LinterFinding {
                                check_id,
                                path,
                                start_line,
                                start_col,
                                end_line,
                                end_col,
                                message,
                                severity,
                                code_snippet: lines,
                            });
                        }
                    }

                    let scanned_count = json_val
                        .get("paths")
                        .and_then(|p| p.get("scanned"))
                        .and_then(|s| s.as_array())
                        .map(|a| a.len())
                        .unwrap_or(1);

                    return Ok(LinterReport {
                        success: true,
                        findings,
                        scanned_files_count: scanned_count,
                        scan_duration_ms: start_time.elapsed().as_millis() as u64,
                        engine: "Pomai-Linter Native Engine".to_string(),
                    });
                }
            }
        }
    }

    // ── In-Process Static Analysis Engine (Zero external dependency fallback) ──
    Ok(run_in_process_scan(workspace_path))
}

pub fn run_in_process_scan(workspace_path: &Path) -> LinterReport {
    let start_time = Instant::now();
    let mut findings = Vec::new();
    let mut scanned_count = 0;

    if let Ok(entries) = walkdir::WalkDir::new(workspace_path)
        .max_depth(8)
        .into_iter()
        .collect::<Result<Vec<_>, _>>()
    {
        for entry in entries {
            if entry.file_type().is_file() {
                let path = entry.path();
                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                if ["rs", "ts", "tsx", "js", "toml", "json"].contains(&ext) {
                    scanned_count += 1;
                    let rel_path = path
                        .strip_prefix(workspace_path)
                        .unwrap_or(path)
                        .to_string_lossy()
                        .to_string();

                    if let Ok(content) = std::fs::read_to_string(path) {
                        for (idx, line) in content.lines().enumerate() {
                            let line_num = idx + 1;

                            // Rule 1: Audit unwrap() in Rust production code
                            if ext == "rs" && line.contains(".unwrap()") && !line.trim().starts_with("//") {
                                findings.push(LinterFinding {
                                    check_id: "pomai.rust.safety.avoid-unwrap".to_string(),
                                    path: rel_path.clone(),
                                    start_line: line_num,
                                    start_col: line.find(".unwrap()").unwrap_or(0) + 1,
                                    end_line: line_num,
                                    end_col: line.len(),
                                    message: "Potential panic risk: use `?` operator or `expect()` with explanatory message instead of `.unwrap()`".to_string(),
                                    severity: "WARNING".to_string(),
                                    code_snippet: Some(line.trim().to_string()),
                                });
                            }

                            // Rule 2: Audit unsafe blocks in Rust
                            if ext == "rs" && line.contains("unsafe {") && !line.trim().starts_with("//") {
                                findings.push(LinterFinding {
                                    check_id: "pomai.rust.safety.unsafe-block-audit".to_string(),
                                    path: rel_path.clone(),
                                    start_line: line_num,
                                    start_col: line.find("unsafe").unwrap_or(0) + 1,
                                    end_line: line_num,
                                    end_col: line.len(),
                                    message: "Unsafe block detected: requires explicit safety invariant comment".to_string(),
                                    severity: "INFO".to_string(),
                                    code_snippet: Some(line.trim().to_string()),
                                });
                            }

                            // Rule 3: Detect unaddressed TODOs/FIXMEs
                            if line.contains("TODO:") || line.contains("FIXME:") {
                                findings.push(LinterFinding {
                                    check_id: "pomai.quality.pending-todo".to_string(),
                                    path: rel_path.clone(),
                                    start_line: line_num,
                                    start_col: 1,
                                    end_line: line_num,
                                    end_col: line.len(),
                                    message: format!("Unresolved task annotation: {}", line.trim()),
                                    severity: "INFO".to_string(),
                                    code_snippet: Some(line.trim().to_string()),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    LinterReport {
        success: true,
        findings,
        scanned_files_count: scanned_count.max(1),
        scan_duration_ms: start_time.elapsed().as_millis() as u64,
        engine: "Pomai Static Analysis Core".to_string(),
    }
}

#[tauri::command]
pub async fn scan_workspace_linter(
    app: AppHandle,
    workspace_root: String,
    rules_config: Option<String>,
) -> Result<LinterReport, String> {
    let p = PathBuf::from(&workspace_root);
    if !p.exists() {
        return Err(format!("Workspace path does not exist: {}", workspace_root));
    }
    run_linter_scan(&app, &p, rules_config.as_deref()).await
}

#[cfg(test)]
mod tests;
