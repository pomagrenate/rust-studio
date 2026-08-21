/**
 * DebugPanel.tsx — JetBrains RustRover Style Debugger Tool Window
 * Integrated with CodeLLDB (pomai-debugger) DAP backend.
 *
 * Strict Execution State & Visual Transparency:
 * - When NOT running: Rerun, Pause, Stop, and Stepping controls are disabled & transparent.
 * - When Running: Rerun and Stop are enabled; Pause/Resume and Stepping adapt dynamically to pause state.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  VscPlay,
  VscDebugPause,
  VscDebugRestart,
  VscDebugStop,
  VscDebugStepOver,
  VscDebugStepInto,
  VscDebugStepOut,
  VscDebugContinue,
  VscSymbolMethod,
  VscDebugBreakpointLog,
  VscChromeMinimize,
  VscEllipsis,
  VscClearAll
} from "react-icons/vsc";
import styles from "./DebugPanel.module.css";

export interface StackFrame {
  id: number;
  name: string;
  file: string;
  line: number;
  column: number;
}

export interface DebugVariable {
  name: string;
  type: string;
  value: string;
}

export interface DebugStateChange {
  isRunning: boolean;
  isPaused: boolean;
  activeFile?: string;
  activeLine?: number;
  inlineValues?: Record<number, string>;
}

export interface DebugPanelProps {
  onClose?: () => void;
  onNavigateToFile?: (filePath: string, line: number, column: number) => void;
  onDebugStateChange?: (state: DebugStateChange) => void;
  workspaceRoot?: string;
}

export const DebugPanel = React.memo(function DebugPanel({ onClose, onNavigateToFile, onDebugStateChange, workspaceRoot }: DebugPanelProps) {
  const [activeTab, setActiveTab] = useState<"debugger" | "console">("debugger");
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedFrameId, setSelectedFrameId] = useState<number>(0);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([
    "Pomai Studio Debug Engine — CodeLLDB DAP Backend Initialized.",
    "Ready to debug. Click Start/Play to begin debug session.",
  ]);
  const [promptInput, setPromptInput] = useState("");

  const [frames, setFrames] = useState<StackFrame[]>([]);
  const [variables, setVariables] = useState<DebugVariable[]>([]);

  // Step-through simulation interval ref
  const stepIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepLineRef = useRef<number>(0);
  const stepFileRef = useRef<string>("src/main.rs");

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Notify parent of debug state changes
  const emitState = useCallback((
    running: boolean,
    paused: boolean,
    file?: string,
    line?: number,
    inlineVals?: Record<number, string>
  ) => {
    onDebugStateChange?.({ isRunning: running, isPaused: paused, activeFile: file, activeLine: line, inlineValues: inlineVals });
  }, [onDebugStateChange]);

  // Step-Through Simulation for browser preview mode
  const startStepSimulation = useCallback((startFile: string, startLine: number, framesList: StackFrame[]) => {
    stepFileRef.current = startFile;
    stepLineRef.current = startLine;

    stepIntervalRef.current = setInterval(() => {
      stepLineRef.current += 1;

      // Pick file from active frame cycling
      const activeFrame = framesList[Math.floor(stepLineRef.current / 10) % framesList.length];
      const currentFile = activeFrame?.file ?? startFile;
      stepFileRef.current = currentFile;

      const mockVars: Record<number, string> = {
        [stepLineRef.current]: `i = ${stepLineRef.current - startLine}, result = Ok(...)`,
      };

      onNavigateToFile?.(currentFile, stepLineRef.current + 1, 1);
      emitState(true, false, currentFile, stepLineRef.current, mockVars);
      setConsoleLogs(prev => [
        ...prev,
        `  → ${currentFile}:${stepLineRef.current + 1}  i = ${stepLineRef.current - startLine}`,
      ]);
    }, 900);
  }, [onNavigateToFile, emitState]);

  const stopStepSimulation = useCallback(() => {
    if (stepIntervalRef.current) {
      clearInterval(stepIntervalRef.current);
      stepIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopStepSimulation();
  }, [stopStepSimulation]);

  // Listen to DAP events from Rust core
  useEffect(() => {
    let unlistenEvent: UnlistenFn | null = null;
    let unlistenTerm: UnlistenFn | null = null;

    if (window.__TAURI_INTERNALS__) {
      listen<string>("dap-event", (event) => {
        setConsoleLogs((prev) => [...prev, event.payload]);
      }).then((u) => {
        unlistenEvent = u;
      });

      listen("dap-terminated", () => {
        setIsRunning(false);
        setIsPaused(false);
        setFrames([]);
        setVariables([]);
        setConsoleLogs((prev) => [...prev, "[Debug Session Terminated]"]);
      }).then((u) => {
        unlistenTerm = u;
      });
    }

    return () => {
      if (unlistenEvent) unlistenEvent();
      if (unlistenTerm) unlistenTerm();
    };
  }, []);

  useEffect(() => {
    if (activeTab === "console" && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [consoleLogs, activeTab]);

  // ── 1. Start Debug Session (CodeLLDB) ──
  const handleStartDebug = async () => {
    setIsRunning(true);
    setIsPaused(false);
    setConsoleLogs((prev) => [...prev, `[Launching pomai-debugger target: 'main' (dev profile)]`]);

    // Initial default frames & variables upon start
    const initialFrames: StackFrame[] = [
      { id: 0, name: "main::run_app", file: "src/main.rs", line: 24, column: 5 },
      { id: 1, name: "tokio::runtime::task::core", file: "tokio/runtime.rs", line: 182, column: 12 },
      { id: 2, name: "std::sys::windows::thread", file: "std/thread.rs", line: 95, column: 8 },
    ];
    setFrames(initialFrames);

    setVariables([
      { name: "workspace_root", type: "&str", value: `"${workspaceRoot || "E:/GithubProjects/pomai-studio"}"` },
      { name: "active_threads", type: "usize", value: "4" },
      { name: "is_initialized", type: "bool", value: "true" },
      { name: "buffer_len", type: "u64", value: "1024" },
    ]);

    // Emit start state and begin step simulation (browser mode)
    emitState(true, false, "src/main.rs", 23);
    if (!window.__TAURI_INTERNALS__) {
      // In browser/preview mode: simulate step-through execution
      onNavigateToFile?.("src/main.rs", 24, 5);
      startStepSimulation("src/main.rs", 23, initialFrames);
    } else {
      try {
        await invoke("start_debug_session", { workingDir: workspaceRoot || undefined });
      } catch (e) {
        setConsoleLogs((prev) => [...prev, `[Error] ${e}`]);
        setIsRunning(false);
        emitState(false, false);
      }
    }
  };

  // ── 2. Stop Debug Session ──
  const handleStopDebug = async () => {
    if (!isRunning) return;
    stopStepSimulation();
    setIsRunning(false);
    setIsPaused(false);
    setFrames([]);
    setVariables([]);
    setConsoleLogs((prev) => [...prev, `[Debug session stopped]`]);
    emitState(false, false);

    if (window.__TAURI_INTERNALS__) {
      try {
        await invoke("stop_debug_session");
      } catch (e) {
        console.error(e);
      }
    }
  };

  // ── 3. Rerun / Restart Session ──
  const handleRerunDebug = async () => {
    if (!isRunning) return;
    setConsoleLogs((prev) => [...prev, `[Restarting debug session...]`]);
    await handleStopDebug();
    setTimeout(() => {
      handleStartDebug();
    }, 200);
  };

  // ── 4. Resume / Pause / Stepping Controls ──
  const handleResume = async () => {
    if (!isRunning || !isPaused) return;
    setIsPaused(false);
    setConsoleLogs((prev) => [...prev, `[Program Resumed (F9)]`]);

    if (window.__TAURI_INTERNALS__) {
      try {
        await invoke("send_dap_request", {
          payload: JSON.stringify({
            seq: Date.now(),
            type: "request",
            command: "continue",
            arguments: { threadId: 1 },
          }),
        });
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handlePause = async () => {
    if (!isRunning || isPaused) return;
    setIsPaused(true);
    setConsoleLogs((prev) => [...prev, `[Program Paused (Break)]`]);

    if (window.__TAURI_INTERNALS__) {
      try {
        await invoke("send_dap_request", {
          payload: JSON.stringify({
            seq: Date.now(),
            type: "request",
            command: "pause",
            arguments: { threadId: 1 },
          }),
        });
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleStepOver = async () => {
    if (!isRunning || !isPaused) return;
    setConsoleLogs((prev) => [...prev, `[Step Over (F8)]`]);
    if (window.__TAURI_INTERNALS__) {
      try {
        await invoke("send_dap_request", {
          payload: JSON.stringify({
            seq: Date.now(),
            type: "request",
            command: "next",
            arguments: { threadId: 1 },
          }),
        });
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleStepInto = async () => {
    if (!isRunning || !isPaused) return;
    setConsoleLogs((prev) => [...prev, `[Step Into (F7)]`]);
    if (window.__TAURI_INTERNALS__) {
      try {
        await invoke("send_dap_request", {
          payload: JSON.stringify({
            seq: Date.now(),
            type: "request",
            command: "stepIn",
            arguments: { threadId: 1 },
          }),
        });
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleStepOut = async () => {
    if (!isRunning || !isPaused) return;
    setConsoleLogs((prev) => [...prev, `[Step Out (Shift+F8)]`]);
    if (window.__TAURI_INTERNALS__) {
      try {
        await invoke("send_dap_request", {
          payload: JSON.stringify({
            seq: Date.now(),
            type: "request",
            command: "stepOut",
            arguments: { threadId: 1 },
          }),
        });
      } catch (e) {
        console.error(e);
      }
    }
  };

  // ── 5. Interactive (lldb) Prompt Evaluation ──
  const handleSendPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim()) return;

    const cmd = promptInput.trim();
    setConsoleLogs((prev) => [...prev, `(lldb) ${cmd}`]);
    setPromptInput("");

    if (window.__TAURI_INTERNALS__) {
      try {
        const payload = JSON.stringify({
          seq: Date.now(),
          type: "request",
          command: "evaluate",
          arguments: { expression: cmd, context: "repl" },
        });
        await invoke("send_dap_request", { payload });
      } catch (err) {
        setConsoleLogs((prev) => [...prev, `[DAP Error] ${err}`]);
      }
    } else {
      // Browser mock response
      if (cmd.startsWith("p ")) {
        setConsoleLogs((prev) => [...prev, `${cmd.slice(2)} = (usize) 42`]);
      } else {
        setConsoleLogs((prev) => [...prev, `Executed: ${cmd}`]);
      }
    }
  };

  return (
    <div className={styles.debugPanelContainer}>
      {/* ── Header: Subtabs, Stepping Controls & Actions ── */}
      <div className={styles.panelHeader}>
        <div className={styles.headerLeft}>
          <span className={styles.headerTitleBadge}>Debug</span>
          <span
            style={{
              fontSize: "11px",
              padding: "1px 6px",
              borderRadius: "4px",
              backgroundColor: isRunning
                ? isPaused
                  ? "#9a6700"
                  : "#1a7f37"
                : "rgba(128,128,128,0.15)",
              color: isRunning ? "#ffffff" : "inherit",
              fontWeight: 500,
            }}
          >
            {isRunning ? (isPaused ? "Paused" : "Running") : "Ready"}
          </span>

          <div className={styles.subTabsList}>
            <button
              className={`${styles.subTab} ${activeTab === "debugger" ? styles.subTabActive : ""}`}
              onClick={() => setActiveTab("debugger")}
            >
              <span>Debugger</span>
            </button>
            <button
              className={`${styles.subTab} ${activeTab === "console" ? styles.subTabActive : ""}`}
              onClick={() => setActiveTab("console")}
            >
              <span>Console</span>
            </button>
          </div>
        </div>

        {/* Stepping Controls Toolbar (Transparent & disabled when not paused/running) */}
        <div className={styles.headerCenter}>
          <div className={styles.steppingToolbar}>
            <button
              className={`${styles.steppingBtn} ${
                !isRunning || !isPaused ? styles.btnDisabled : ""
              }`}
              title="Step Over (F8)"
              disabled={!isRunning || !isPaused}
              onClick={handleStepOver}
            >
              <VscDebugStepOver />
            </button>
            <button
              className={`${styles.steppingBtn} ${
                !isRunning || !isPaused ? styles.btnDisabled : ""
              }`}
              title="Step Into (F7)"
              disabled={!isRunning || !isPaused}
              onClick={handleStepInto}
            >
              <VscDebugStepInto />
            </button>
            <button
              className={`${styles.steppingBtn} ${
                !isRunning || !isPaused ? styles.btnDisabled : ""
              }`}
              title="Step Out (Shift+F8)"
              disabled={!isRunning || !isPaused}
              onClick={handleStepOut}
            >
              <VscDebugStepOut />
            </button>
            <button
              className={`${styles.steppingBtn} ${
                !isRunning || !isPaused ? styles.btnDisabled : ""
              }`}
              title="Run to Cursor (Alt+F9)"
              disabled={!isRunning || !isPaused}
              onClick={handleResume}
            >
              <VscDebugContinue />
            </button>
            <button
              className={`${styles.steppingBtn} ${!isRunning ? styles.btnDisabled : ""}`}
              title="Evaluate Expression (Alt+F8)"
              disabled={!isRunning}
              onClick={() => setActiveTab("console")}
            >
              <VscSymbolMethod />
            </button>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className={styles.headerRight}>
          <button className={styles.iconBtn} title="More Actions">
            <VscEllipsis />
          </button>
          {onClose && (
            <button
              className={styles.iconBtn}
              onClick={onClose}
              title="Minimize Debug Tool Window"
            >
              <VscChromeMinimize />
            </button>
          )}
        </div>
      </div>

      {/* ── Main Body Split: Left Action Toolbar + Content ── */}
      <div className={styles.panelBody}>
        {/* Left Vertical Actions */}
        <div className={styles.leftActionBar}>
          {/* Rerun Button: Only enabled when running, transparent when not running */}
          <button
            className={`${styles.actionToolBtn} ${!isRunning ? styles.btnDisabled : ""}`}
            title="Rerun 'main' (Shift+F9)"
            disabled={!isRunning}
            onClick={handleRerunDebug}
          >
            <VscDebugRestart />
          </button>

          {/* Start / Resume Button: Starts debug when not running, resumes when paused */}
          {!isRunning ? (
            <button
              className={styles.actionToolBtn}
              title="Start Debug Session (F5)"
              onClick={handleStartDebug}
            >
              <VscPlay color="#388a34" />
            </button>
          ) : (
            <button
              className={`${styles.actionToolBtn} ${!isPaused ? styles.btnDisabled : ""}`}
              title="Resume Program (F9)"
              disabled={!isPaused}
              onClick={handleResume}
            >
              <VscPlay color="#388a34" />
            </button>
          )}

          {/* Pause Button: Enabled only when running and not already paused */}
          <button
            className={`${styles.actionToolBtn} ${
              !isRunning || isPaused ? styles.btnDisabled : ""
            }`}
            title="Pause Program"
            disabled={!isRunning || isPaused}
            onClick={handlePause}
          >
            <VscDebugPause color="#0078d4" />
          </button>

          {/* Stop Button: Enabled only when running, transparent when not running */}
          <button
            className={`${styles.actionToolBtn} ${!isRunning ? styles.btnDisabled : ""}`}
            title="Stop Debugging (Ctrl+F2)"
            disabled={!isRunning}
            onClick={handleStopDebug}
          >
            <VscDebugStop color="#cf222e" />
          </button>

          <div className={styles.actionDivider} />

          <button
            className={styles.actionToolBtn}
            title="View Breakpoints (Ctrl+Shift+F8)"
            onClick={() => {}}
          >
            <VscDebugBreakpointLog color="#cf222e" />
          </button>
          <button
            className={styles.actionToolBtn}
            title="Clear Console Buffer"
            onClick={() => setConsoleLogs([])}
          >
            <VscClearAll />
          </button>
        </div>

        {/* Debugger View (Frames + Variables) */}
        {activeTab === "debugger" && (
          <div className={styles.debuggerSplitView}>
            {/* Frames / Call Stack */}
            <div className={styles.framesPane}>
              <div className={styles.paneHeader}>
                <span>Frames (Call Stack)</span>
              </div>
              <div className={styles.framesList}>
                {frames.length === 0 ? (
                  <div className={styles.emptyState}>
                    {isRunning ? "Running..." : "No active debug session"}
                  </div>
                ) : (
                  frames.map((frame) => (
                    <div
                      key={frame.id}
                      className={`${styles.frameItem} ${
                        selectedFrameId === frame.id ? styles.frameItemActive : ""
                      }`}
                      onClick={() => {
                        setSelectedFrameId(frame.id);
                        onNavigateToFile?.(frame.file, frame.line, frame.column);
                      }}
                    >
                      <span className={styles.frameIndex}>{frame.id}</span>
                      <span className={styles.frameFunction}>{frame.name}</span>
                      <span className={styles.frameLocation}>
                        {frame.file}:{frame.line}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Variables & Watches */}
            <div className={styles.variablesPane}>
              <div className={styles.paneHeader}>
                <span>Variables</span>
              </div>
              <div className={styles.variablesTree}>
                {variables.length === 0 ? (
                  <div className={styles.emptyState}>
                    {isRunning ? "Collecting variables..." : "No variables to inspect"}
                  </div>
                ) : (
                  variables.map((v) => (
                    <div key={v.name} className={styles.variableRow}>
                      <span className={styles.varName}>{v.name}</span>
                      <span className={styles.varType}>: {v.type}</span>
                      <span className={styles.varValue}>{v.value}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Interactive LLDB Console View */}
        {activeTab === "console" && (
          <div className={styles.consoleContainer}>
            <div className={styles.consoleLogs}>
              {consoleLogs.map((line, idx) => (
                <div key={idx} className={styles.consoleLine}>
                  {line}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>

            {/* Interactive LLDB Prompt Bar */}
            <form className={styles.consolePromptBar} onSubmit={handleSendPrompt}>
              <span className={styles.promptPrefix}>(lldb)</span>
              <input
                type="text"
                className={styles.promptInput}
                placeholder={
                  isRunning
                    ? "Evaluate expression or enter LLDB command..."
                    : "Start debug session to evaluate expressions in LLDB..."
                }
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
              />
            </form>
          </div>
        )}
      </div>
    </div>
  );
});

export default DebugPanel;
