use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use parking_lot::Mutex;
use serde::Serialize;

pub struct TerminalSession {
    pub writer: Box<dyn Write + Send>,
    pub master: Box<dyn portable_pty::MasterPty + Send>,
    pub profile: String,
}

pub struct TerminalState {
    pub sessions: HashMap<String, TerminalSession>,
}

#[derive(Serialize, Clone, Debug)]
pub struct PtyOutputPayload {
    pub id: String,
    pub data: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct PtyExitPayload {
    pub id: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct TerminalProfileInfo {
    pub id: String,
    pub name: String,
    pub icon: String,
}

fn find_git_bash() -> Option<String> {
    let candidate_paths = [
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files (x86)\Git\bin\bash.exe",
        r"C:\Program Files\Git\usr\bin\bash.exe",
    ];

    for path in &candidate_paths {
        if Path::new(path).exists() {
            return Some(path.to_string());
        }
    }

    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let p = format!(r"{}\Programs\Git\bin\bash.exe", local_app_data);
        if Path::new(&p).exists() {
            return Some(p);
        }
    }

    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        let p = format!(r"{}\scoop\apps\git\current\bin\bash.exe", user_profile);
        if Path::new(&p).exists() {
            return Some(p);
        }
    }

    None
}

#[allow(dead_code)]
fn get_wsl_distros() -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        use crate::utils::CommandExtHideWindow;
        if let Ok(output) = std::process::Command::new("wsl.exe")
            .hide_window()
            .args(["-l", "-q"])
            .output()
        {
            if output.status.success() {
                // wsl.exe outputs UTF-16LE by default on Windows
                let bytes = &output.stdout;
                let text = if bytes.len() >= 2 && bytes.len() % 2 == 0 {
                    let u16_slice: Vec<u16> = bytes
                        .chunks_exact(2)
                        .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
                        .collect();
                    String::from_utf16_lossy(&u16_slice)
                } else {
                    String::from_utf8_lossy(bytes).into_owned()
                };

                let distros: Vec<String> = text
                    .lines()
                    .map(|l| l.trim().trim_matches('\0').trim().to_string())
                    .filter(|l| !l.is_empty() && !l.starts_with("docker-desktop"))
                    .collect();
                return distros;
            }
        }
    }
    Vec::new()
}

#[tauri::command]
pub async fn list_terminal_profiles() -> Result<Vec<TerminalProfileInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut profiles = Vec::new();

        #[cfg(target_os = "windows")]
        {
            profiles.push(TerminalProfileInfo {
                id: "powershell".to_string(),
                name: "Windows PowerShell".to_string(),
                icon: "powershell".to_string(),
            });
            profiles.push(TerminalProfileInfo {
                id: "cmd".to_string(),
                name: "Command Prompt".to_string(),
                icon: "cmd".to_string(),
            });

            if let Some(_git_path) = find_git_bash() {
                profiles.push(TerminalProfileInfo {
                    id: "gitbash".to_string(),
                    name: "Git Bash".to_string(),
                    icon: "gitbash".to_string(),
                });
            }

            profiles.push(TerminalProfileInfo {
                id: "wsl:Ubuntu-24.04".to_string(),
                name: "Ubuntu-2404 (WSL)".to_string(),
                icon: "wsl".to_string(),
            });
        }

        #[cfg(not(target_os = "windows"))]
        {
            profiles.push(TerminalProfileInfo {
                id: "bash".to_string(),
                name: "Bash".to_string(),
                icon: "bash".to_string(),
            });
            profiles.push(TerminalProfileInfo {
                id: "zsh".to_string(),
                name: "Zsh".to_string(),
                icon: "zsh".to_string(),
            });
        }

        Ok(profiles)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn spawn_terminal(
    app: AppHandle,
    id: String,
    profile: Option<String>,
    cwd: Option<String>,
    state: State<'_, Arc<Mutex<TerminalState>>>,
) -> Result<(), String> {
    let state_arc = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
    {
        let mut t_state = state_arc.lock();
        if t_state.sessions.contains_key(&id) {
            // Already spawned with this ID, remove old first
            t_state.sessions.remove(&id);
        }
    }

    let pty_system = NativePtySystem::default();

    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    let profile_name = profile.clone().unwrap_or_else(|| "powershell".to_string());

    #[cfg(target_os = "windows")]
    let cmd = {
        if profile_name.starts_with("wsl") || profile_name == "ubuntu" {
            let mut c = CommandBuilder::new(r"C:\Windows\System32\wsl.exe");
            
            // Check for specific distro e.g. "wsl:Ubuntu-24.04"
            if let Some(distro) = profile_name.strip_prefix("wsl:") {
                if !distro.is_empty() {
                    c.arg("-d");
                    c.arg(distro);
                }
            }
            
            // Pass directory via official WSL --cd flag
            if let Some(ref dir) = cwd {
                if !dir.trim().is_empty() {
                    c.arg("--cd");
                    c.arg(dir);
                }
            }
            c.env("WSL_UTF8", "1");
            c
        } else if profile_name == "gitbash" {
            let bash_path = find_git_bash().unwrap_or_else(|| "bash.exe".to_string());
            let mut c = CommandBuilder::new(bash_path);
            c.arg("--login");
            c.arg("-i");
            if let Some(ref dir) = cwd {
                if !dir.trim().is_empty() {
                    c.cwd(dir);
                }
            }
            c
        } else if profile_name == "cmd" {
            let mut c = CommandBuilder::new(r"C:\Windows\System32\cmd.exe");
            if let Some(ref dir) = cwd {
                if !dir.trim().is_empty() {
                    c.cwd(dir);
                }
            }
            c
        } else {
            // Default: PowerShell
            let mut c = CommandBuilder::new("powershell.exe");
            c.arg("-NoLogo");
            if let Some(ref dir) = cwd {
                if !dir.trim().is_empty() {
                    c.cwd(dir);
                }
            }
            c
        }
    };

    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let shell = match profile_name.as_str() {
            "zsh" => "zsh",
            _ => "bash",
        };
        let mut c = CommandBuilder::new(shell);
        c.arg("-i");
        if let Some(ref dir) = cwd {
            if !dir.trim().is_empty() {
                c.cwd(dir);
            }
        }
        c
    };

    let mut _child = pair.slave.spawn_command(cmd).map_err(|e| format!("Failed to spawn shell: {}", e))?;

    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    // Save session in map
    {
        let mut t_state = state_arc.lock();
        t_state.sessions.insert(
            id.clone(),
            TerminalSession {
                writer,
                master: pair.master,
                profile: profile_name,
            },
        );
    }

    // Spawn reader thread for this specific terminal ID
    let term_id = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(n) if n > 0 => {
                    let s = String::from_utf8_lossy(&buf[..n]).into_owned();
                    let payload = PtyOutputPayload {
                        id: term_id.clone(),
                        data: s,
                    };
                    let _ = app.emit("pty-output", payload.clone());
                    let _ = app.emit("terminal-output", payload);
                }
                _ => {
                    let exit_payload = PtyExitPayload {
                        id: term_id.clone(),
                    };
                    let _ = app.emit("pty-exit", exit_payload);
                    break;
                }
            }
        }
    });

    Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn create_terminal(
    app: AppHandle,
    id: String,
    profile: Option<String>,
    cwd: Option<String>,
    state: State<'_, Arc<Mutex<TerminalState>>>,
) -> Result<(), String> {
    spawn_terminal(app, id, profile, cwd, state).await
}

#[tauri::command]
pub fn write_terminal(
    id: String,
    data: String,
    state: State<'_, Arc<Mutex<TerminalState>>>,
) -> Result<(), String> {
    let mut t_state = state.lock();
    if let Some(session) = t_state.sessions.get_mut(&id) {
        session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn resize_terminal(
    id: String,
    rows: u16,
    cols: u16,
    state: State<'_, Arc<Mutex<TerminalState>>>,
) -> Result<(), String> {
    let t_state = state.lock();
    if let Some(session) = t_state.sessions.get(&id) {
        session.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        }).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn kill_terminal(
    id: String,
    state: State<'_, Arc<Mutex<TerminalState>>>,
) -> Result<(), String> {
    let mut t_state = state.lock();
    t_state.sessions.remove(&id);
    Ok(())
}
