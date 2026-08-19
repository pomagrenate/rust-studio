/**
 * useLspEngine.ts — React hook for managing the LSP/rust-analyzer engine.
 *
 * Provides:
 * - LSP lifecycle (start/stop)
 * - Document synchronization
 * - Real-time diagnostic streaming
 * - Feature operations (hover, goto definition, completion)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import * as LspIpc from "../ipc/lsp";

export interface LspDocumentState {
  uri: string;
  languageId: string;
  version: number;
  isOpen: boolean;
}

export interface LspEngineState {
  status: LspIpc.LspStatus;
  capabilities: LspIpc.LspCapabilities | null;
  documents: Map<string, LspDocumentState>;
  diagnostics: Map<string, LspIpc.LspDiagnostic[]>;
  isStarting: boolean;
  error: string | null;
}

export function useLspEngine(workspaceRoot: string | null) {
  const [state, setState] = useState<LspEngineState>({
    status: { kind: "stopped" },
    capabilities: null,
    documents: new Map(),
    diagnostics: new Map(),
    isStarting: false,
    error: null,
  });

  const unlistenDiagnosticsRef = useRef<(() => void) | null>(null);
  const unlistenStatusRef = useRef<(() => void) | null>(null);
  const debounceTimersRef = useRef<Map<string, number>>(new Map());

  // ── LSP Lifecycle ────────────────────────────────────────────────────────

  const startLsp = useCallback(async () => {
    if (!workspaceRoot) {
      setState(prev => ({ ...prev, error: "No workspace root provided" }));
      return;
    }

    setState(prev => ({ ...prev, isStarting: true, error: null }));

    try {
      const capabilities = await LspIpc.lspStart(workspaceRoot);
      setState(prev => ({
        ...prev,
        capabilities,
        isStarting: false,
        status: { kind: "ready" },
      }));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setState(prev => ({
        ...prev,
        isStarting: false,
        status: { kind: "error", message: errorMsg },
        error: errorMsg,
      }));
    }
  }, [workspaceRoot]);

  const stopLsp = useCallback(async () => {
    try {
      await LspIpc.lspStop();
      setState(prev => ({
        ...prev,
        status: { kind: "stopped" },
        capabilities: null,
        documents: new Map(),
        diagnostics: new Map(),
      }));
    } catch (err) {
      console.error("Failed to stop LSP:", err);
    }
  }, []);

  // ── Event Listeners ─────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;

    // Listen for diagnostic updates
    LspIpc.onLspDiagnostics((batch) => {
      if (!mounted) return;
      setState(prev => {
        const nextDiagnostics = new Map(prev.diagnostics);
        nextDiagnostics.set(batch.uri, batch.diagnostics);
        return { ...prev, diagnostics: nextDiagnostics };
      });
    }).then(unlisten => {
      if (mounted) unlistenDiagnosticsRef.current = unlisten;
    });

    // Listen for status changes
    LspIpc.onLspStatus((status) => {
      if (!mounted) return;
      setState(prev => ({ ...prev, status }));
    }).then(unlisten => {
      if (mounted) unlistenStatusRef.current = unlisten;
    });

    return () => {
      mounted = false;
      unlistenDiagnosticsRef.current?.();
      unlistenStatusRef.current?.();
    };
  }, []);

  // ── Document Management ──────────────────────────────────────────────────

  const openDocument = useCallback(async (
    uri: string,
    languageId: string,
    text: string
  ) => {
    const version = 1;
    
    try {
      await LspIpc.lspOpenDocument(uri, languageId, version, text);
      setState(prev => {
        const nextDocuments = new Map(prev.documents);
        nextDocuments.set(uri, {
          uri,
          languageId,
          version,
          isOpen: true,
        });
        return { ...prev, documents: nextDocuments };
      });
    } catch (err) {
      console.error("Failed to open LSP document:", err);
    }
  }, []);

  const syncDocument = useCallback((
    uri: string,
    changes: LspIpc.TextDocumentContentChangeEvent[],
    fullText?: string
  ) => {
    const docState = state.documents.get(uri);
    if (!docState) return;

    const newVersion = docState.version + 1;

    // Debounce sync to avoid overwhelming the LSP
    const existingTimer = debounceTimersRef.current.get(uri);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      try {
        const payload: LspIpc.DocumentSyncPayload = {
          uri,
          version: newVersion,
          changes,
          full_text: fullText,
        };
        await LspIpc.lspSyncDocument(payload);
        
        setState(prev => {
          const nextDocuments = new Map(prev.documents);
          const existing = nextDocuments.get(uri);
          if (existing) {
            nextDocuments.set(uri, { ...existing, version: newVersion });
          }
          return { ...prev, documents: nextDocuments };
        });
      } catch (err) {
        console.error("Failed to sync LSP document:", err);
      }
    }, 50); // 50ms debounce

    debounceTimersRef.current.set(uri, timer);
  }, [state.documents]);

  const closeDocument = useCallback(async (uri: string) => {
    try {
      await LspIpc.lspCloseDocument(uri);
      
      // Clear debounce timer
      const timer = debounceTimersRef.current.get(uri);
      if (timer) {
        clearTimeout(timer);
        debounceTimersRef.current.delete(uri);
      }

      setState(prev => {
        const nextDocuments = new Map(prev.documents);
        nextDocuments.delete(uri);
        const nextDiagnostics = new Map(prev.diagnostics);
        nextDiagnostics.delete(uri);
        return { 
          ...prev, 
          documents: nextDocuments,
          diagnostics: nextDiagnostics,
        };
      });
    } catch (err) {
      console.error("Failed to close LSP document:", err);
    }
  }, []);

  // ── LSP Features ────────────────────────────────────────────────────────

  const hover = useCallback(async (
    uri: string,
    line: number,
    character: number
  ): Promise<LspIpc.HoverResult | null> => {
    try {
      return await LspIpc.lspHover(uri, line, character);
    } catch (err) {
      console.error("LSP hover failed:", err);
      return null;
    }
  }, []);

  const gotoDefinition = useCallback(async (
    uri: string,
    line: number,
    character: number
  ): Promise<LspIpc.GotoDefinitionResult | null> => {
    try {
      return await LspIpc.lspGotoDefinition(uri, line, character);
    } catch (err) {
      console.error("LSP goto definition failed:", err);
      return null;
    }
  }, []);

  const completion = useCallback(async (
    uri: string,
    line: number,
    character: number
  ): Promise<LspIpc.CompletionItem[]> => {
    try {
      return await LspIpc.lspCompletion(uri, line, character);
    } catch (err) {
      console.error("LSP completion failed:", err);
      return [];
    }
  }, []);

  // ── Cleanup ─────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      // Clear all debounce timers on unmount
      debounceTimersRef.current.forEach(timer => clearTimeout(timer));
      debounceTimersRef.current.clear();
    };
  }, []);

  return {
    // State
    status: state.status,
    capabilities: state.capabilities,
    documents: state.documents,
    diagnostics: state.diagnostics,
    isStarting: state.isStarting,
    error: state.error,

    // Lifecycle
    startLsp,
    stopLsp,

    // Document management
    openDocument,
    syncDocument,
    closeDocument,

    // Features
    hover,
    gotoDefinition,
    completion,

    // Helpers
    getDiagnosticsForUri: (uri: string) => state.diagnostics.get(uri) || [],
    isDocumentOpen: (uri: string) => state.documents.get(uri)?.isOpen || false,
  };
}
