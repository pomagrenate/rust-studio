---
name: Bug Report
about: Report a reproducible problem in Pomai Studio
title: "[Bug] "
labels: ["bug", "triage"]
assignees: ""
---

# Bug Report

Thank you for taking the time to report a bug in **Pomai Studio**.

Pomai Studio is a Rust-focused IDE built around a native Rust development workflow.  
To help us investigate the issue efficiently, please provide as much technical detail as possible.

> **Before submitting:** Please search existing issues to make sure this bug has not already been reported.

---

## Summary

<!--
Provide a clear and concise description of the problem.

Example:
"Pomai Studio freezes when running `cargo check` on a workspace with more than 20 crates."
-->

### What happened?

<!-- Describe the actual behavior. -->

### What did you expect to happen?

<!-- Describe the behavior you expected. -->

### Why is this a problem?

<!--
Briefly explain the impact.

Examples:
- Blocks development
- Causes data loss
- Prevents project compilation
- Causes IDE crash
- Severely degrades performance
-->

---

## Reproduction

### Minimal reproduction

<!--
Please provide the smallest possible project or set of steps that reproduces the issue.

If possible, provide a public repository containing the reproduction.
-->

**Repository:**

```text
<!-- https://github.com/... -->
````

### Steps to reproduce

1. Open `...`
2. Navigate to `...`
3. Run `...`
4. Observe `...`

### Reproduction frequency

* [ ] Always
* [ ] Frequently
* [ ] Occasionally
* [ ] Rarely
* [ ] Unable to determine

---

## Environment

### Pomai Studio

**Version:**

```text
<!-- Example: 0.1.0 -->
```

**Build / Commit:**

```text
<!-- Example: 8f31c2a -->
```

**Installation method:**

* [ ] Official release
* [ ] GitHub release
* [ ] Built from source
* [ ] Development build
* [ ] Other:

### Operating System

* [ ] Windows
* [ ] macOS
* [ ] Linux

**OS Version:**

```text
<!-- Example: Windows 11 24H2 -->
```

### Hardware

**CPU:**

```text
<!-- Example: AMD Ryzen 7 5800X -->
```

**RAM:**

```text
<!-- Example: 32 GB -->
```

**GPU:**

```text
<!-- Example: NVIDIA RTX 4070 -->
```

### Rust Toolchain

**Rust version:**

```text
<!-- Run: rustc --version -->
```

**Cargo version:**

```text
<!-- Run: cargo --version -->
```

**Toolchain:**

```text
<!-- Run: rustup show -->
```

**Target:**

```text
<!-- Example: x86_64-pc-windows-msvc -->
```

### rust-analyzer

**Version:**

```text
<!-- Run: rust-analyzer --version -->
```

**Installation source:**

* [ ] Bundled with Pomai Studio
* [ ] System installation
* [ ] rustup
* [ ] Other

---

## Project Information

### Project type

* [ ] Binary application
* [ ] Library
* [ ] Workspace
* [ ] Tauri application
* [ ] CLI application
* [ ] Embedded project
* [ ] WebAssembly
* [ ] Other

### Cargo configuration

**Workspace structure:**

```text
<!--
Example:

my-project/
├── Cargo.toml
├── Cargo.lock
├── crates/
│   ├── core/
│   └── cli/
└── src/
    └── main.rs
-->
```

**Rust edition:**

```toml
# Example:
edition = "2024"
```

### Relevant dependencies

<!--
List only dependencies that may be related to the issue.

Example:
-->

```toml
[dependencies]
tokio = "1"
serde = "1"
tauri = "2"
```

---

# Component

Which part of Pomai Studio is affected?

* [ ] Editor
* [ ] Syntax highlighting
* [ ] Code completion
* [ ] rust-analyzer integration
* [ ] Cargo integration
* [ ] Rust Runtime
* [ ] Build system
* [ ] Run system
* [ ] Debugger
* [ ] Test runner
* [ ] Clippy integration
* [ ] Formatting / rustfmt
* [ ] Project management
* [ ] Workspace management
* [ ] Terminal
* [ ] Git integration
* [ ] File explorer
* [ ] Search
* [ ] Command palette
* [ ] Extensions
* [ ] Settings
* [ ] UI / Theme
* [ ] Performance
* [ ] Memory usage
* [ ] CPU usage
* [ ] Startup
* [ ] Shutdown
* [ ] Tauri integration
* [ ] Native OS integration
* [ ] Other

**Affected component:**

```text
<!-- e.g. Rust Runtime -->
```

---

# Rust Runtime

<!--
Complete this section if the issue is related to the Pomai Rust Runtime.
Otherwise leave it empty.
-->

### Runtime operation

* [ ] Project startup
* [ ] Build
* [ ] Run
* [ ] Test
* [ ] Debug
* [ ] Check
* [ ] Format
* [ ] Clippy
* [ ] Dependency resolution
* [ ] Process management
* [ ] Terminal integration
* [ ] Other

### Command executed

```bash
# Example:
cargo run
```

### Runtime output

```text
<!-- Paste the complete output here. -->
```

### Exit code

```text
<!-- Example: 101 -->
```

### Process behavior

* [ ] Process never starts
* [ ] Process starts and immediately exits
* [ ] Process hangs
* [ ] Process crashes
* [ ] Process cannot be terminated
* [ ] Process continues running after stopping
* [ ] Incorrect exit code
* [ ] Incorrect output
* [ ] Other

---

# rust-analyzer

<!--
Complete this section if the issue involves rust-analyzer.
-->

### Language server behavior

* [ ] Does not start
* [ ] Crashes
* [ ] High CPU usage
* [ ] High memory usage
* [ ] Slow response
* [ ] Incorrect diagnostics
* [ ] Missing diagnostics
* [ ] Incorrect code completion
* [ ] Missing code completion
* [ ] Incorrect go-to-definition
* [ ] Incorrect references
* [ ] Incorrect symbol information
* [ ] Incorrect type information
* [ ] Other

### rust-analyzer logs

```text
<!-- Paste relevant logs here. Remove sensitive information. -->
```

---

# Performance

<!--
Complete this section if the issue is related to performance.
-->

### Approximate project size

**Files:**

```text
<!-- Example: ~2,500 -->
```

**Rust source files:**

```text
<!-- Example: ~800 -->
```

**Workspace crates:**

```text
<!-- Example: 32 -->
```

### Observed resource usage

**CPU:**

```text
<!-- Example: 90-100% -->
```

**Memory:**

```text
<!-- Example: 8.2 GB -->
```

**Startup time:**

```text
<!-- Example: ~4.5 seconds -->
```

### Performance symptoms

* [ ] Slow startup
* [ ] Slow project indexing
* [ ] Slow code completion
* [ ] Slow diagnostics
* [ ] Slow build
* [ ] Slow file search
* [ ] UI freezes
* [ ] UI stutters
* [ ] High CPU usage
* [ ] High memory usage
* [ ] Memory leak suspected
* [ ] Unexpected background activity
* [ ] Other

---

# Logs

<!--
Please provide relevant logs.

IMPORTANT:
Remove passwords, API keys, access tokens, private URLs,
personal information, SSH keys, credentials, and other sensitive data.
-->

<details>
<summary>Pomai Studio Logs</summary>

```text
<!-- Paste logs here. -->
```

</details>

<details>
<summary>Rust / Cargo Output</summary>

```text
<!-- Paste logs here. -->
```

</details>

<details>
<summary>rust-analyzer Logs</summary>

```text
<!-- Paste logs here. -->
```

</details>

<details>
<summary>System Logs</summary>

```text
<!-- Paste logs here if relevant. -->
```

</details>

---

# Screenshots / Recordings

<!--
Screenshots and short screen recordings are highly appreciated for UI,
editor, rendering, and interaction-related bugs.
-->

Drag and drop screenshots or recordings below.

---

# Additional Context

### Does this work outside Pomai Studio?

* [ ] Yes
* [ ] No
* [ ] Not tested
* [ ] Not applicable

### Does the same project work in another IDE?

* [ ] Yes
* [ ] No
* [ ] Not tested
* [ ] Not applicable

**Other IDE / environment tested:**

```text
<!-- Example: VS Code + rust-analyzer -->
```

### Regression

Did this work correctly in a previous version of Pomai Studio?

* [ ] Yes
* [ ] No
* [ ] First time using Pomai Studio
* [ ] Unknown

**Last known working version:**

```text
<!-- Example: 0.0.8 -->
```

### Workaround

<!--
If you found a temporary workaround, describe it here.
-->

```text
<!-- Example:
Restarting Pomai Studio temporarily restores rust-analyzer.
-->
```

---

# Expected Impact

How severely does this issue affect your workflow?

* [ ] 🔴 Critical — Pomai Studio cannot be used
* [ ] 🟠 High — Major functionality is broken
* [ ] 🟡 Medium — Significant inconvenience
* [ ] 🔵 Low — Minor issue
* [ ] ⚪ Cosmetic — Visual or wording issue

---

# Additional Notes

<!--
Anything else that may help us understand or reproduce the issue.
-->

---

## Checklist

Before submitting this issue, please confirm:

* [ ] I searched existing issues.
* [ ] I am using a supported version of Pomai Studio.
* [ ] I included the Pomai Studio version.
* [ ] I included my operating system and version.
* [ ] I included my Rust toolchain information.
* [ ] I included rust-analyzer information if relevant.
* [ ] I provided reproducible steps.
* [ ] I included relevant logs.
* [ ] I removed passwords, tokens, API keys, and other sensitive information.
* [ ] I have provided screenshots or recordings where useful.
* [ ] I have tested whether the issue is reproducible.

---

## Maintainer Notes

<!--
Do not modify this section.

Maintainers can use this area for internal triage.
-->

**Triage status:**

* [ ] Needs reproduction
* [ ] Confirmed
* [ ] Cannot reproduce
* [ ] Needs more information
* [ ] Regression
* [ ] Duplicate
* [ ] Fixed
* [ ] Won't fix

**Priority:**

* [ ] P0 — Critical
* [ ] P1 — High
* [ ] P2 — Medium
* [ ] P3 — Low

**Affected component:**

```text
```

**Root cause:**

```text
```

**Fix PR:**

```text
```

**Target release:**

```text
```