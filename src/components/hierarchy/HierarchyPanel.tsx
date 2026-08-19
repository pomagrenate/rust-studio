/**
 * HierarchyPanel.tsx — JetBrains RustRover Style Call & Type Hierarchy Tool Window
 * Inspects Incoming Callers, Outgoing Callees, Subtypes (Implementors), and Supertypes.
 */

import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  VscArrowDown,
  VscArrowUp,
  VscSymbolStructure,
  VscSymbolInterface,
  VscSymbolMethod,
  VscSymbolClass,
  VscRefresh,
  VscChromeMinimize,
  VscBug,
  VscSearch
} from "react-icons/vsc";
import styles from "./HierarchyPanel.module.css";

export interface HierarchyNode {
  name: string;
  kind: "function" | "struct" | "trait" | "enum" | "method" | string;
  file_path: string;
  line: number;
  column: number;
  signature: string;
  children: HierarchyNode[];
}

export interface HierarchyResponse {
  root_symbol: string;
  mode: string;
  nodes: HierarchyNode[];
  duration_ms: number;
}

type HierarchyMode = "incoming" | "outgoing" | "subtypes" | "supertypes";

interface HierarchyPanelProps {
  workspaceRoot?: string;
  initialSymbol?: string;
  onNavigateToFile?: (filePath: string, line: number, column: number) => void;
  onDebugTest?: (symbolName: string, filePath: string, line: number) => void;
  onClose?: () => void;
}

export function HierarchyPanel({
  workspaceRoot,
  initialSymbol = "start_debug_session",
  onNavigateToFile,
  onDebugTest,
  onClose,
}: HierarchyPanelProps) {
  const [mode, setMode] = useState<HierarchyMode>("incoming");
  const [symbolName, setSymbolName] = useState<string>(initialSymbol);
  const [searchInput, setSearchInput] = useState<string>(initialSymbol);
  const [nodes, setNodes] = useState<HierarchyNode[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [durationMs, setDurationMs] = useState<number>(0);

  const fetchHierarchy = useCallback(async () => {
    if (!symbolName.trim()) return;
    setIsLoading(true);
    const rootPath = workspaceRoot || ".";

    if (window.__TAURI_INTERNALS__) {
      try {
        if (mode === "incoming" || mode === "outgoing") {
          const res = await invoke<HierarchyResponse>("get_call_hierarchy", {
            projectPath: rootPath,
            symbolName: symbolName.trim(),
            mode,
          });
          setNodes(res.nodes);
          setDurationMs(res.duration_ms);
        } else {
          const res = await invoke<HierarchyResponse>("get_type_hierarchy", {
            projectPath: rootPath,
            typeName: symbolName.trim(),
            mode,
          });
          setNodes(res.nodes);
          setDurationMs(res.duration_ms);
        }
      } catch (err) {
        console.error("Failed to fetch hierarchy:", err);
      } finally {
        setIsLoading(false);
      }
    } else {
      // Browser preview mock
      setTimeout(() => {
        if (mode === "incoming") {
          setNodes([
            { name: "handleStartDebug", kind: "function", file_path: "src/components/debugger/DebugPanel.tsx", line: 106, column: 10, signature: "const handleStartDebug = async () => { ... }", children: [] },
            { name: "debugSingleTest", kind: "function", file_path: "src/components/rust/TestExplorer.tsx", line: 145, column: 10, signature: "const debugSingleTest = (testItem) => { ... }", children: [] },
            { name: "main::run_app", kind: "function", file_path: "src-tauri/src/lib.rs", line: 118, column: 13, signature: "pub fn run() { ... }", children: [] },
          ]);
        } else if (mode === "outgoing") {
          setNodes([
            { name: "invoke", kind: "function", file_path: "src/components/debugger/DebugPanel.tsx", line: 113, column: 15, signature: "invoke('start_debug_session')", children: [] },
            { name: "setConsoleLogs", kind: "function", file_path: "src/components/debugger/DebugPanel.tsx", line: 109, column: 5, signature: "setConsoleLogs(prev => ...)", children: [] },
          ]);
        } else {
          setNodes([
            { name: "GitRepository", kind: "struct", file_path: "src/extensions/builtin/git/GitSCMProvider.ts", line: 44, column: 14, signature: "export class GitRepository implements ISCMRepository", children: [] },
            { name: "CargoProvider", kind: "struct", file_path: "src/extensions/builtin/rust/CargoProvider.ts", line: 20, column: 14, signature: "export class CargoProvider implements IBuildProvider", children: [] },
          ]);
        }
        setDurationMs(14);
        setIsLoading(false);
      }, 200);
    }
  }, [workspaceRoot, symbolName, mode]);

  useEffect(() => {
    fetchHierarchy();
  }, [fetchHierarchy]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setSymbolName(searchInput.trim());
    }
  };

  const getNodeIcon = (kind: string) => {
    if (kind === "struct" || kind === "class") return <VscSymbolClass color="#d29922" />;
    if (kind === "trait" || kind === "interface") return <VscSymbolInterface color="#005fb8" />;
    if (kind === "enum") return <VscSymbolStructure color="#1a7f37" />;
    return <VscSymbolMethod color="#8250df" />;
  };

  return (
    <div className={styles.hierarchyContainer}>
      {/* ── Header Toolbar ── */}
      <div className={styles.panelHeader}>
        <div className={styles.headerLeft}>
          <span className={styles.headerTitle}>Hierarchy</span>

          {/* Mode Selector */}
          <div className={styles.modeToggleGroup}>
            <button
              className={`${styles.modeBtn} ${mode === "incoming" ? styles.modeBtnActive : ""}`}
              onClick={() => setMode("incoming")}
              title="Incoming Callers (Who calls this function?)"
            >
              <VscArrowDown />
              <span>Callers</span>
            </button>
            <button
              className={`${styles.modeBtn} ${mode === "outgoing" ? styles.modeBtnActive : ""}`}
              onClick={() => setMode("outgoing")}
              title="Outgoing Calls (What does this function call?)"
            >
              <VscArrowUp />
              <span>Callees</span>
            </button>
            <button
              className={`${styles.modeBtn} ${mode === "subtypes" ? styles.modeBtnActive : ""}`}
              onClick={() => setMode("subtypes")}
              title="Subtypes & Implementors (Who implements this trait?)"
            >
              <VscSymbolStructure />
              <span>Subtypes</span>
            </button>
            <button
              className={`${styles.modeBtn} ${mode === "supertypes" ? styles.modeBtnActive : ""}`}
              onClick={() => setMode("supertypes")}
              title="Supertypes & Base Traits (Parent traits)"
            >
              <VscSymbolInterface />
              <span>Supertypes</span>
            </button>
          </div>

          {/* Symbol Search Input */}
          <form className={styles.headerSearch} onSubmit={handleSearchSubmit}>
            <input
              type="text"
              className={styles.symbolInput}
              placeholder="Inspect symbol name..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <button type="submit" className={styles.iconBtn} title="Inspect Symbol">
              <VscSearch size={14} />
            </button>
          </form>
        </div>

        <div className={styles.headerRight}>
          {nodes.length > 0 && onDebugTest && (
            <button
              className={styles.debugBtn}
              onClick={() => onDebugTest(symbolName, nodes[0].file_path, nodes[0].line)}
              title="Debug Symbol with CodeLLDB (Shift+F9)"
            >
              <VscBug size={13} />
              <span>Debug Symbol</span>
            </button>
          )}

          <button className={styles.iconBtn} onClick={fetchHierarchy} title="Refresh Hierarchy">
            <VscRefresh className={isLoading ? "spin" : ""} />
          </button>

          {onClose && (
            <button className={styles.iconBtn} onClick={onClose} title="Minimize">
              <VscChromeMinimize />
            </button>
          )}
        </div>
      </div>

      {/* ── Main Tree Body ── */}
      <div className={styles.panelBody}>
        {/* Target Symbol Hero Banner */}
        <div className={styles.targetSymbolHero}>
          <span>Target Symbol:</span>
          <span className={styles.targetName}>{symbolName}</span>
          <span style={{ fontSize: "11px", color: "var(--pm-fg-muted)", marginLeft: "auto" }}>
            {isLoading
              ? "Scanning AST call graph..."
              : `${nodes.length} hierarchy nodes found in ${durationMs}ms`}
          </span>
        </div>

        {/* Tree Nodes List */}
        {nodes.length === 0 ? (
          <div className={styles.emptyState}>
            {isLoading
              ? "Scanning workspace for hierarchy relationships..."
              : `No ${mode} hierarchy relationships found for '${symbolName}'.`}
          </div>
        ) : (
          nodes.map((node, idx) => (
            <div
              key={`${node.name}-${node.file_path}-${node.line}-${idx}`}
              className={styles.treeNodeRow}
              onClick={() => onNavigateToFile?.(node.file_path, node.line, node.column)}
              title={`Jump to ${node.name} (${node.file_path}:${node.line})`}
            >
              <span className={styles.nodeIcon}>{getNodeIcon(node.kind)}</span>
              <span className={styles.nodeName}>{node.name}</span>
              <span className={styles.nodeSignature}>{node.signature}</span>
              <span className={styles.nodeLocation}>
                {node.file_path}:{node.line}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default HierarchyPanel;
