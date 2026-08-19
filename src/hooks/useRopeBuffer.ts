/**
 * useRopeBuffer.ts — Hook for interacting with the rope buffer backend.
 *
 * This hook provides a frontend interface to the Rust rope buffer,
 * allowing efficient line range fetching without maintaining the full
 * document in memory as a string array.
 */

import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface RopeBufferState {
  lines: string[];
  lineCount: number;
  isLoading: boolean;
  error: string | null;
}

export function useRopeBuffer(filePath: string | undefined) {
  const [state, setState] = useState<RopeBufferState>({
    lines: [],
    lineCount: 0,
    isLoading: false,
    error: null,
  });

  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });

  /**
   * Fetch the total line count from the rope buffer.
   */
  const fetchLineCount = useCallback(async () => {
    if (!filePath) return;

    try {
      const count = await invoke<number>("get_line_count", { path: filePath });
      setState((prev) => ({ ...prev, lineCount: count, error: null }));
      return count;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      setState((prev) => ({ ...prev, error }));
      return 0;
    }
  }, [filePath]);

  /**
   * Fetch a range of lines from the rope buffer.
   */
  const fetchLineRange = useCallback(
    async (startLine: number, endLine: number) => {
      if (!filePath) return [];

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const lines = await invoke<string[]>("get_line_range", {
          path: filePath,
          startLine,
          endLine,
        });
        setState((prev) => ({ ...prev, lines, isLoading: false, error: null }));
        return lines;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        setState((prev) => ({ ...prev, error, isLoading: false }));
        return [];
      }
    },
    [filePath]
  );

  /**
   * Update the visible range and fetch the corresponding lines.
   */
  const updateVisibleRange = useCallback(
    (startLine: number, endLine: number) => {
      setVisibleRange({ start: startLine, end: endLine });
      fetchLineRange(startLine, endLine);
    },
    [fetchLineRange]
  );

  /**
   * Apply an edit to the rope buffer.
   */
  const applyEdit = useCallback(
    async (edit: { range: { start: { line: number; column: number }; end: { line: number; column: number } }; newText: string }) => {
      if (!filePath) return;

      try {
        await invoke("apply_edit", {
          path: filePath,
          edit,
        });
        // Refresh line count after edit
        await fetchLineCount();
        // Refresh visible lines
        await fetchLineRange(visibleRange.start, visibleRange.end);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        setState((prev) => ({ ...prev, error }));
      }
    },
    [filePath, fetchLineCount, fetchLineRange, visibleRange]
  );

  /**
   * Reload the entire buffer from disk (useful after external modifications like Clippy fixes).
   */
  const reloadBuffer = useCallback(async () => {
    if (!filePath) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Refresh line count
      const count = await fetchLineCount();
      // Refresh visible lines
      await fetchLineRange(visibleRange.start, visibleRange.end);
      setState((prev) => ({ ...prev, isLoading: false, error: null }));
      return count;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      setState((prev) => ({ ...prev, error, isLoading: false }));
      return 0;
    }
  }, [filePath, fetchLineCount, fetchLineRange, visibleRange]);

  // Initial load of line count
  useEffect(() => {
    fetchLineCount();
  }, [fetchLineCount]);

  return {
    ...state,
    fetchLineRange,
    updateVisibleRange,
    applyEdit,
    reloadBuffer,
    refreshLineCount: fetchLineCount,
  };
}

export default useRopeBuffer;
