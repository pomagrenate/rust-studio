<div align="center">

# 🦀 Rust Studio

<img src="./src-tauri/icons/Square150x150Logo.png" alt="Rust Studio Logo" width="120" />

### The Blazing-Fast, Zero-AI & Hackable IDE for Rust

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Rust](https://img.shields.io/badge/Rust-1.75+-orange.svg?style=flat-square&logo=rust)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-v2.0-24C8D8.svg?style=flat-square&logo=tauri)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-18+-61dafb.svg?style=flat-square&logo=react)](https://reactjs.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg?style=flat-square)]()

<p align="center">
  <b>A lightweight, high-performance desktop IDE tailored exclusively for Rust developers.</b><br/>
  Zero-bloat architecture powered by native Rust backend, <code>rust-analyzer</code>, Tree-sitter AST, and Tauri.
</p>

[Quick Start](#-quick-start) •
[Core Features](#-key-features) •
[Zero-AI Philosophy](#-the-zero-ai--deterministic-philosophy) •
[Architecture](#-architecture) •
[Contributing](#-contributing)

---

![Rust Studio Screenshot](src-tauri/icons/land.jfif)

</div>

## ⚡ Why Rust Studio?

Traditional modern IDEs often consume gigabytes of memory and introduce unpredictable AI hallucinations[cite: 4]. **Rust Studio** is built from the ground up to solve this[cite: 4]:

* **🚀 Instant Startup & Low Memory:** Native Rust backend combined with lightweight WebView rendering[cite: 4]. Sub-100ms startup times without the multi-gigabyte RAM overhead of standard Electron editors[cite: 4].
* **🎯 100% Deterministic & Compile-Guaranteed:** No costly LLM tokens or hallucinated code[cite: 4]. Sits directly on top of `rustc`, `rust-analyzer`, and `clippy` for instantaneous, error-free diagnostics and AST quick-fixes[cite: 4].
* **🔓 Deeply Hackable:** Atom-like UI customizability with the speed and compiler-awareness of dedicated Rust tooling[cite: 4].

---

## ✨ Key Features

### 🔍 Native LSP & AST Engine
- **Full Language Server Protocol (LSP):** Deep integration with `rust-analyzer` for real-time type inference, inlay hints, and go-to-definition[cite: 4].
- **AST-Driven Quick-Fixes:** Auto-fill match arms, implement missing trait stubs, and extract functions via concrete syntax trees[cite: 4].
- **Tree-sitter Structural Rewrite:** Syntax-aware search and replace that ignores strings and comments[cite: 4].

### 📦 Seamless Cargo & Clippy Integration
- **Workspace Diagnostics:** Integrated `cargo check` and `cargo clippy --message-format=json` pipeline[cite: 4].
- **One-Click Clippy Fix:** Run automated, machine-applicable lint repairs across your workspace with zero syntax drift[cite: 4].

### 🔀 Built-in Git & Merge Conflict Resolver
- Visual staging, commit tracking, diff preview, and specialized 3-way merge conflict resolution[cite: 4].
- Secure GitHub integration utilizing native OS Credential Stores (Windows Credential Manager / macOS Keychain / Linux Secret Service)[cite: 4].

### 🎨 Customizable & Responsive Workspace
- **Dynamic Themes:** Clean Light & Dark industrial themes with CSS Custom Property tokens[cite: 4].
- **Font & Layout Scaling:** Native ligatures, custom font stacks (`JetBrains Mono`, `Fira Code`), and fluid side-panel drawers[cite: 4].
- **Integrated Media Viewers:** Built-in viewer support for Markdown preview, SVG, PDF, CSV, and images[cite: 4].

---

## 🛡️ The Zero-AI & Deterministic Philosophy

Rust Studio intentionally focuses on **deterministic code intelligence** over statistical language models[cite: 4]:

| Metric | Rust Studio (AST / LSP / Compiler) | Cloud AI Coding Extensions |
| :--- | :--- | :--- |
| **Response Latency** | **Instantaneous (0ms – 10ms)**[cite: 4] | 500ms – 3000ms per token[cite: 4] |
| **Hardware Overhead** | **Ultra-low RAM footprint**[cite: 4] | 1GB – 4GB+ RAM / Local GPU VRAM[cite: 4] |
| **Code Reliability** | **100% Syntax & Lifetime Correct**[cite: 4] | Risk of type/lifetime hallucinations[cite: 4] |
| **Privacy & Security**| **100% Offline & Local-First**[cite: 4] | Code sent to remote third-party servers[cite: 4] |
| **Operating Cost** | **Free forever (0 USD)**[cite: 4] | Monthly recurring subscriptions / API bills[cite: 4] |

---

## 🚀 Quick Start

### Prerequisites

Ensure you have the following installed[cite: 4]:
* [Rust Toolchain](https://rustup.rs/) (1.75 or later)[cite: 4]
* [Node.js](https://nodejs.org/) (v18+)[cite: 4]
* [pnpm](https://pnpm.io/) (Recommended) or npm/yarn[cite: 4]

### Build & Run from Source

```bash
# 1. Fork repository
git clone [https://github.com/pomagrenate/rust-studio.git](https://github.com/pomagrenate/rust-studio.git)
cd rust-studio

# 2. Install frontend dependencies
npm install

# 3. Launch in development mode
npm run tauri dev

# 4. Build standalone production binary
npm run tauri build
```

---

## 🏗️ Architecture

```text
┌────────────────────────────────────────────────────────┐
│                   React + TypeScript UI                │
│  (Rope Buffer, Virtualized Gutter, Settings, Diff UI)  │
└───────────────────────────▲────────────────────────────┘
                            │ Tauri IPC (JSON-RPC)
┌───────────────────────────▼────────────────────────────┐
│                    Rust Native Core                    │
│ ┌──────────────────┬─────────────────┬───────────────┐ │
│ │  rust-analyzer   │  Cargo Engine   │ Tree-sitter   │ │
│ │  (LSP Server)    │  (Clippy/Check) │ (AST Matches) │ │
│ └──────────────────┴─────────────────┴───────────────┘ │
└────────────────────────────────────────────────────────┘

```

---

## ⌨️ Useful Default Shortcuts

| Action | Shortcut |
| --- | --- |
| **Quick-Fix / Code Action** | Alt + Enter / Ctrl + . |
| **Surround With Block** | Ctrl + Alt + T |
| **Command Palette** | Ctrl + Shift + P |
| **Format Document** | Shift + Alt + F |
| **Quick File Open** | Ctrl + P |

---

## 🤝 Contributing

Contributions are warmly welcomed! Please read our [CONTRIBUTE.md](CONTRIBUTE.md) for architectural guidelines, coding standards, and PR workflows.

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](https://www.google.com/search?q=LICENSE) for more details.