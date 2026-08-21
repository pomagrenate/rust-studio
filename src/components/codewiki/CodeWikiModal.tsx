/**
 * CodeWikiModal.tsx — Offline Static Analysis Documentation & Architecture Knowledge Base
 *
 * Features:
 * - Dual Graph Modes: "Entire Project (File Architecture)" and "Focused Symbol (Call Graph)"
 * - 100% Light Theme default / integration with useTheme.ts
 * - Hardware-accelerated, 60fps RAF throttled Pan, Drag, and Zoom Knowledge Graph Canvas
 * - Function-to-Function and Symbol-to-Symbol directional edge connections
 * - Blast Radius Impact Analysis & Dynamic Wiki Pages
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  VscBook,
  VscClose,
  VscSearch,
  VscRefresh,
  VscSymbolStructure,
  VscGraph,
  VscFlame,
  VscChevronRight,
  VscColorMode,
  VscZoomIn,
  VscZoomOut,
  VscScreenFull,
} from "react-icons/vsc";
import { useTheme } from "../../hooks/useTheme";
import styles from "./CodeWikiModal.module.css";

export interface SymbolNode {
  id: string;
  name: string;
  kind: string;
  file_path: string;
  start_line: number;
  signature: string;
  docstring?: string;
  parent_id?: string;
  x?: number;
  y?: number;
}

export interface DependencyInfo {
  symbol: SymbolNode;
  edge_kind: string;
}

export interface BlastRadiusReport {
  direct_dependents: SymbolNode[];
  transitive_dependents: SymbolNode[];
  affected_files: string[];
  total_impact_score: number;
}

export interface WikiPage {
  symbol: SymbolNode;
  breadcrumbs: string[];
  signature: string;
  docstring?: string;
  dependencies: DependencyInfo[];
  dependents: DependencyInfo[];
  blast_radius: BlastRadiusReport;
  child_symbols: SymbolNode[];
}

export interface GraphEdge {
  source_id: string;
  target_id: string;
  kind: string;
}

export interface GraphData {
  nodes: SymbolNode[];
  edges: GraphEdge[];
}

export interface CodeWikiModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspacePath?: string;
}

type TabType = "wiki" | "graph" | "blast";
type GraphScopeMode = "project" | "symbol";

export const CodeWikiModal: React.FC<CodeWikiModalProps> = ({
  isOpen,
  onClose,
  workspacePath = "",
}) => {
  const { theme, toggleTheme } = useTheme();
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");

  const [activeTab, setActiveTab] = useState<TabType>("wiki");
  const [graphScopeMode, setGraphScopeMode] = useState<GraphScopeMode>("project");

  const [searchQuery, setSearchQuery] = useState("");
  const [symbols, setSymbols] = useState<SymbolNode[]>([]);
  const [selectedSymbolId, setSelectedSymbolId] = useState<string | null>(null);
  const [wikiPage, setWikiPage] = useState<WikiPage | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number }>>(
    new Map()
  );

  const [isIndexing, setIsIndexing] = useState(false);
  const [statsText, setStatsText] = useState("");

  // Graph Pan & Zoom State
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rafId = useRef<number | null>(null);

  // Sync theme with useTheme
  useEffect(() => {
    if (theme === "dark") setThemeMode("dark");
    else setThemeMode("light");
  }, [theme]);

  const isLight = themeMode === "light";

  const handleIndexWorkspace = useCallback(async () => {
    if (!workspacePath) return;
    setIsIndexing(true);
    try {
      const stats = await invoke<{
        total_symbols: number;
        total_files: number;
        total_edges: number;
        index_duration_ms: number;
      }>("build_code_wiki_index", { workspacePath });

      setStatsText(
        `Indexed ${stats.total_symbols} symbols & ${stats.total_edges} connections in ${stats.index_duration_ms}ms`
      );

      const results = await invoke<SymbolNode[]>("search_code_wiki_symbols", {
        query: "",
      });
      setSymbols(results);

      if (results.length > 0 && !selectedSymbolId) {
        setSelectedSymbolId(results[0].id);
      }
    } catch (err) {
      console.error("[CodeWiki] Index error:", err);
    } finally {
      setIsIndexing(false);
    }
  }, [workspacePath, selectedSymbolId]);

  useEffect(() => {
    if (isOpen) {
      handleIndexWorkspace();
    }
  }, [isOpen, handleIndexWorkspace]);

  useEffect(() => {
    if (!isOpen) return;
    const fetchSymbols = async () => {
      try {
        const results = await invoke<SymbolNode[]>("search_code_wiki_symbols", {
          query: searchQuery,
        });
        setSymbols(results);
      } catch (err) {
        console.error("[CodeWiki] Search error:", err);
      }
    };

    const timer = setTimeout(fetchSymbols, 120);
    return () => clearTimeout(timer);
  }, [searchQuery, isOpen]);

  useEffect(() => {
    if (!selectedSymbolId) return;
    const fetchPage = async () => {
      try {
        const page = await invoke<WikiPage>("get_code_wiki_page", {
          symbolId: selectedSymbolId,
        });
        setWikiPage(page);
      } catch (err) {
        console.error("[CodeWiki] Page error:", err);
      }
    };
    fetchPage();
  }, [selectedSymbolId]);

  // Fetch Graph Data
  useEffect(() => {
    if (activeTab === "graph" && isOpen) {
      const fetchGraph = async () => {
        try {
          const data = await invoke<GraphData>("get_code_wiki_graph");
          setGraphData(data);
        } catch (err) {
          console.error("[CodeWiki] Graph error:", err);
        }
      };
      fetchGraph();
    }
  }, [activeTab, isOpen]);

  // Calculate Display Nodes & Edges based on GraphScopeMode
  const { visibleNodes, visibleEdges } = useMemo(() => {
    if (!graphData) return { visibleNodes: [], visibleEdges: [] };

    if (graphScopeMode === "project") {
      // 1. Entire Project Mode: File Architecture Map
      const fileNodes = graphData.nodes.filter((n) => n.kind.toLowerCase() === "file");
      const fileIds = new Set(fileNodes.map((f) => f.id));

      // Build file-to-file dependency edges
      const fileEdgeMap = new Map<string, GraphEdge>();
      const nodeToFile = new Map<string, string>();

      graphData.nodes.forEach((n) => {
        nodeToFile.set(n.id, `file::${n.file_path}`);
      });

      graphData.edges.forEach((e) => {
        const srcFile = nodeToFile.get(e.source_id);
        const tgtFile = nodeToFile.get(e.target_id);

        if (srcFile && tgtFile && srcFile !== tgtFile && fileIds.has(srcFile) && fileIds.has(tgtFile)) {
          const edgeKey = `${srcFile}->${tgtFile}`;
          if (!fileEdgeMap.has(edgeKey)) {
            fileEdgeMap.set(edgeKey, {
              source_id: srcFile,
              target_id: tgtFile,
              kind: "Imports",
            });
          }
        }
      });

      return {
        visibleNodes: fileNodes.slice(0, 50),
        visibleEdges: Array.from(fileEdgeMap.values()),
      };
    } else {
      // 2. Focused Symbol Mode: Function Call Graph for Selected Symbol
      if (!selectedSymbolId) {
        const sampleNodes = graphData.nodes.slice(0, 30);
        const sampleIds = new Set(sampleNodes.map((n) => n.id));
        const edges = graphData.edges.filter(
          (e) => sampleIds.has(e.source_id) && sampleIds.has(e.target_id)
        );
        return { visibleNodes: sampleNodes, visibleEdges: edges };
      }

      const neighborIds = new Set<string>([selectedSymbolId]);
      graphData.edges.forEach((e) => {
        if (e.source_id === selectedSymbolId) neighborIds.add(e.target_id);
        if (e.target_id === selectedSymbolId) neighborIds.add(e.source_id);
      });

      const focusedNodes = graphData.nodes.filter((n) => neighborIds.has(n.id));
      const focusedIds = new Set(focusedNodes.map((n) => n.id));
      const focusedEdges = graphData.edges.filter(
        (e) => focusedIds.has(e.source_id) && focusedIds.has(e.target_id)
      );

      return { visibleNodes: focusedNodes, visibleEdges: focusedEdges };
    }
  }, [graphData, graphScopeMode, selectedSymbolId]);

  // Layout node positions whenever visibleNodes changes
  useEffect(() => {
    const positions = new Map<string, { x: number; y: number }>();
    const cols = 5;
    visibleNodes.forEach((node, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positions.set(node.id, {
        x: col * 230 + 130,
        y: row * 160 + 100,
      });
    });
    setNodePositions(positions);
  }, [visibleNodes]);

  // Mouse Wheel Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.min(Math.max(scale * zoomFactor, 0.3), 3.5);
    setScale(newScale);
  };

  // Canvas Pan & Node Drag Handlers (RAF Throttled 60fps)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (draggedNodeId) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (rafId.current !== null) return;

    const clientX = e.clientX;
    const clientY = e.clientY;

    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      if (draggedNodeId) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mouseX = (clientX - rect.left - pan.x) / scale;
        const mouseY = (clientY - rect.top - pan.y) / scale;

        setNodePositions((prev) => {
          const next = new Map(prev);
          next.set(draggedNodeId, { x: mouseX, y: mouseY });
          return next;
        });
        return;
      }

      if (isPanning) {
        setPan({ x: clientX - panStart.x, y: clientY - panStart.y });
      }
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggedNodeId(null);
  };

  if (!isOpen) return null;

  const renderBadge = (kind: string) => {
    const k = kind.toLowerCase();
    let badgeClass = styles.kindFunction;
    if (k.includes("struct")) badgeClass = styles.kindStruct;
    else if (k.includes("trait") || k.includes("interface")) badgeClass = styles.kindTrait;
    else if (k.includes("file")) badgeClass = styles.kindFile;
    else if (k.includes("enum")) badgeClass = styles.kindEnum;

    return <span className={`${styles.symbolKindBadge} ${badgeClass}`}>{kind}</span>;
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={isLight ? styles.modalLight : styles.modalDark}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={isLight ? styles.headerLight : styles.headerDark}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIcon}>
              <VscBook size={20} />
            </div>
            <h2 className={isLight ? styles.titleLight : styles.titleDark}>
              CodeWiki Knowledge Base
            </h2>
            <button
              className={isLight ? styles.actionBtnLight : styles.actionBtnDark}
              onClick={handleIndexWorkspace}
              disabled={isIndexing}
            >
              <VscRefresh className={isIndexing ? "spin" : ""} />
              {isIndexing ? "Indexing..." : "Re-Index AST"}
            </button>
            {statsText && (
              <span style={{ fontSize: 11, color: isLight ? "#57606a" : "#888888" }}>
                {statsText}
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Light / Dark Mode Toggle */}
            <button
              className={isLight ? styles.actionBtnLight : styles.actionBtnDark}
              onClick={() => {
                toggleTheme();
                setThemeMode((prev) => (prev === "light" ? "dark" : "light"));
              }}
              title="Toggle Light / Dark Theme"
            >
              <VscColorMode />
              {isLight ? "Dark" : "Light"}
            </button>

            <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
              <VscClose size={20} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className={isLight ? styles.tabsLight : styles.tabsDark}>
          <button
            className={`${styles.tab} ${
              activeTab === "wiki" ? (isLight ? styles.tabActiveLight : styles.tabActiveDark) : ""
            }`}
            onClick={() => setActiveTab("wiki")}
          >
            <VscSymbolStructure /> Symbol Explorer & Wiki Page
          </button>
          <button
            className={`${styles.tab} ${
              activeTab === "graph" ? (isLight ? styles.tabActiveLight : styles.tabActiveDark) : ""
            }`}
            onClick={() => setActiveTab("graph")}
          >
            <VscGraph /> Architecture Knowledge Graph
          </button>
          <button
            className={`${styles.tab} ${
              activeTab === "blast" ? (isLight ? styles.tabActiveLight : styles.tabActiveDark) : ""
            }`}
            onClick={() => setActiveTab("blast")}
          >
            <VscFlame /> Blast Radius Impact Analysis
          </button>
        </div>

        {/* Modal Body */}
        <div className={styles.body}>
          {activeTab === "wiki" && (
            <>
              {/* Sidebar */}
              <div className={isLight ? styles.sidebarLight : styles.sidebarDark}>
                <div className={isLight ? styles.searchBoxLight : styles.searchBoxDark}>
                  <VscSearch color={isLight ? "#57606a" : "#888888"} />
                  <input
                    className={isLight ? styles.searchInputLight : styles.searchInputDark}
                    placeholder="Search symbols, functions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <div className={styles.symbolList}>
                  {symbols.map((sym) => (
                    <div
                      key={sym.id}
                      className={
                        selectedSymbolId === sym.id
                          ? isLight
                            ? styles.symbolItemActiveLight
                            : styles.symbolItemActiveDark
                          : isLight
                          ? styles.symbolItemLight
                          : styles.symbolItemDark
                      }
                      onClick={() => {
                        setSelectedSymbolId(sym.id);
                        setGraphScopeMode("symbol");
                      }}
                    >
                      {renderBadge(sym.kind)}
                      <span className={isLight ? styles.symbolNameLight : styles.symbolNameDark}>
                        {sym.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Wiki Content Main Panel */}
              <div className={isLight ? styles.wikiContentLight : styles.wikiContentDark}>
                {wikiPage ? (
                  <>
                    <div className={styles.breadcrumbs}>
                      {wikiPage.breadcrumbs.map((crumb, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && <VscChevronRight size={10} />}
                          <span>{crumb}</span>
                        </React.Fragment>
                      ))}
                    </div>

                    <div className={styles.symbolHeader}>
                      {renderBadge(wikiPage.symbol.kind)}
                      <h1 className={isLight ? styles.symbolTitleLight : styles.symbolTitleDark}>
                        {wikiPage.symbol.name}
                      </h1>
                    </div>

                    <div className={isLight ? styles.signatureBoxLight : styles.signatureBoxDark}>
                      <code>{wikiPage.signature}</code>
                    </div>

                    {wikiPage.docstring && (
                      <div className={isLight ? styles.docstringBoxLight : styles.docstringBoxDark}>
                        <strong>Documentation:</strong>
                        <p style={{ margin: "4px 0 0 0" }}>{wikiPage.docstring}</p>
                      </div>
                    )}

                    {/* Outgoing Dependencies Table */}
                    <div className={isLight ? styles.sectionTitleLight : styles.sectionTitleDark}>
                      Outgoing Symbol & Function Connections ({wikiPage.dependencies.length})
                    </div>
                    <table className={isLight ? styles.tableLight : styles.tableDark}>
                      <thead>
                        <tr>
                          <th>Connection Kind</th>
                          <th>Target Symbol</th>
                          <th>File Location</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wikiPage.dependencies.map((dep, idx) => (
                          <tr
                            key={idx}
                            className={isLight ? styles.tableRowLight : styles.tableRowDark}
                            onClick={() => {
                              setSelectedSymbolId(dep.symbol.id);
                              setGraphScopeMode("symbol");
                            }}
                          >
                            <td>{dep.edge_kind}</td>
                            <td className={styles.linkText}>{dep.symbol.name}</td>
                            <td>{dep.symbol.file_path}</td>
                          </tr>
                        ))}
                        {wikiPage.dependencies.length === 0 && (
                          <tr>
                            <td colSpan={3} style={{ color: isLight ? "#8c959f" : "#777777" }}>
                              No outgoing function connections.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    {/* Incoming Dependents Table */}
                    <div className={isLight ? styles.sectionTitleLight : styles.sectionTitleDark}>
                      Incoming Function & Symbol Callers ({wikiPage.dependents.length})
                    </div>
                    <table className={isLight ? styles.tableLight : styles.tableDark}>
                      <thead>
                        <tr>
                          <th>Connection Kind</th>
                          <th>Caller / Dependent Symbol</th>
                          <th>File Location</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wikiPage.dependents.map((dep, idx) => (
                          <tr
                            key={idx}
                            className={isLight ? styles.tableRowLight : styles.tableRowDark}
                            onClick={() => {
                              setSelectedSymbolId(dep.symbol.id);
                              setGraphScopeMode("symbol");
                            }}
                          >
                            <td>{dep.edge_kind}</td>
                            <td className={styles.linkText}>{dep.symbol.name}</td>
                            <td>{dep.symbol.file_path}</td>
                          </tr>
                        ))}
                        {wikiPage.dependents.length === 0 && (
                          <tr>
                            <td colSpan={3} style={{ color: isLight ? "#8c959f" : "#777777" }}>
                              No incoming callers.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <div className={styles.emptyState}>Select a symbol to view CodeWiki page.</div>
                )}
              </div>
            </>
          )}

          {activeTab === "graph" && (
            <div
              className={`${styles.graphCanvasContainer} ${
                isLight ? styles.graphCanvasLight : styles.graphCanvasDark
              }`}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              {/* Scope & Zoom Overlay Controls */}
              <div className={isLight ? styles.zoomOverlay : styles.zoomOverlayDark}>
                {/* Scope Mode Switcher */}
                <div style={{ display: "flex", gap: 4, marginRight: 12 }}>
                  <button
                    className={`${styles.zoomBtn} ${
                      graphScopeMode === "project" ? (isLight ? styles.actionBtnLight : styles.actionBtnDark) : ""
                    }`}
                    onClick={() => setGraphScopeMode("project")}
                    title="View Whole Project File Dependencies"
                  >
                    Entire Project (Files)
                  </button>
                  <button
                    className={`${styles.zoomBtn} ${
                      graphScopeMode === "symbol" ? (isLight ? styles.actionBtnLight : styles.actionBtnDark) : ""
                    }`}
                    onClick={() => setGraphScopeMode("symbol")}
                    title="View Focused Symbol Function Call Graph"
                  >
                    Focused Symbol ({wikiPage?.symbol.name || "Selected"})
                  </button>
                </div>

                <button
                  className={styles.zoomBtn}
                  onClick={() => setScale((s) => Math.min(s + 0.15, 3.5))}
                  title="Zoom In"
                >
                  <VscZoomIn />
                </button>
                <button
                  className={styles.zoomBtn}
                  onClick={() => setScale((s) => Math.max(s - 0.15, 0.3))}
                  title="Zoom Out"
                >
                  <VscZoomOut />
                </button>
                <button
                  className={styles.zoomBtn}
                  onClick={() => {
                    setScale(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  title="Reset Zoom & Pan"
                >
                  <VscScreenFull />
                </button>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#0969da" }}>
                  {Math.round(scale * 100)}%
                </span>
              </div>

              {/* Interactive SVG Canvas */}
              <svg
                ref={svgRef}
                className={`${styles.svgGraph} ${isPanning ? styles.svgGraphGrabbing : ""}`}
              >
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="7"
                    refX="9"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon points="0 0, 10 3.5, 0 7" fill={isLight ? "#0969da" : "#0078d4"} />
                  </marker>
                </defs>

                <g
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                    transformOrigin: "0 0",
                    willChange: "transform",
                  }}
                >
                  {/* Function & File Connections (Edges) */}
                  {visibleEdges.map((edge, idx) => {
                    const sourcePos = nodePositions.get(edge.source_id);
                    const targetPos = nodePositions.get(edge.target_id);

                    if (!sourcePos || !targetPos) return null;

                    const sx = sourcePos.x;
                    const sy = sourcePos.y;
                    const tx = targetPos.x;
                    const ty = targetPos.y;

                    const dx = tx - sx;
                    const dy = ty - sy;
                    const cx = sx + dx / 2;
                    const cy = sy + dy / 2 - 30;

                    return (
                      <g key={idx}>
                        <path
                          d={`M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`}
                          fill="none"
                          stroke={isLight ? "#0969da" : "#0078d4"}
                          strokeWidth={2}
                          strokeDasharray={edge.kind === "Imports" ? "4 4" : undefined}
                          markerEnd="url(#arrowhead)"
                        />
                        <text
                          x={cx}
                          y={cy - 6}
                          fill={isLight ? "#57606a" : "#aaaaaa"}
                          fontSize={10}
                          textAnchor="middle"
                          fontFamily="sans-serif"
                        >
                          {edge.kind}
                        </text>
                      </g>
                    );
                  })}

                  {/* Graph Nodes */}
                  {visibleNodes.map((node) => {
                    const pos = nodePositions.get(node.id) || { x: 100, y: 100 };
                    const isSelected = selectedSymbolId === node.id;

                    return (
                      <g
                        key={node.id}
                        transform={`translate(${pos.x}, ${pos.y})`}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setDraggedNodeId(node.id);
                        }}
                        onClick={() => {
                          setSelectedSymbolId(node.id);
                          if (node.kind.toLowerCase() !== "file") {
                            setGraphScopeMode("symbol");
                          }
                          setActiveTab("wiki");
                        }}
                        style={{ cursor: "grab" }}
                      >
                        <rect
                          x={-85}
                          y={-22}
                          width={170}
                          height={44}
                          rx={8}
                          fill={
                            isSelected
                              ? isLight
                                ? "#ddf4ff"
                                : "#37373d"
                              : isLight
                              ? "#ffffff"
                              : "#252526"
                          }
                          stroke={
                            isSelected
                              ? "#0969da"
                              : isLight
                              ? "#d0d7de"
                              : "#333333"
                          }
                          strokeWidth={isSelected ? 2.5 : 1.5}
                          filter="drop-shadow(0 2px 4px rgba(0,0,0,0.06))"
                        />
                        <text
                          x={0}
                          y={-2}
                          fill={isLight ? "#1f2328" : "#ffffff"}
                          fontSize={12}
                          fontWeight={600}
                          textAnchor="middle"
                          fontFamily="sans-serif"
                        >
                          {node.name.length > 18 ? node.name.substring(0, 16) + "..." : node.name}
                        </text>
                        <text
                          x={0}
                          y={12}
                          fill={isLight ? "#0969da" : "#4ec9b0"}
                          fontSize={10}
                          textAnchor="middle"
                          fontFamily="sans-serif"
                        >
                          {node.kind}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
            </div>
          )}

          {activeTab === "blast" && (
            <div className={styles.blastContainer}>
              {wikiPage ? (
                <>
                  <div className={styles.statsGrid}>
                    <div className={isLight ? styles.statCardLight : styles.statCardDark}>
                      <div className={styles.statValue}>
                        {wikiPage.blast_radius.total_impact_score}
                      </div>
                      <div className={styles.statLabel}>Total Impact Score</div>
                    </div>
                    <div className={isLight ? styles.statCardLight : styles.statCardDark}>
                      <div className={styles.statValue}>
                        {wikiPage.blast_radius.affected_files.length}
                      </div>
                      <div className={styles.statLabel}>Affected Files</div>
                    </div>
                    <div className={isLight ? styles.statCardLight : styles.statCardDark}>
                      <div className={styles.statValue}>
                        {wikiPage.blast_radius.direct_dependents.length}
                      </div>
                      <div className={styles.statLabel}>Direct Dependents</div>
                    </div>
                    <div className={isLight ? styles.statCardLight : styles.statCardDark}>
                      <div className={styles.statValue}>
                        {wikiPage.blast_radius.transitive_dependents.length}
                      </div>
                      <div className={styles.statLabel}>Transitive Dependents</div>
                    </div>
                  </div>

                  <div className={isLight ? styles.sectionTitleLight : styles.sectionTitleDark}>
                    Affected Workspace Files
                  </div>
                  <ul>
                    {wikiPage.blast_radius.affected_files.map((file, i) => (
                      <li key={i} style={{ margin: "6px 0", color: "#0969da", fontWeight: 500 }}>
                        {file}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className={styles.emptyState}>
                  Select a symbol in Wiki view to perform Blast Radius Impact Analysis.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CodeWikiModal;
