/**
 * wizard/templates.ts
 * Real-world scaffolding templates with exact CLI commands for Rust stacks.
 */

import { ProjectTemplate } from "./types";

export const RUST_PROJECT_TEMPLATES: ProjectTemplate[] = [
  // ── Basic ──
  {
    id: "cargo-cli",
    name: "CLI Application (Clap + Anyhow)",
    category: "Basic",
    description: "Modern command-line tool with Clap derive parser, Anyhow error handling, and Tokio async runtime.",
    badge: "Recommended",
    tags: ["CLI", "clap", "anyhow", "tokio"],
    defaultName: "my_rust_cli",
    setupCommands: [
      "cargo new {name} --bin",
      "cargo add clap --features derive",
      "cargo add anyhow",
      "cargo add tokio --features full",
      "cargo add tracing tracing-subscriber"
    ],
    features: [
      "Type-safe argument parsing with clap derive",
      "Ergonomic error handling via anyhow",
      "Async runtime ready for high performance I/O",
      "Structured terminal logging with tracing"
    ]
  },
  {
    id: "cargo-lib",
    name: "Reusable Library Crate",
    category: "Basic",
    description: "Standard Rust library crate package configured with thiserror for domain error enums.",
    tags: ["Library", "thiserror", "crates.io"],
    defaultName: "my_rust_lib",
    setupCommands: [
      "cargo new {name} --lib",
      "cargo add thiserror",
      "cargo add serde --features derive"
    ],
    features: [
      "Idiomatic library structure with src/lib.rs",
      "Strong domain errors with thiserror",
      "Serde serializable models"
    ]
  },

  // ── Web Backend ──
  {
    id: "axum-server",
    name: "Axum REST API Server",
    category: "Web Backend",
    description: "Ergonomic, modular web server built on Axum, Tokio, Tower-HTTP, and Serde JSON.",
    badge: "Popular",
    tags: ["Axum", "Tokio", "REST API", "JSON", "Tower"],
    defaultName: "axum_web_service",
    setupCommands: [
      "cargo new {name} --bin",
      "cargo add axum",
      "cargo add tokio --features full",
      "cargo add serde --features derive",
      "cargo add serde_json",
      "cargo add tower-http --features cors,trace,fs",
      "cargo add tracing tracing-subscriber"
    ],
    features: [
      "High-throughput non-blocking async routing with Axum",
      "CORS and Request Tracing middleware via Tower-HTTP",
      "JSON Request/Response payloads with Serde",
      "Production-ready structured logging"
    ]
  },
  {
    id: "actix-web",
    name: "Actix-Web Microservice",
    category: "Web Backend",
    description: "Blazing fast microservice framework with Actix-Web, CORS, and Serde.",
    tags: ["Actix", "Microservice", "High-Performance"],
    defaultName: "actix_microservice",
    setupCommands: [
      "cargo new {name} --bin",
      "cargo add actix-web",
      "cargo add actix-cors",
      "cargo add serde --features derive",
      "cargo add serde_json",
      "cargo add env_logger"
    ],
    features: [
      "Battle-tested actor-based web engine",
      "Built-in HTTP/2 and WebSocket capabilities",
      "Fast response serialization"
    ]
  },

  // ── Desktop ──
  {
    id: "tauri-desktop",
    name: "Tauri v2 Desktop App",
    category: "Desktop",
    description: "Cross-platform lightweight desktop application powered by Rust backend and web frontend.",
    badge: "Modern",
    tags: ["Tauri v2", "Desktop", "GUI", "Cross-Platform"],
    defaultName: "my_tauri_app",
    setupCommands: [
      "cargo new {name} --bin",
      "cargo add tauri@2",
      "cargo add serde --features derive",
      "cargo add serde_json",
      "cargo add tauri-plugin-opener@2"
    ],
    features: [
      "Tiny binary size with zero Electron bloat",
      "Native OS windowing & IPC communication",
      "Safe and sandboxed architecture"
    ]
  },

  // ── Wasm / Frontend ──
  {
    id: "leptos-wasm",
    name: "Leptos Reactive Wasm UI",
    category: "Wasm/Frontend",
    description: "Full-stack and client-side reactive web application written entirely in Rust compiled to WebAssembly.",
    badge: "Reactive",
    tags: ["Leptos", "WASM", "Frontend", "Signals"],
    defaultName: "leptos_wasm_app",
    setupCommands: [
      "cargo new {name} --bin",
      "cargo add leptos --features csr",
      "cargo add console_error_panic_hook",
      "cargo add console_log",
      "cargo add web-sys --features HtmlElement,Window"
    ],
    features: [
      "Fine-grained reactive signals without virtual DOM overhead",
      "Declarative JSX-like view! macro in pure Rust",
      "Runs at near-native speed inside the browser"
    ]
  },
  {
    id: "dioxus-app",
    name: "Dioxus Cross-Platform App",
    category: "Wasm/Frontend",
    description: "React-like GUI framework for Rust that targets Desktop, Web, Mobile, and SSR.",
    tags: ["Dioxus", "GUI", "Multi-Platform"],
    defaultName: "dioxus_app",
    setupCommands: [
      "cargo new {name} --bin",
      "cargo add dioxus --features desktop",
      "cargo add dioxus-logger"
    ],
    features: [
      "React-style component architecture and hooks",
      "Single codebase for Desktop and Web",
      "Built-in hot reloading"
    ]
  },
  // -- Python Projects -- 
  {
    id: "fastapi-uv",
    name: "FastAPI Web Service (uv)",
    category: "Web Backend",
    description: "High-performance Python async REST API powered by FastAPI and the blazing-fast uv package manager.",
    badge: "Python",
    tags: ["FastAPI", "Python", "uv", "Async", "REST API"],
    defaultName: "my_fastapi_app",
    setupCommands: [
      "uv init --app {name}",
      "uv add \"fastapi[standard]\"",
      "uv add pydantic-settings"
    ],
    features: [
      "Instant virtual environment & dependency locking via uv",
      "Auto-generated OpenAPI (Swagger) documentation",
      "Type validation with Pydantic v2",
      "Production-ready ASGI server integration (Uvicorn)"
    ]
  },
];
