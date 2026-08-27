use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::time::Instant;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex as TokioMutex;

use crate::cargo::{CargoProcessManager, CargoCommand, CodeSuggestion, apply_compiler_suggestion};
use crate::buffer::{RopeBuffer, TextBuffer};
use crate::utils::CommandExtHideWindow;

// ── Managed State ─────────────────────────────────────────────────────────

/// App-level managed state for Cargo process manager
pub struct CargoProcessState {
    pub process_manager: Arc<TokioMutex<Option<CargoProcessManager>>>,
}

impl CargoProcessState {
    pub fn new() -> Self {
        Self {
            process_manager: Arc::new(TokioMutex::new(None)),
        }
    }
}

/// Apply a compiler suggestion to a file
#[tauri::command]
pub async fn cargo_apply_suggestion(
    params: ApplySuggestionParams,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let file_path = Path::new(&params.file_path);
        
        // Read the current file content
        let content = fs::read_to_string(file_path)
            .map_err(|e| format!("Failed to read file: {}", e))?;
        
        // Create a rope buffer
        let mut buffer = RopeBuffer::from_str(&content);
        
        // Apply the suggestion
        apply_compiler_suggestion(&mut buffer, &params.suggestion)
            .map_err(|e| format!("Failed to apply suggestion: {}", e))?;
        
        // Get the modified content
        let modified_content = buffer.slice(0, buffer.len_chars()).to_string();
        
        // Write back to file
        fs::write(file_path, modified_content)
            .map_err(|e| format!("Failed to write file: {}", e))?;
        
        Ok("Suggestion applied successfully".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CargoDependency {
    pub name: String,
    pub version: String,
    pub is_dev: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CargoProjectInfo {
    pub is_cargo_project: bool,
    pub package_name: String,
    pub version: String,
    pub edition: String,
    pub bin_targets: Vec<String>,
    pub has_lib: bool,
    pub dependencies: Vec<CargoDependency>,
    pub workspace_members: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CargoDiagnostic {
    pub severity: String, // "error" | "warning" | "info"
    pub message: String,
    pub file_path: String,
    pub line: usize,   // 0-based
    pub column: usize, // 0-based
    pub code: Option<String>,
    pub rendered: String,
    pub suggested_replacement: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct FileDiagnosticSummary {
    pub file_path: String,
    pub errors: usize,
    pub warnings: usize,
    pub diagnostics: Vec<CargoDiagnostic>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct WorkspaceDiagnostics {
    pub total_errors: usize,
    pub total_warnings: usize,
    pub files: HashMap<String, FileDiagnosticSummary>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CargoExecutionResult {
    pub success: bool,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u128,
    pub diagnostics: Vec<CargoDiagnostic>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RustTestItem {
    pub name: String,
    pub file_path: String,
    pub line: usize,
    pub module_path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SingleTestResult {
    pub name: String,
    pub status: String,
    pub duration_ms: u64,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ApplySuggestionParams {
    pub file_path: String,
    pub suggestion: CodeSuggestion,
}

#[tauri::command]
pub async fn cargo_get_project_info(project_path: String) -> Result<CargoProjectInfo, String> {
    tokio::task::spawn_blocking(move || {
        let root = Path::new(&project_path);
        let cargo_toml_path = root.join("Cargo.toml");

        if !cargo_toml_path.exists() {
            return Ok(CargoProjectInfo {
                is_cargo_project: false,
                package_name: String::new(),
                version: String::new(),
                edition: String::new(),
                bin_targets: Vec::new(),
                has_lib: false,
                dependencies: Vec::new(),
                workspace_members: Vec::new(),
            });
        }

        let content = fs::read_to_string(&cargo_toml_path).map_err(|e| e.to_string())?;
        let parsed: toml::Value = toml::from_str(&content).unwrap_or(toml::Value::Table(Default::default()));

        let mut package_name = String::new();
        let mut version = String::new();
        let mut edition = String::from("2021");

        if let Some(pkg) = parsed.get("package") {
            if let Some(n) = pkg.get("name").and_then(|v| v.as_str()) {
                package_name = n.to_string();
            }
            if let Some(v) = pkg.get("version").and_then(|v| v.as_str()) {
                version = v.to_string();
            }
            if let Some(e) = pkg.get("edition").and_then(|v| v.as_str()) {
                edition = e.to_string();
            }
        }

        // Parse Dependencies
        let mut dependencies = Vec::new();
        if let Some(deps) = parsed.get("dependencies").and_then(|v| v.as_table()) {
            for (k, v) in deps {
                let ver_str = match v {
                    toml::Value::String(s) => s.clone(),
                    toml::Value::Table(t) => t.get("version").and_then(|x| x.as_str()).unwrap_or("path/git").to_string(),
                    _ => String::from("*"),
                };
                dependencies.push(CargoDependency {
                    name: k.clone(),
                    version: ver_str,
                    is_dev: false,
                });
            }
        }

        if let Some(dev_deps) = parsed.get("dev-dependencies").and_then(|v| v.as_table()) {
            for (k, v) in dev_deps {
                let ver_str = match v {
                    toml::Value::String(s) => s.clone(),
                    toml::Value::Table(t) => t.get("version").and_then(|x| x.as_str()).unwrap_or("path/git").to_string(),
                    _ => String::from("*"),
                };
                dependencies.push(CargoDependency {
                    name: k.clone(),
                    version: ver_str,
                    is_dev: true,
                });
            }
        }

        // Workspace members
        let mut workspace_members = Vec::new();
        if let Some(ws) = parsed.get("workspace").and_then(|v| v.as_table()) {
            if let Some(members) = ws.get("members").and_then(|v| v.as_array()) {
                for m in members {
                    if let Some(s) = m.as_str() {
                        workspace_members.push(s.to_string());
                    }
                }
            }
        }

        // Targets detection
        let mut bin_targets = Vec::new();
        let src_main = root.join("src").join("main.rs");
        if src_main.exists() {
            bin_targets.push(if package_name.is_empty() { "main".to_string() } else { package_name.clone() });
        }

        let bin_dir = root.join("src").join("bin");
        if bin_dir.exists() && bin_dir.is_dir() {
            if let Ok(entries) = fs::read_dir(bin_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.extension().map_or(false, |ext| ext == "rs") {
                        if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
                            bin_targets.push(stem.to_string());
                        }
                    }
                }
            }
        }

        let has_lib = root.join("src").join("lib.rs").exists();

        Ok(CargoProjectInfo {
            is_cargo_project: true,
            package_name,
            version,
            edition,
            bin_targets,
            has_lib,
            dependencies,
            workspace_members,
        })
    }).await.map_err(|e| e.to_string())?
}

fn parse_cargo_diagnostics_from_json(json_output: &str, project_root: &Path) -> Vec<CargoDiagnostic> {
    let mut diagnostics = Vec::new();

    for line in json_output.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let parsed: serde_json::Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        if parsed.get("reason").and_then(|r| r.as_str()) != Some("compiler-message") {
            continue;
        }

        let msg_obj = match parsed.get("message") {
            Some(m) => m,
            None => continue,
        };

        let severity = msg_obj.get("level").and_then(|l| l.as_str()).unwrap_or("error").to_string();
        let message = msg_obj.get("message").and_then(|m| m.as_str()).unwrap_or("").to_string();
        let rendered = msg_obj.get("rendered").and_then(|r| r.as_str()).unwrap_or("").to_string();
        let code = msg_obj.get("code").and_then(|c| c.get("code")).and_then(|cd| cd.as_str()).map(|s| s.to_string());

        let mut file_path = String::new();
        let mut line_num = 0;
        let mut col_num = 0;
        let mut suggested_replacement = None;

        if let Some(spans) = msg_obj.get("spans").and_then(|s| s.as_array()) {
            if let Some(primary_span) = spans.iter().find(|s| s.get("is_primary").and_then(|ip| ip.as_bool()) == Some(true)).or_else(|| spans.first()) {
                if let Some(fn_str) = primary_span.get("file_name").and_then(|f| f.as_str()) {
                    let path_obj = PathBuf::from(fn_str);
                    file_path = if path_obj.is_absolute() {
                        fn_str.to_string()
                    } else {
                        project_root.join(path_obj).to_string_lossy().to_string()
                    };
                }

                line_num = primary_span.get("line_start").and_then(|l| l.as_u64()).unwrap_or(1).saturating_sub(1) as usize;
                col_num = primary_span.get("column_start").and_then(|c| c.as_u64()).unwrap_or(1).saturating_sub(1) as usize;

                if let Some(sug) = primary_span.get("suggested_replacement").and_then(|s| s.as_str()) {
                    suggested_replacement = Some(sug.to_string());
                }
            }
        }

        diagnostics.push(CargoDiagnostic {
            severity,
            message,
            file_path,
            line: line_num,
            column: col_num,
            code,
            rendered,
            suggested_replacement,
        });
    }

    diagnostics
}

#[tauri::command]
pub async fn cargo_check_diagnostics(project_path: String) -> Result<Vec<CargoDiagnostic>, String> {
    tokio::task::spawn_blocking(move || {
        let root = Path::new(&project_path);
        if !root.exists() {
            return Ok(Vec::new());
        }

        let output = Command::new("cargo")
            .hide_window()
            .args(&["check", "--message-format=json", "--all-targets"])
            .current_dir(root)
            .output()
            .map_err(|e| e.to_string())?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        let combined = format!("{}\n{}", stdout, stderr);

        let diagnostics = parse_cargo_diagnostics_from_json(&combined, root);
        Ok(diagnostics)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn cargo_check_workspace_diagnostics(
    app: AppHandle,
    project_path: String,
) -> Result<WorkspaceDiagnostics, String> {
    tokio::task::spawn_blocking(move || {
        let root = Path::new(&project_path);
        if !root.exists() {
            return Ok(WorkspaceDiagnostics::default());
        }

        let output = Command::new("cargo")
            .hide_window()
            .args(&["check", "--message-format=json", "--all-targets"])
            .current_dir(root)
            .output()
            .map_err(|e| e.to_string())?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        let combined = format!("{}\n{}", stdout, stderr);

        let diagnostics = parse_cargo_diagnostics_from_json(&combined, root);

        let mut total_errors = 0;
        let mut total_warnings = 0;
        let mut files: HashMap<String, FileDiagnosticSummary> = HashMap::new();

        for d in diagnostics {
            let is_error = d.severity == "error";
            let is_warning = d.severity == "warning";

            if is_error {
                total_errors += 1;
            } else if is_warning {
                total_warnings += 1;
            }

            if !d.file_path.is_empty() {
                let norm_path = d.file_path.replace('\\', "/");
                let entry = files.entry(norm_path).or_insert_with(|| FileDiagnosticSummary {
                    file_path: d.file_path.clone(),
                    errors: 0,
                    warnings: 0,
                    diagnostics: Vec::new(),
                });

                if is_error {
                    entry.errors += 1;
                } else if is_warning {
                    entry.warnings += 1;
                }
                entry.diagnostics.push(d);
            }
        }

        let result = WorkspaceDiagnostics {
            total_errors,
            total_warnings,
            files,
        };

        let _ = app.emit("workspace-diagnostics-updated", &result);

        Ok(result)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn cargo_run_command(
    project_path: String,
    action: String, // "run" | "build" | "check" | "test" | "clippy" | "fmt" | "clean" | "doc"
    profile: String, // "dev" | "release"
    extra_args: Vec<String>,
) -> Result<CargoExecutionResult, String> {
    tokio::task::spawn_blocking(move || {
        let root = Path::new(&project_path);
        if !root.exists() {
            return Err("Project directory does not exist".to_string());
        }

        let start = Instant::now();
        let mut cmd = Command::new("cargo");
        cmd.hide_window();

        match action.as_str() {
            "run" => {
                cmd.arg("run");
                if profile == "release" {
                    cmd.arg("--release");
                }
            }
            "build" => {
                cmd.arg("build");
                if profile == "release" {
                    cmd.arg("--release");
                }
            }
            "check" => {
                cmd.arg("check");
                cmd.arg("--all-targets");
            }
            "test" => {
                cmd.arg("test");
            }
            "clippy" => {
                cmd.arg("clippy");
                cmd.arg("--all-targets");
            }
            "fmt" => {
                cmd.arg("fmt");
            }
            "clean" => {
                cmd.arg("clean");
            }
            "doc" => {
                cmd.arg("doc");
            }
            _ => {
                cmd.arg(&action);
            }
        }

        for arg in &extra_args {
            cmd.arg(arg);
        }

        cmd.current_dir(root);

        let output = cmd.output().map_err(|e| e.to_string())?;
        let duration_ms = start.elapsed().as_millis();

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let success = output.status.success();
        let exit_code = output.status.code().unwrap_or(if success { 0 } else { 1 });

        let combined = format!("{}\n{}", stdout, stderr);
        let diagnostics = parse_cargo_diagnostics_from_json(&combined, root);

        Ok(CargoExecutionResult {
            success,
            exit_code,
            stdout,
            stderr,
            duration_ms,
            diagnostics,
        })
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn cargo_test_discovery(project_path: String) -> Result<Vec<RustTestItem>, String> {
    tokio::task::spawn_blocking(move || {
        let root = Path::new(&project_path);
        if !root.exists() {
            return Ok(Vec::new());
        }

        let mut tests = Vec::new();
        let test_fn_regex = regex::Regex::new(r"fn\s+([a-zA-Z0-9_]+)\s*\(").unwrap();

        // Walk through workspace directory, ignoring target, .git, node_modules, .cargo
        let walker = walkdir::WalkDir::new(root)
            .into_iter()
            .filter_entry(|e| {
                let name = e.file_name().to_string_lossy();
                name != "target" && name != ".git" && name != "node_modules" && name != ".cargo"
            });

        for entry in walker.flatten() {
            let p = entry.path();
            if p.is_file() && p.extension().map_or(false, |ext| ext == "rs") {
                if let Ok(content) = fs::read_to_string(p) {
                    let lines: Vec<&str> = content.lines().collect();
                    for (idx, line) in lines.iter().enumerate() {
                        let trimmed = line.trim();
                        let is_test_attr = trimmed.contains("#[test]")
                            || trimmed.contains("#[tokio::test]")
                            || trimmed.contains("#[async_std::test]")
                            || trimmed.contains("#[actix_rt::test]")
                            || trimmed.contains("#[rstest]")
                            || (trimmed.starts_with("#[") && trimmed.contains("test"));

                        if is_test_attr {
                            // Look ahead up to 10 lines for fn signature
                            for j in 1..=10 {
                                if idx + j < lines.len() {
                                    let next_line = lines[idx + j];
                                    if let Some(caps) = test_fn_regex.captures(next_line) {
                                        if let Some(fn_name) = caps.get(1) {
                                            let rel_path = p.strip_prefix(root).unwrap_or(p).to_string_lossy().replace('\\', "/");
                                            let module_path = rel_path
                                                .trim_end_matches(".rs")
                                                .replace('/', "::");

                                            tests.push(RustTestItem {
                                                name: fn_name.as_str().to_string(),
                                                file_path: p.to_string_lossy().to_string(),
                                                line: idx + j + 1,
                                                module_path,
                                            });
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        tests.dedup_by(|a, b| a.file_path == b.file_path && a.name == b.name);

        Ok(tests)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn cargo_format(project_path: String, file_path: Option<String>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let root = Path::new(&project_path);
        let mut cmd = if let Some(fp) = file_path {
            let mut c = Command::new("rustfmt");
            c.hide_window();
            c.arg(&fp);
            c
        } else {
            let mut c = Command::new("cargo");
            c.hide_window();
            c.arg("fmt");
            c.current_dir(root);
            c
        };

        let output = cmd.output().map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn cargo_create_project(parent_dir: String, name: String, is_lib: bool) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let parent = Path::new(&parent_dir);
        if !parent.exists() {
            return Err("Parent directory does not exist".to_string());
        }

        let mut cmd = Command::new("cargo");
        cmd.hide_window();
        cmd.arg("new");
        if is_lib {
            cmd.arg("--lib");
        } else {
            cmd.arg("--bin");
        }
        cmd.arg(&name);
        cmd.current_dir(parent);

        let output = cmd.output().map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }

        let created_path = parent.join(&name).to_string_lossy().to_string();
        Ok(created_path)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn git_clone_project(target_parent_dir: String, repo_url: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let parent = Path::new(&target_parent_dir);
        if !parent.exists() {
            return Err("Target directory does not exist".to_string());
        }

        let repo_name = repo_url
            .trim_end_matches(".git")
            .split('/')
            .last()
            .unwrap_or("cloned-repo");

        let mut cmd = Command::new("git");
        cmd.hide_window();
        cmd.args(&["clone", &repo_url]);
        cmd.current_dir(parent);

        let output = cmd.output().map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }

        let cloned_path = parent.join(repo_name).to_string_lossy().to_string();
        Ok(cloned_path)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn cargo_scaffold_project(
    parent_dir: String,
    name: String,
    commands: Vec<String>,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let parent = Path::new(&parent_dir);
        if !parent.exists() {
            return Err("Destination directory does not exist".to_string());
        }

        let project_dir = parent.join(&name);

        for cmd_raw in commands {
            let mut cmd_str = cmd_raw.replace("{name}", &name);
            
            // If project_dir already exists and command starts with "cd <name> &&" or "cd <name> ;", strip the leading cd
            let prefix_amp = format!("cd {} && ", name);
            let prefix_semi = format!("cd {} ; ", name);
            if project_dir.exists() {
                if cmd_str.starts_with(&prefix_amp) {
                    cmd_str = cmd_str[prefix_amp.len()..].to_string();
                } else if cmd_str.starts_with(&prefix_semi) {
                    cmd_str = cmd_str[prefix_semi.len()..].to_string();
                }
            }

            let mut shell_cmd = if cfg!(target_os = "windows") {
                let win_cmd = cmd_str.replace("&&", ";");
                let mut c = Command::new("powershell");
                c.hide_window();
                c.args(&["-NoProfile", "-Command", &win_cmd]);
                c
            } else {
                let mut c = Command::new("sh");
                c.args(&["-c", &cmd_str]);
                c
            };

            if project_dir.exists() {
                shell_cmd.current_dir(&project_dir);
            } else {
                shell_cmd.current_dir(parent);
            }

            let output = shell_cmd.output().map_err(|e| format!("Failed to execute '{}': {}", cmd_str, e))?;
            if !output.status.success() {
                let err_out = String::from_utf8_lossy(&output.stderr);
                let std_out = String::from_utf8_lossy(&output.stdout);
                return Err(format!("Command '{}' failed:\n{}\n{}", cmd_str, err_out, std_out));
            }
        }

        Ok(project_dir.to_string_lossy().to_string())
    }).await.map_err(|e| e.to_string())?
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AllTestResults {
    pub results: HashMap<String, SingleTestResult>,
    pub total_duration_ms: u64,
    pub full_output: String,
}

#[tauri::command]
pub async fn cargo_run_single_test(
    project_path: String,
    test_name: String,
) -> Result<SingleTestResult, String> {
    tokio::task::spawn_blocking(move || {
        let root = Path::new(&project_path);
        let start = Instant::now();
        let mut cmd = Command::new("cargo");
        cmd.hide_window();
        cmd.arg("test")
            .arg("--workspace")
            .arg(&test_name)
            .arg("--")
            .arg("--exact")
            .arg("--nocapture");
        cmd.current_dir(root);

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }

        let output = cmd.output().map_err(|e| format!("Failed to run test '{test_name}': {e}"))?;
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let status = if output.status.success() {
            "passed".to_string()
        } else if stdout.contains("FAILED") || stderr.contains("FAILED") {
            "failed".to_string()
        } else {
            "failed".to_string()
        };

        Ok(SingleTestResult {
            name: test_name,
            status,
            duration_ms: start.elapsed().as_millis() as u64,
            stdout,
            stderr,
        })
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn cargo_run_all_tests(project_path: String) -> Result<AllTestResults, String> {
    tokio::task::spawn_blocking(move || {
        let root = Path::new(&project_path);
        let start = Instant::now();

        let mut cmd = Command::new("cargo");
        cmd.hide_window();
        cmd.arg("test")
            .arg("--workspace")
            .arg("--no-fail-fast")
            .arg("--")
            .arg("--nocapture");
        cmd.current_dir(root);

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }

        let output = cmd.output().map_err(|e| format!("Failed to run cargo test: {e}"))?;
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let combined = format!("{}\n{}", stdout, stderr);

        let mut results: HashMap<String, SingleTestResult> = HashMap::new();
        let test_line_regex = regex::Regex::new(r"test\s+([a-zA-Z0-9_:]+)\s*\.\.\.\s*(ok|FAILED|ignored)").unwrap();

        for line in combined.lines() {
            if let Some(caps) = test_line_regex.captures(line) {
                if let (Some(full_name), Some(status_match)) = (caps.get(1), caps.get(2)) {
                    let full_test_name = full_name.as_str();
                    let raw_status = status_match.as_str();
                    let status = match raw_status {
                        "ok" => "passed",
                        "FAILED" => "failed",
                        "ignored" => "ignored",
                        _ => "failed",
                    };

                    let short_name = full_test_name.split("::").last().unwrap_or(full_test_name).to_string();

                    let res = SingleTestResult {
                        name: short_name.clone(),
                        status: status.to_string(),
                        duration_ms: 0,
                        stdout: line.to_string(),
                        stderr: String::new(),
                    };

                    results.insert(short_name, res.clone());
                    results.insert(full_test_name.to_string(), res);
                }
            }
        }

        Ok(AllTestResults {
            results,
            total_duration_ms: start.elapsed().as_millis() as u64,
            full_output: combined,
        })
    }).await.map_err(|e| e.to_string())?
}

// ── Streaming Cargo Commands with Real-time Diagnostics ─────────────────────

/// Run cargo check with streaming diagnostics
#[tauri::command]
pub async fn cargo_check_streaming(
    app: AppHandle,
    project_path: String,
    state: State<'_, Arc<CargoProcessState>>,
) -> Result<(), String> {
    let mut manager_guard = state.process_manager.lock().await;
    
    // Initialize process manager if needed
    if manager_guard.is_none() {
        *manager_guard = Some(CargoProcessManager::new(app.clone()));
    }
    
    let manager = manager_guard.as_ref().unwrap();
    let workspace_root = PathBuf::from(project_path);
    
    manager.run_cargo_command(workspace_root, CargoCommand::Check).await
}

/// Run cargo clippy with streaming diagnostics
#[tauri::command]
pub async fn cargo_clippy_streaming(
    app: AppHandle,
    project_path: String,
    state: State<'_, Arc<CargoProcessState>>,
) -> Result<(), String> {
    let mut manager_guard = state.process_manager.lock().await;
    
    if manager_guard.is_none() {
        *manager_guard = Some(CargoProcessManager::new(app.clone()));
    }
    
    let manager = manager_guard.as_ref().unwrap();
    let workspace_root = PathBuf::from(project_path);
    
    manager.run_cargo_command(workspace_root, CargoCommand::Clippy).await
}

/// Run cargo build with streaming diagnostics
#[tauri::command]
pub async fn cargo_build_streaming(
    app: AppHandle,
    project_path: String,
    state: State<'_, Arc<CargoProcessState>>,
) -> Result<(), String> {
    let mut manager_guard = state.process_manager.lock().await;
    
    if manager_guard.is_none() {
        *manager_guard = Some(CargoProcessManager::new(app.clone()));
    }
    
    let manager = manager_guard.as_ref().unwrap();
    let workspace_root = PathBuf::from(project_path);
    
    manager.run_cargo_command(workspace_root, CargoCommand::Build).await
}

/// Cancel the currently running cargo process
#[tauri::command]
pub async fn cargo_cancel_build(state: State<'_, Arc<CargoProcessState>>) -> Result<(), String> {
    let manager_guard = state.process_manager.lock().await;
    if let Some(manager) = manager_guard.as_ref() {
        manager.cancel_active_process().await;
    }
    Ok(())
}

/// Get the currently active cargo process info
#[tauri::command]
pub async fn cargo_get_active_process(state: State<'_, Arc<CargoProcessState>>) -> Result<Option<String>, String> {
    let manager_guard = state.process_manager.lock().await;
    if let Some(manager) = manager_guard.as_ref() {
        let active = manager.get_active_process().await;
        Ok(active.map(|(cmd, _)| cmd.as_str().to_string()))
    } else {
        Ok(None)
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ExternalLibraryItem {
    pub name: String,
    pub version: String,
    pub root_path: String,
    pub is_stdlib: bool,
}

#[tauri::command]
pub async fn cargo_get_external_libraries(project_path: String) -> Result<Vec<ExternalLibraryItem>, String> {
    tokio::task::spawn_blocking(move || {
        let root = Path::new(&project_path);
        if !root.exists() {
            return Ok(Vec::new());
        }

        let mut libraries = Vec::new();
        let norm_project_root = root.to_string_lossy().replace('\\', "/").to_lowercase();

        let mut cargo_cmd = Command::new("cargo");
        #[cfg(target_os = "windows")]
        {
            if let Ok(user_profile) = std::env::var("USERPROFILE") {
                let cargo_bin = format!(r"{}\.cargo\bin\cargo.exe", user_profile);
                if Path::new(&cargo_bin).exists() {
                    cargo_cmd = Command::new(cargo_bin);
                }
            }
        }
        cargo_cmd.hide_window();

        let output = cargo_cmd
            .args(["metadata", "--format-version", "1"])
            .current_dir(root)
            .output();

        if let Ok(out) = output {
            if out.status.success() {
                if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&out.stdout) {
                    if let Some(packages) = val.get("packages").and_then(|p| p.as_array()) {
                        for pkg in packages {
                            let name = pkg.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
                            let version = pkg.get("version").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            let manifest_path_raw = pkg.get("manifest_path").and_then(|m| m.as_str()).unwrap_or("");

                            if manifest_path_raw.is_empty() {
                                continue;
                            }

                            let norm_manifest = manifest_path_raw.replace('\\', "/");
                            let norm_manifest_lower = norm_manifest.to_lowercase();

                            if !norm_manifest_lower.starts_with(&norm_project_root) {
                                if let Some(crate_dir) = Path::new(&norm_manifest).parent() {
                                    libraries.push(ExternalLibraryItem {
                                        name,
                                        version,
                                        root_path: crate_dir.to_string_lossy().replace('\\', "/"),
                                        is_stdlib: false,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        let mut rustc_cmd = Command::new("rustc");
        #[cfg(target_os = "windows")]
        {
            if let Ok(user_profile) = std::env::var("USERPROFILE") {
                let rustc_bin = format!(r"{}\.cargo\bin\rustc.exe", user_profile);
                if Path::new(&rustc_bin).exists() {
                    rustc_cmd = Command::new(rustc_bin);
                }
            }
        }
        rustc_cmd.hide_window();

        if let Ok(sysroot_out) = rustc_cmd.args(["--print", "sysroot"]).output() {
            if sysroot_out.status.success() {
                let sysroot_str = String::from_utf8_lossy(&sysroot_out.stdout).trim().to_string();
                let std_lib_path = PathBuf::from(&sysroot_str).join("lib/rustlib/src/rust/library");
                if std_lib_path.exists() {
                    libraries.push(ExternalLibraryItem {
                        name: "Rust Toolchain (std / core)".to_string(),
                        version: "sysroot".to_string(),
                        root_path: std_lib_path.to_string_lossy().replace('\\', "/"),
                        is_stdlib: true,
                    });
                }
            }
        }

        libraries.sort_by(|a, b| {
            if a.is_stdlib != b.is_stdlib {
                b.is_stdlib.cmp(&a.is_stdlib)
            } else {
                a.name.to_lowercase().cmp(&b.name.to_lowercase())
            }
        });

        libraries.dedup_by(|a, b| a.root_path == b.root_path);

        Ok(libraries)
    }).await.map_err(|e| e.to_string())?
}