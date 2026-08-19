// src-tauri/build.rs — Unified One-Shot Multi-Engine Sidecar Pipeline for Pomai Studio
//
// Dynamically builds & packages both:
// 1. pomai-debugger (from E:\GithubProjects\pomai-studio\codelldb)
// 2. pomai-linter   (from E:\GithubProjects\pomai-studio\linter)

use std::env;
use std::fs;
use std::path::PathBuf;

struct SidecarSpec {
    canonical_name: &'static str,
    candidate_paths: Vec<PathBuf>,
}

fn main() {
    // 1. Resolve active compilation target triple (e.g., x86_64-pc-windows-msvc)
    let target_triple = env::var("TARGET").unwrap_or_else(|_| "x86_64-pc-windows-msvc".to_string());
    let is_windows = target_triple.contains("windows");
    let exe_suffix = if is_windows { ".exe" } else { "" };

    // 2. Ensure target binaries directory exists
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string()));
    let binaries_dir = manifest_dir.join("binaries");
    fs::create_dir_all(&binaries_dir).expect("Failed to create src-tauri/binaries sidecar directory");

    // 3. Define multi-engine candidate locations
    let engines: [SidecarSpec; 2] = [
        // ── Engine 1: pomai-debugger ──
        SidecarSpec {
            canonical_name: "pomai-debugger",
            candidate_paths: vec![
                manifest_dir.join("..").join("debugger").join("target").join("release").join(format!("pomai-debugger{}", exe_suffix)),
                manifest_dir.join("..").join("debugger").join("target").join("release").join(format!("codelldb{}", exe_suffix)),
                manifest_dir.join("..").join("debugger").join("target").join("debug").join(format!("codelldb{}", exe_suffix)),
                manifest_dir.join("..").join("debugger").join("build").join("adapter").join(format!("codelldb{}", exe_suffix)),
                manifest_dir.join("..").join("debugger").join("bin").join(format!("pomai-debugger{}", exe_suffix)),
                manifest_dir.join("..").join("debugger").join("bin").join(format!("codelldb{}", exe_suffix)),
                manifest_dir.join("core").join("debugger").join("bin").join(format!("pomai-debugger{}", exe_suffix)),
            ],
        },
        // ── Engine 2: pomai-linter ──
        SidecarSpec {
            canonical_name: "pomai-linter",
            candidate_paths: vec![
                manifest_dir.join("..").join("linter").join("bin").join(format!("pomai-linter{}", exe_suffix)),
                manifest_dir.join("..").join("linter").join("_build").join("default").join("src").join("main").join("Main.exe"),
                manifest_dir.join("..").join("semgrep-develop").join("bin").join(format!("semgrep-core{}", exe_suffix)),
                manifest_dir.join("core").join("linter").join("bin").join(format!("pomai-linter{}", exe_suffix)),
            ],
        },
    ];

    // 4. Idempotently copy or stage sidecar binaries with target triple
    for spec in &engines {
        let sidecar_filename = format!("{}-{}{}", spec.canonical_name, target_triple, exe_suffix);
        let dest_path = binaries_dir.join(&sidecar_filename);

        let mut copied = false;
        for source in &spec.candidate_paths {
            if source.exists() && source.is_file() {
                println!("cargo:rerun-if-changed={}", source.display());

                let should_copy = match (fs::metadata(source), fs::metadata(&dest_path)) {
                    (Ok(src_meta), Ok(dst_meta)) => {
                        src_meta.len() != dst_meta.len()
                            || src_meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH)
                                > dst_meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH)
                    }
                    _ => true,
                };

                if should_copy {
                    match fs::copy(source, &dest_path) {
                        Ok(_) => {
                            println!(
                                "cargo:warning=[Pomai Build] Bundled {} from {}",
                                spec.canonical_name,
                                source.display()
                            );
                            copied = true;
                            break;
                        }
                        Err(e) => {
                            println!(
                                "cargo:warning=[Pomai Build] Failed to copy {}: {}",
                                source.display(),
                                e
                            );
                        }
                    }
                } else {
                    copied = true;
                    break;
                }
            }
        }

        // Developer Stub fallback: Ensures cargo build / tauri bundle succeeds in 1 pass
        if !copied && !dest_path.exists() {
            let stub_header: &[u8] = if is_windows {
                b"MZ\x90\x00Pomai-Studio-Engine-Stub\x00"
            } else {
                b"\x7fELF\x02\x01\x01\x00Pomai-Studio-Engine-Stub\x00"
            };

            let _ = fs::write(&dest_path, stub_header);
            println!(
                "cargo:warning=[Pomai Build] Created developer stub for {} at {}",
                spec.canonical_name,
                dest_path.display()
            );

            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Ok(meta) = fs::metadata(&dest_path) {
                    let mut perms = meta.permissions();
                    perms.set_mode(0o755);
                    let _ = fs::set_permissions(&dest_path, perms);
                }
            }
        }
    }

    println!("cargo:rerun-if-changed=binaries/");
    println!("cargo:rerun-if-env-changed=TARGET");
    println!("cargo:rustc-env=TARGET={}", target_triple);

    // 5. Run standard Tauri build hook
    tauri_build::build()
}
