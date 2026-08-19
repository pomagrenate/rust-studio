/**
 * hooks/useLsp.ts — React hook for the LSP / rust-analyzer lifecycle.
 *
 * Responsibilities:
 *   - Start/stop the LSP server when the workspace changes.
 *   - Listen for real-time diagnostic batches and maintain a per-file
 *     diagnostic map: { [uri]: LspDiagnostic[] }
 *   - Expose helpers to open/sync/close individual documents.
 *   - Expose hover, go-to-definition, and completion queries.
 *
 * Usage:
 *   const { diagnosticsMap, lspStatus, openDoc, syncDoc, closeDoc } = useLsp(workspaceRoot);
 */

import { useEffect, useRef, useCallback, useState } from "react";
import {
  type DiagnosticBatch,
  type LspDiagnostic,
  type LspStatus,
  type LspCapabilities,
  type DocumentSyncPayload,
  type HoverResult,
  type CompletionItem,
  type ResolvedDefinition,
  type RustSrcStatus,
  lspStart,
  lspStop,
  lspOpenDocument,
  lspSyncDocument,
  lspCloseDocument,
  lspHover,
  lspGotoDefinition,
  lspGotoImplementation,
  lspCheckRustSrc,
  lspInstallRustSrc,
  lspCompletion,
  onLspDiagnostics,
  onLspStatus,
  pathToUri,
} from "../ipc/lsp";

// ── Public API ──────────────────────────────────────────────────────────────

export interface UseLspReturn {
  /** Per-file diagnostic map: absolute path → diagnostics */
  diagnosticsMap: Record<string, LspDiagnostic[]>;
  lspStatus: LspStatus;
  capabilities: LspCapabilities | null;

  // Document lifecycle
  openDoc:  (filePath: string, text: string, languageId?: string) => Promise<void>;
  syncDoc:  (filePath: string, version: number, fullText: string) => Promise<void>;
  closeDoc: (filePath: string) => Promise<void>;

  // Feature queries
  hover:            (filePath: string, line: number, col: number) => Promise<HoverResult | null>;
  gotoDefinition:  (filePath: string, line: number, col: number) => Promise<ResolvedDefinition | null>;
  gotoImplementation:(filePath: string, line: number, col: number) => Promise<ResolvedDefinition | null>;
  completion:       (filePath: string, line: number, col: number) => Promise<CompletionItem[]>;
  
  // Rust-src management
  checkRustSrc:   () => Promise<RustSrcStatus>;
  installRustSrc: () => Promise<string>;
}

// ── Document version registry ─────────────────────────────────────────────

const docVersions = new Map<string, number>();
let isLspStarting = false;
let currentWorkspaceRoot: string | null = null;

function nextVersion(uri: string): number {
  const v = (docVersions.get(uri) ?? 0) + 1;
  docVersions.set(uri, v);
  return v;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useLsp(workspaceRoot: string | null): UseLspReturn {
  const [diagnosticsMap, setDiagnosticsMap] = useState<Record<string, LspDiagnostic[]>>({});
  const [lspStatus, setLspStatus] = useState<LspStatus>({ kind: "stopped" });
  const [capabilities, setCapabilities] = useState<LspCapabilities | null>(null);

  const openDocsRef = useRef<Set<string>>(new Set());

  // ── Server lifecycle ────────────────────────────────────────────────────

  useEffect(() => {
    if (!workspaceRoot) return;
    
    // Prevent duplicate startups for the same workspace
    if (isLspStarting || currentWorkspaceRoot === workspaceRoot) {
      return;
    }

    isLspStarting = true;
    currentWorkspaceRoot = workspaceRoot;

    let unlistenDiag: (() => void) | null = null;
    let unlistenStatus: (() => void) | null = null;
    let active = true;

    const start = async () => {
      setLspStatus({ kind: "starting" });

      // Register event listeners BEFORE starting the server so no events
      // are missed during the initialization handshake.
      unlistenDiag = await onLspDiagnostics((batch: DiagnosticBatch) => {
        if (!active) return;
        // Map URI back to a filesystem path for component consumption
        const path = uriToPath(batch.uri);
        setDiagnosticsMap((prev) => ({
          ...prev,
          [path]:     batch.diagnostics,
          [batch.uri]: batch.diagnostics, // keep both for lookups
        }));
      });

      unlistenStatus = await onLspStatus((status: LspStatus) => {
        if (!active) return;
        setLspStatus(status);
      });

      try {
        const caps = await lspStart(workspaceRoot);
        if (active) {
          setCapabilities(caps);
          setLspStatus({ kind: "ready" });
        }
      } catch (err) {
        console.warn("[LSP] Failed to start rust-analyzer:", err);
        if (active) setLspStatus({ kind: "error", message: String(err) });
      } finally {
        isLspStarting = false;
      }
    };

    start();

    return () => {
      active = false;
      unlistenDiag?.();
      unlistenStatus?.();
      openDocsRef.current.clear();
      docVersions.clear();
      lspStop().catch(() => {});
      currentWorkspaceRoot = null;
    };
  }, [workspaceRoot]);

  // ── Document helpers ────────────────────────────────────────────────────

  const openDoc = useCallback(async (
    filePath: string,
    text: string,
    languageId = detectLanguageId(filePath)
  ) => {
    const uri = pathToUri(filePath);
    if (openDocsRef.current.has(uri)) {
      return; // already open
    }
    openDocsRef.current.add(uri);
    const version = nextVersion(uri);
    try {
      await lspOpenDocument(uri, languageId, version, text);
    } catch (err) {
      console.warn("[LSP] openDocument failed:", err);
      openDocsRef.current.delete(uri);
    }
  }, []);

  const syncDoc = useCallback(async (
    filePath: string,
    _version: number,
    fullText: string
  ) => {
    const uri = pathToUri(filePath);
    if (!openDocsRef.current.has(uri)) {
      // File not yet opened in LSP — open it first
      await openDoc(filePath, fullText);
      return;
    }
    const version = nextVersion(uri);
    const payload: DocumentSyncPayload = {
      uri,
      version,
      // Full-document sync on every edit (safest for correctness;
      // incremental can be added later once the buffer stays in sync)
      changes: [{ text: fullText }],
      full_text: fullText,
    };
    try {
      await lspSyncDocument(payload);
    } catch (err) {
      console.warn("[LSP] syncDocument failed:", err);
    }
  }, [openDoc]);

  const closeDoc = useCallback(async (filePath: string) => {
    const uri = pathToUri(filePath);
    openDocsRef.current.delete(uri);
    docVersions.delete(uri);
    try {
      await lspCloseDocument(uri);
    } catch (err) {
      console.warn("[LSP] closeDocument failed:", err);
    }
  }, []);

  // ── Feature queries ─────────────────────────────────────────────────────

  const hover = useCallback(
    (filePath: string, line: number, col: number) =>
      lspHover(pathToUri(filePath), line, col).catch(() => null),
    []
  );

  const gotoDefinition = useCallback(
    (filePath: string, line: number, col: number) =>
      lspGotoDefinition(pathToUri(filePath), line, col).catch(() => null),
    []
  );

  const completion = useCallback(
    (filePath: string, line: number, col: number) =>
      lspCompletion(pathToUri(filePath), line, col).catch(() => []),
    []
  );

  const gotoImplementation = useCallback(
    (filePath: string, line: number, col: number) =>
      lspGotoImplementation(pathToUri(filePath), line, col).catch(() => null),
    []
  );

  const checkRustSrc = useCallback(
    () => lspCheckRustSrc().catch(() => ({
      installed: false,
      sysroot: "",
      rust_src_path: "",
    })),
    []
  );

  const installRustSrc = useCallback(
    () => lspInstallRustSrc().catch(() => "Failed to install rust-src"),
    []
  );

  return {
    diagnosticsMap,
    lspStatus,
    capabilities,
    openDoc,
    syncDoc,
    closeDoc,
    hover,
    gotoDefinition,
    gotoImplementation,
    completion,
    checkRustSrc,
    installRustSrc,
  };
}

// ── Utilities ──────────────────────────────────────────────────────────────

function detectLanguageId(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "rs":   return "rust";
    case "ts":
    case "tsx":  return "typescript";
    case "js":
    case "jsx":  return "javascript";
    case "json": return "json";
    case "toml": return "toml";
    case "md":   return "markdown";
    default:     return "plaintext";
  }
}

/** URI → filesystem path (mirrors the Rust helper) */
function uriToPath(uri: string): string {
  return decodeURIComponent(
    uri.replace(/^file:\/\/\//, "").replace(/^file:\/\//, "")
  );
}
