import { useState, useCallback } from "react";
import { lspCodeAction, type CodeAction } from "../ipc/lsp";

export interface UseCodeActionsReturn {
  actions: CodeAction[];
  loading: boolean;
  error: string | null;
  fetchCodeActions: (uri: string, line: number, character: number) => Promise<void>;
  clearActions: () => void;
}

export function useCodeActions(): UseCodeActionsReturn {
  const [actions, setActions] = useState<CodeAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCodeActions = useCallback(async (
    uri: string,
    line: number,
    character: number
  ) => {
    setLoading(true);
    setError(null);
    
    try {
      const fetchedActions = await lspCodeAction(uri, line, character);
      setActions(fetchedActions);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setActions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearActions = useCallback(() => {
    setActions([]);
    setError(null);
  }, []);

  return {
    actions,
    loading,
    error,
    fetchCodeActions,
    clearActions,
  };
}
