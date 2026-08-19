/**
 * DefinitionProvider.tsx — Handles Go to Definition functionality
 * 
 * Provides:
 * - Ctrl+Click navigation to definitions
 * - F12 keyboard shortcut
 * - Virtual file handling for stdlib/external crates
 * - Rust-src installation prompt when needed
 */

import { useEffect, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ResolvedDefinition, RustSrcStatus } from "../../ipc/lsp";

export interface DefinitionProviderOptions {
  workspaceRoot: string | null;
  onNavigate: (path: string, line: number, col: number, isVirtual: boolean, content?: string) => void;
}

export function useDefinitionProvider(options: DefinitionProviderOptions) {
  const { workspaceRoot, onNavigate } = options;
  const [rustSrcStatus, setRustSrcStatus] = useState<RustSrcStatus | null>(null);
  const [showRustSrcPrompt, setShowRustSrcPrompt] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  // Check rust-src status when workspace changes
  useEffect(() => {
    if (!workspaceRoot) return;

    const checkStatus = async () => {
      try {
        const status = await invoke<RustSrcStatus>("lsp_check_rust_src");
        setRustSrcStatus(status);
      } catch (err) {
        console.warn("Failed to check rust-src status:", err);
      }
    };

    checkStatus();
  }, [workspaceRoot]);

  // Handle goto definition
  const gotoDefinition = useCallback(async (
    filePath: string,
    line: number,
    col: number
  ) => {
    try {
      const result = await invoke<ResolvedDefinition | null>("lsp_goto_definition", {
        uri: filePath,
        line,
        character: col,
      });

      if (result) {
        const targetPath = result.uri.replace(/^file:\/\//, "").replace(/^file:\/\//, "");
        
        // Check if this is a virtual file (stdlib/external crate)
        if (result.is_virtual) {
          if (!rustSrcStatus?.installed) {
            // Prompt to install rust-src
            setShowRustSrcPrompt(true);
            return;
          }
          
          // Navigate to virtual file with content
          onNavigate(targetPath, result.range.start.line, result.range.start.character, true, result.content);
        } else {
          // Navigate to regular workspace file
          onNavigate(targetPath, result.range.start.line, result.range.start.character, false);
        }
      }
    } catch (err) {
      console.warn("Goto definition failed:", err);
    }
  }, [onNavigate, rustSrcStatus]);

  // Handle goto implementation (for trait implementations)
  const gotoImplementation = useCallback(async (
    filePath: string,
    line: number,
    col: number
  ) => {
    try {
      const result = await invoke<ResolvedDefinition | null>("lsp_goto_implementation", {
        uri: filePath,
        line,
        character: col,
      });

      if (result) {
        const targetPath = result.uri.replace(/^file:\/\//, "").replace(/^file:\/\//, "");
        
        if (result.is_virtual) {
          if (!rustSrcStatus?.installed) {
            setShowRustSrcPrompt(true);
            return;
          }
          
          onNavigate(targetPath, result.range.start.line, result.range.start.character, true, result.content);
        } else {
          onNavigate(targetPath, result.range.start.line, result.range.start.character, false);
        }
      }
    } catch (err) {
      console.warn("Goto implementation failed:", err);
    }
  }, [onNavigate, rustSrcStatus]);

  // Install rust-src
  const installRustSrc = useCallback(async () => {
    setIsInstalling(true);
    try {
      const message = await invoke<string>("lsp_install_rust_src");
      console.log(message);
      
      // Re-check status after installation
      const status = await invoke<RustSrcStatus>("lsp_check_rust_src");
      setRustSrcStatus(status);
      setShowRustSrcPrompt(false);
    } catch (err) {
      console.error("Failed to install rust-src:", err);
    } finally {
      setIsInstalling(false);
    }
  }, []);

  // Dismiss rust-src prompt
  const dismissRustSrcPrompt = useCallback(() => {
    setShowRustSrcPrompt(false);
  }, []);

  return {
    gotoDefinition,
    gotoImplementation,
    rustSrcStatus,
    showRustSrcPrompt,
    installRustSrc,
    dismissRustSrcPrompt,
    isInstalling,
  };
}
