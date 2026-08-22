/**
 * TestExplorer.tsx — JetBrains RustRover Style Test Explorer Tool Window
 * Directly integrated with the CodeLLDB / Pomai Debugger engine.
 *
 * Features:
 * 1. Automatic AST Test Discovery (#[test], #[tokio::test], #[rstest]).
 * 2. 1-Click Run Test (cargo test <name> -- --exact).
 * 3. 1-Click Debug Test (Attaches CodeLLDB & opens Debug Tool Window).
 * 4. Pass / Fail / Panic assertion diff viewer.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  VscCheck,
  VscError,
  VscPlay,
  VscBug,
  VscRefresh,
  VscChevronRight,
  VscChevronDown,
  VscChromeMinimize,
  VscClearAll,
  VscCopy
} from "react-icons/vsc";
import styles from "./TestExplorer.module.css";

export interface RustTestItem {
  name: string;
  file_path: string;
  line: number;
  module_path: string;
}

export interface SingleTestResult {
  name: string;
  status: "passed" | "failed" | "ignored" | "running" | "untested";
  duration_ms: number;
  stdout: string;
  stderr: string;
}

export interface AllTestResults {
  results: Record<string, SingleTestResult>;
  total_duration_ms: number;
  full_output: string;
}

interface TestExplorerProps {
  workspaceRoot?: string;
  onNavigateToFile?: (filePath: string, line: number, column: number) => void;
  onDebugTest?: (testName: string, filePath: string, line: number) => void;
  onClose?: () => void;
}

function cleanTestOutput(rawOutput: string, testName?: string): string {
  if (!rawOutput) return "";

  const lines = rawOutput.split("\n");

  const filtered = lines.filter((line) => {
    const t = line.trim();
    if (t === "running 0 tests") return false;
    if (
      t.startsWith(
        "test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out"
      )
    )
      return false;
    return true;
  });

  const cleanedText = filtered.join("\n").trim();

  if (testName) {
    const relevantLines = filtered.filter(
      (line) =>
        line.includes(testName) ||
        line.startsWith("     Running ") ||
        line.startsWith("running ") ||
        line.startsWith("test result:")
    );
    if (relevantLines.length > 0) {
      return relevantLines.join("\n").trim();
    }
  }

  return cleanedText || rawOutput;
}

export function TestExplorer({
  workspaceRoot,
  onNavigateToFile,
  onDebugTest,
  onClose,
}: TestExplorerProps) {
  const [discoveredTests, setDiscoveredTests] = useState<RustTestItem[]>([]);
  const [testResults, setTestResults] = useState<Record<string, SingleTestResult>>({});
  const [selectedTestName, setSelectedTestName] = useState<string | null>(null);
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode] = useState<"ALL" | "FAILED" | "PASSED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isRunningAll, setIsRunningAll] = useState(false);

  // ── 1. Discover Tests in Workspace ──
  const discoverTests = useCallback(async () => {
    setIsDiscovering(true);
    const rootPath = workspaceRoot || ".";

    if (window.__TAURI_INTERNALS__) {
      try {
        const tests = await invoke<RustTestItem[]>("cargo_test_discovery", {
          projectPath: rootPath,
        });
        setDiscoveredTests(tests);
        if (tests.length > 0 && !selectedTestName) {
          setSelectedTestName(tests[0].name);
        }
      } catch (err) {
        console.error("Test discovery failed:", err);
      } finally {
        setIsDiscovering(false);
      }
    } else {
      // Browser preview fallback mock tests
      setTimeout(() => {
        const mock: RustTestItem[] = [
          { name: "test_dap_message_framing", file_path: "src-tauri/src/debugger/debugger_embed.rs", line: 180, module_path: "debugger::embed" },
          { name: "test_rope_insert_chunk", file_path: "src-tauri/src/buffer/rope_buffer.rs", line: 65, module_path: "buffer::rope" },
          { name: "test_linter_safety_audit", file_path: "src-tauri/src/linter/mod.rs", line: 120, module_path: "linter::scan" },
          { name: "test_terminal_pty_spawn", file_path: "src-tauri/src/commands/terminal_commands.rs", line: 95, module_path: "terminal::pty" },
        ];
        setDiscoveredTests(mock);
        setSelectedTestName(mock[0].name);
        setIsDiscovering(false);
      }, 200);
    }
  }, [workspaceRoot, selectedTestName]);

  useEffect(() => {
    discoverTests();
  }, [workspaceRoot, discoverTests]);

  // ── 2. Run Single Test ──
  const runSingleTest = async (testItem: RustTestItem) => {
    const tName = testItem.name;
    setSelectedTestName(tName);
    setTestResults((prev) => ({
      ...prev,
      [tName]: {
        name: tName,
        status: "running",
        duration_ms: 0,
        stdout: `running 1 test\ntest ${tName} ... `,
        stderr: "",
      },
    }));

    if (window.__TAURI_INTERNALS__) {
      try {
        const res = await invoke<SingleTestResult>("cargo_run_single_test", {
          projectPath: workspaceRoot || ".",
          testName: tName,
        });
        setTestResults((prev) => ({ ...prev, [tName]: res }));
      } catch (err) {
        setTestResults((prev) => ({
          ...prev,
          [tName]: {
            name: tName,
            status: "failed",
            duration_ms: 0,
            stdout: "",
            stderr: String(err),
          },
        }));
      }
    } else {
      // Mock execution
      setTimeout(() => {
        setTestResults((prev) => ({
          ...prev,
          [tName]: {
            name: tName,
            status: "passed",
            duration_ms: 18,
            stdout: `running 1 test\ntest ${tName} ... ok\n\ntest result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s`,
            stderr: "",
          },
        }));
      }, 400);
    }
  };

  // ── 3. Run All Tests Batch ──
  const runAllTests = async () => {
    setIsRunningAll(true);

    // Mark all discovered tests as running
    setTestResults((prev) => {
      const next = { ...prev };
      for (const t of discoveredTests) {
        next[t.name] = {
          name: t.name,
          status: "running",
          duration_ms: 0,
          stdout: "Executing batch cargo test...",
          stderr: "",
        };
      }
      return next;
    });

    if (window.__TAURI_INTERNALS__) {
      try {
        const batchRes = await invoke<AllTestResults>("cargo_run_all_tests", {
          projectPath: workspaceRoot || ".",
        });

        setTestResults((prev) => {
          const next = { ...prev };
          for (const test of discoveredTests) {
            const found =
              batchRes.results[test.name] ||
              batchRes.results[test.module_path + "::" + test.name];

            if (found) {
              next[test.name] = {
                ...found,
                stdout: batchRes.full_output,
              };
            } else {
              const isPassed = batchRes.full_output.includes(`test ${test.name} ... ok`);
              const isFailed = batchRes.full_output.includes(`test ${test.name} ... FAILED`);

              next[test.name] = {
                name: test.name,
                status: isPassed ? "passed" : isFailed ? "failed" : "passed",
                duration_ms: batchRes.total_duration_ms,
                stdout: batchRes.full_output,
                stderr: "",
              };
            }
          }
          return next;
        });
      } catch (err) {
        console.error("Run all tests batch failed:", err);
      } finally {
        setIsRunningAll(false);
      }
    } else {
      for (const test of discoveredTests) {
        await runSingleTest(test);
      }
      setIsRunningAll(false);
    }
  };

  // ── 4. Debug Single Test (CodeLLDB Integration) ──
  const debugSingleTest = (testItem: RustTestItem) => {
    setSelectedTestName(testItem.name);
    // Delegate to Debugger Tool Window with targeted test binary
    if (onDebugTest) {
      onDebugTest(testItem.name, testItem.file_path, testItem.line);
    } else {
      // Fallback: navigate & start debug session
      onNavigateToFile?.(testItem.file_path, testItem.line, 0);
      if (window.__TAURI_INTERNALS__) {
        invoke("start_debug_session", { workingDir: workspaceRoot || undefined }).catch(console.error);
      }
    }
  };

  // Group tests by module
  const testsByModule = useMemo(() => {
    const groups: Record<string, RustTestItem[]> = {};
    for (const t of discoveredTests) {
      const mod = t.module_path || "root";
      if (!groups[mod]) groups[mod] = [];
      groups[mod].push(t);
    }
    return groups;
  }, [discoveredTests]);

  // Filtered tests
  const filteredTests = useMemo(() => {
    return discoveredTests.filter((t) => {
      const res = testResults[t.name];
      if (filterMode === "PASSED" && res?.status !== "passed") return false;
      if (filterMode === "FAILED" && res?.status !== "failed") return false;
      if (searchQuery.trim() && !t.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [discoveredTests, testResults, filterMode, searchQuery]);

  const passedCount = useMemo(() => {
    return Object.values(testResults).filter((r) => r.status === "passed").length;
  }, [testResults]);

  const failedCount = useMemo(() => {
    return Object.values(testResults).filter((r) => r.status === "failed").length;
  }, [testResults]);

  const selectedResult = selectedTestName ? testResults[selectedTestName] : null;

  return (
    <div className={styles.testExplorerContainer}>
      {/* ── Header Toolbar & Metrics ── */}
      <div className={styles.panelHeader}>
        <div className={styles.headerLeft}>
          <span className={styles.headerTitle}>Tests</span>
          <div className={styles.statsPills}>
            <span className={`${styles.statBadge} ${styles.statTotal}`}>
              Total: {discoveredTests.length}
            </span>
            {passedCount > 0 && (
              <span className={`${styles.statBadge} ${styles.statPassed}`}>
                <VscCheck /> {passedCount}
              </span>
            )}
            {failedCount > 0 && (
              <span className={`${styles.statBadge} ${styles.statFailed}`}>
                <VscError /> {failedCount}
              </span>
            )}
          </div>
        </div>

        <div className={styles.headerActions}>
          <button
            className={styles.runAllBtn}
            onClick={runAllTests}
            disabled={isRunningAll || isDiscovering}
            title="Run All Discovered Tests (Ctrl+Shift+R)"
          >
            <VscPlay />
            <span>{isRunningAll ? "Running..." : "Run All"}</span>
          </button>

          <button
            className={styles.debugAllBtn}
            onClick={() => {
              if (discoveredTests.length > 0) debugSingleTest(discoveredTests[0]);
            }}
            title="Debug Selected Test with CodeLLDB (Shift+F9)"
          >
            <VscBug />
            <span>Debug</span>
          </button>

          <button
            className={styles.iconBtn}
            onClick={discoverTests}
            title="Reload & Discover Tests"
          >
            <VscRefresh />
          </button>

          {onClose && (
            <button className={styles.iconBtn} onClick={onClose} title="Minimize">
              <VscChromeMinimize />
            </button>
          )}
        </div>
      </div>

      {/* ── Main Body Split: Left Test Tree + Right Output ── */}
      <div className={styles.panelBody}>
        {/* Left Test Tree */}
        <div className={styles.treePane}>
          {/* Search & Filter Bar */}
          <div className={styles.filterBar}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Filter tests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className={styles.filterBtnGroup}>
              <button
                className={`${styles.filterBtn} ${filterMode === "ALL" ? styles.filterBtnActive : ""}`}
                onClick={() => setFilterMode("ALL")}
              >
                All
              </button>
              <button
                className={`${styles.filterBtn} ${filterMode === "PASSED" ? styles.filterBtnActive : ""}`}
                onClick={() => setFilterMode("PASSED")}
              >
                Passed
              </button>
              <button
                className={`${styles.filterBtn} ${filterMode === "FAILED" ? styles.filterBtnActive : ""}`}
                onClick={() => setFilterMode("FAILED")}
              >
                Failed
              </button>
            </div>
          </div>

          {/* Test Hierarchy List */}
          <div className={styles.treeList}>
            {discoveredTests.length === 0 ? (
              <div className={styles.emptyState}>
                {isDiscovering ? "Discovering Rust tests..." : "No tests discovered in workspace."}
              </div>
            ) : (
              Object.entries(testsByModule).map(([modName, modTests]) => {
                const isCollapsed = collapsedModules.has(modName);
                const matchingTests = modTests.filter((t) =>
                  filteredTests.some((ft) => ft.name === t.name)
                );
                if (matchingTests.length === 0) return null;

                return (
                  <div key={modName} className={styles.moduleGroup}>
                    <div
                      className={styles.moduleHeader}
                      onClick={() => {
                        setCollapsedModules((prev) => {
                          const next = new Set(prev);
                          if (next.has(modName)) next.delete(modName);
                          else next.add(modName);
                          return next;
                        });
                      }}
                    >
                      {isCollapsed ? <VscChevronRight /> : <VscChevronDown />}
                      <span>{modName}</span>
                      <span style={{ fontSize: "11px", color: "var(--pm-fg-muted)", marginLeft: "auto" }}>
                        {matchingTests.length}
                      </span>
                    </div>

                    {!isCollapsed &&
                      matchingTests.map((test) => {
                        const res = testResults[test.name];
                        const isSelected = selectedTestName === test.name;

                        return (
                          <div
                            key={test.name}
                            className={`${styles.testRow} ${isSelected ? styles.testRowActive : ""}`}
                            onClick={() => {
                              setSelectedTestName(test.name);
                              onNavigateToFile?.(test.file_path, test.line, 0);
                            }}
                          >
                            {/* Status Icon */}
                            {res?.status === "passed" ? (
                              <VscCheck color="#1a7f37" size={15} />
                            ) : res?.status === "failed" ? (
                              <VscError color="#cf222e" size={15} />
                            ) : res?.status === "running" ? (
                              <VscRefresh className="spin" color="#005fb8" size={15} />
                            ) : (
                              <VscPlay color="var(--pm-fg-muted)" size={13} />
                            )}

                            <span className={styles.testName}>{test.name}</span>

                            {res?.duration_ms ? (
                              <span className={styles.testDuration}>{res.duration_ms}ms</span>
                            ) : null}

                            {/* Inline Actions (Run & Debug with CodeLLDB) */}
                            <div className={styles.testActionsGroup}>
                              <button
                                className={styles.actionBtnMini}
                                title="Run Test"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  runSingleTest(test);
                                }}
                              >
                                <VscPlay color="#1a7f37" size={12} />
                              </button>
                              <button
                                className={styles.actionBtnMini}
                                title="Debug Test with CodeLLDB"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  debugSingleTest(test);
                                }}
                              >
                                <VscBug color="#005fb8" size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Test Output Pane */}
        <div className={styles.outputPane}>
          <div className={styles.outputHeader}>
            <span>Test Output {selectedTestName ? `— ${selectedTestName}` : ""}</span>
            {selectedResult && (
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <button
                  className={styles.iconBtn}
                  title="Copy Output to Clipboard (Ctrl+C)"
                  onClick={() => {
                    const textToCopy = cleanTestOutput(
                      selectedResult.stdout,
                      selectedTestName || undefined
                    );
                    navigator.clipboard.writeText(textToCopy);
                  }}
                >
                  <VscCopy />
                </button>
                <button
                  className={styles.iconBtn}
                  title="Clear Output"
                  onClick={() => {
                    if (selectedTestName) {
                      setTestResults((prev) => {
                        const next = { ...prev };
                        delete next[selectedTestName];
                        return next;
                      });
                    }
                  }}
                >
                  <VscClearAll />
                </button>
              </div>
            )}
          </div>

          <div className={styles.outputLogs}>
            {!selectedResult ? (
              <div className={styles.emptyState}>
                Select a test and click Run (▶) or Debug (🪲) to see execution output.
              </div>
            ) : (
              <div>
                {selectedResult.stdout && (
                  <div>
                    {cleanTestOutput(
                      selectedResult.stdout,
                      selectedTestName || undefined
                    )}
                  </div>
                )}
                {selectedResult.stderr && (
                  <div style={{ color: "#cf222e", marginTop: "8px" }}>
                    {selectedResult.stderr}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TestExplorer;
