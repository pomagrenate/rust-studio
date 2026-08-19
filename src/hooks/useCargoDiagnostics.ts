/**
 * hooks/useCargoDiagnostics.ts — React hook for Cargo build & diagnostic streaming
 * 
 * Features:
 * - Real-time diagnostic event consumption
 * - Diagnostic batching to prevent UI thrashing
 * - Monaco editor marker registration
 * - Problem list management
 * - Build status tracking
 */

import { useEffect, useRef, useCallback, useState } from "react";
import {
  type CargoDiagnostic,
  cargoCheckStreaming,
  cargoClippyStreaming,
  cargoBuildStreaming,
  cargoCancelBuild,
  onCargoDiagnostic,
  onCargoProgress,
  onCargoFinished,
} from "../ipc/cargo";

// ── Public API ──────────────────────────────────────────────────────────────

export interface UseCargoDiagnosticsReturn {
  /** Per-file diagnostic map: absolute path → diagnostics */
  diagnosticsMap: Record<string, CargoDiagnostic[]>;
  /** Total error count */
  totalErrors: number;
  /** Total warning count */
  totalWarnings: number;
  /** Currently active cargo command */
  activeCommand: string | null;
  /** Build progress message */
  buildProgress: string | null;
  /** Whether a build is currently running */
  isBuilding: boolean;
  
  // Actions
  runCheck: (projectPath: string) => Promise<void>;
  runClippy: (projectPath: string) => Promise<void>;
  runBuild: (projectPath: string) => Promise<void>;
  cancelBuild: () => Promise<void>;
  clearDiagnostics: () => void;
  
  // Navigation
  navigateToDiagnostic: (diagnostic: CargoDiagnostic) => void;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useCargoDiagnostics(
  onNavigate: (filePath: string, line: number, col: number) => void
): UseCargoDiagnosticsReturn {
  const [diagnosticsMap, setDiagnosticsMap] = useState<Record<string, CargoDiagnostic[]>>({});
  const [activeCommand, setActiveCommand] = useState<string | null>(null);
  const [buildProgress, setBuildProgress] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  
  // Diagnostic batching to prevent UI thrashing
  const batchTimeoutRef = useRef<number | null>(null);
  const pendingDiagnosticsRef = useRef<Record<string, CargoDiagnostic[]>>({});
  
  // Event listener refs for cleanup
  const unlistenDiagnosticsRef = useRef<(() => void) | null>(null);
  const unlistenProgressRef = useRef<(() => void) | null>(null);
  const unlistenFinishedRef = useRef<(() => void) | null>(null);
  
  // Flush pending diagnostics to state
  const flushDiagnostics = useCallback(() => {
    if (Object.keys(pendingDiagnosticsRef.current).length > 0) {
      setDiagnosticsMap(prev => {
        const updated = { ...prev };
        for (const [filePath, diagnostics] of Object.entries(pendingDiagnosticsRef.current)) {
          updated[filePath] = diagnostics;
        }
        return updated;
      });
      pendingDiagnosticsRef.current = {};
    }
    if (batchTimeoutRef.current !== null) {
      clearTimeout(batchTimeoutRef.current);
      batchTimeoutRef.current = null;
    }
  }, []);
  
  // Add diagnostic to pending batch
  const addDiagnostic = useCallback((diagnostic: CargoDiagnostic) => {
    const filePath = diagnostic.file_path;
    if (!pendingDiagnosticsRef.current[filePath]) {
      pendingDiagnosticsRef.current[filePath] = [];
    }
    pendingDiagnosticsRef.current[filePath].push(diagnostic);
    
    // Schedule batch flush (debounce to 100ms)
    if (batchTimeoutRef.current === null) {
      batchTimeoutRef.current = window.setTimeout(() => {
        flushDiagnostics();
      }, 100);
    }
  }, [flushDiagnostics]);
  
  // Set up event listeners
  useEffect(() => {
    let mounted = true;
    
    const setupListeners = async () => {
      // Diagnostic events
      unlistenDiagnosticsRef.current = await onCargoDiagnostic((diagnostic) => {
        if (!mounted) return;
        addDiagnostic(diagnostic);
      });
      
      // Progress events
      unlistenProgressRef.current = await onCargoProgress((message) => {
        if (!mounted) return;
        setBuildProgress(message);
      });
      
      // Finished events
      unlistenFinishedRef.current = await onCargoFinished((success) => {
        if (!mounted) return;
        setIsBuilding(false);
        setBuildProgress(success ? "Build completed successfully" : "Build failed");
        setActiveCommand(null);
        
        // Flush any remaining diagnostics
        flushDiagnostics();
      });
    };
    
    setupListeners();
    
    return () => {
      mounted = false;
      unlistenDiagnosticsRef.current?.();
      unlistenProgressRef.current?.();
      unlistenFinishedRef.current?.();
      if (batchTimeoutRef.current !== null) {
        clearTimeout(batchTimeoutRef.current);
      }
    };
  }, [addDiagnostic, flushDiagnostics]);
  
  // Calculate totals
  const totalErrors = Object.values(diagnosticsMap).reduce(
    (sum, diagnostics) => sum + diagnostics.filter(d => d.severity === "error").length,
    0
  );
  
  const totalWarnings = Object.values(diagnosticsMap).reduce(
    (sum, diagnostics) => sum + diagnostics.filter(d => d.severity === "warning").length,
    0
  );
  
  // Run cargo check
  const runCheck = useCallback(async (projectPath: string) => {
    await cargoCancelBuild(); // Cancel any existing build
    setIsBuilding(true);
    setActiveCommand("check");
    setBuildProgress("Running cargo check...");
    setDiagnosticsMap({});
    pendingDiagnosticsRef.current = {};
    
    try {
      await cargoCheckStreaming(projectPath);
    } catch (error) {
      console.error("Cargo check failed:", error);
      setIsBuilding(false);
      setBuildProgress("Cargo check failed");
    }
  }, []);
  
  // Run cargo clippy
  const runClippy = useCallback(async (projectPath: string) => {
    await cargoCancelBuild(); // Cancel any existing build
    setIsBuilding(true);
    setActiveCommand("clippy");
    setBuildProgress("Running cargo clippy...");
    setDiagnosticsMap({});
    pendingDiagnosticsRef.current = {};
    
    try {
      await cargoClippyStreaming(projectPath);
    } catch (error) {
      console.error("Cargo clippy failed:", error);
      setIsBuilding(false);
      setBuildProgress("Cargo clippy failed");
    }
  }, []);
  
  // Run cargo build
  const runBuild = useCallback(async (projectPath: string) => {
    await cargoCancelBuild(); // Cancel any existing build
    setIsBuilding(true);
    setActiveCommand("build");
    setBuildProgress("Running cargo build...");
    setDiagnosticsMap({});
    pendingDiagnosticsRef.current = {};
    
    try {
      await cargoBuildStreaming(projectPath);
    } catch (error) {
      console.error("Cargo build failed:", error);
      setIsBuilding(false);
      setBuildProgress("Cargo build failed");
    }
  }, []);
  
  // Cancel active build
  const cancelBuild = useCallback(async () => {
    try {
      await cargoCancelBuild();
      setIsBuilding(false);
      setActiveCommand(null);
      setBuildProgress("Build cancelled");
      flushDiagnostics();
    } catch (error) {
      console.error("Failed to cancel build:", error);
    }
  }, [flushDiagnostics]);
  
  // Clear all diagnostics
  const clearDiagnostics = useCallback(() => {
    setDiagnosticsMap({});
    pendingDiagnosticsRef.current = {};
    setBuildProgress(null);
  }, []);
  
  // Navigate to diagnostic location
  const navigateToDiagnostic = useCallback((diagnostic: CargoDiagnostic) => {
    onNavigate(
      diagnostic.file_path,
      diagnostic.range.start_line,
      diagnostic.range.start_character
    );
  }, [onNavigate]);
  
  return {
    diagnosticsMap,
    totalErrors,
    totalWarnings,
    activeCommand,
    buildProgress,
    isBuilding,
    runCheck,
    runClippy,
    runBuild,
    cancelBuild,
    clearDiagnostics,
    navigateToDiagnostic,
  };
}
