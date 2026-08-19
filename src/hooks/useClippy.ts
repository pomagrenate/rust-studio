import { useState, useCallback, useEffect } from "react";
import {
  runClippyDiagnostics,
  applyClippyFix,
  applySingleClippyFix,
  onClippyProgress,
  type ClippyDiagnostic,
  type ClippyFixResult,
  type ClippyProgress,
  type ClippySuggestion,
} from "../ipc/clippy";

export interface UseClippyReturn {
  diagnostics: ClippyDiagnostic[];
  loading: boolean;
  error: string | null;
  progress: ClippyProgress | null;
  fixResult: ClippyFixResult | null;
  runDiagnostics: (workspacePath: string) => Promise<void>;
  applyWorkspaceFix: (workspacePath: string, allowDirty?: boolean, onFilesModified?: (files: string[]) => void) => Promise<void>;
  applySingleFix: (filePath: string, suggestion: ClippySuggestion, onFileModified?: (file: string) => void) => Promise<void>;
  clearDiagnostics: () => void;
}

export function useClippy(): UseClippyReturn {
  const [diagnostics, setDiagnostics] = useState<ClippyDiagnostic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ClippyProgress | null>(null);
  const [fixResult, setFixResult] = useState<ClippyFixResult | null>(null);

  // Listen for clippy progress events
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      unlisten = await onClippyProgress((progressEvent) => {
        setProgress(progressEvent);
      });
    };

    setupListener();

    return () => {
      unlisten?.();
    };
  }, []);

  const runDiagnostics = useCallback(async (workspacePath: string) => {
    setLoading(true);
    setError(null);
    setProgress(null);
    
    try {
      const results = await runClippyDiagnostics(workspacePath);
      setDiagnostics(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDiagnostics([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const applyWorkspaceFix = useCallback(async (
    workspacePath: string,
    allowDirty = true,
    onFilesModified?: (files: string[]) => void
  ) => {
    setLoading(true);
    setError(null);
    setProgress({ message: "Starting clippy --fix...", files_processed: 0, total_files: null });
    
    try {
      const result = await applyClippyFix(workspacePath, allowDirty);
      setFixResult(result);
      setProgress({
        message: `Applied ${result.fixes_applied} fixes across ${result.files_modified.length} files`,
        files_processed: result.files_modified.length,
        total_files: result.files_modified.length,
      });
      
      // Notify caller about modified files for buffer reload
      if (onFilesModified && result.files_modified.length > 0) {
        onFilesModified(result.files_modified);
      }
      
      // Re-run diagnostics to see remaining issues
      await runDiagnostics(workspacePath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [runDiagnostics]);

  const applySingleFix = useCallback(async (
    filePath: string,
    suggestion: ClippySuggestion,
    onFileModified?: (file: string) => void
  ) => {
    setLoading(true);
    setError(null);
    
    try {
      await applySingleClippyFix(filePath, suggestion);
      
      // Notify caller about modified file for buffer reload
      if (onFileModified) {
        onFileModified(filePath);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const clearDiagnostics = useCallback(() => {
    setDiagnostics([]);
    setError(null);
    setProgress(null);
    setFixResult(null);
  }, []);

  return {
    diagnostics,
    loading,
    error,
    progress,
    fixResult,
    runDiagnostics,
    applyWorkspaceFix,
    applySingleFix,
    clearDiagnostics,
  };
}
