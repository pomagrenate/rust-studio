import { useState, useEffect, useCallback } from "react";
import {
  VscPlay,
  VscGear,
  VscCheck,
  VscBeaker,
  VscLightbulb,
  VscSparkle,
  VscError,
  VscWarning,
  VscPackage
} from "react-icons/vsc";
import { CargoProvider, CargoProjectInfo, CargoDiagnostic } from "../../extensions/builtin/rust/CargoProvider";
import styles from "./CargoToolbar.module.css";

interface CargoToolbarProps {
  workspaceRoot?: string;
  onOpenProblems?: () => void;
  onDiagnosticsUpdate?: (diagnostics: CargoDiagnostic[]) => void;
  onOutputMessage?: (title: string, output: string) => void;
  onRunCommand?: (cmd: "run" | "build" | "test" | "check" | "clippy", profile?: "dev" | "release") => void;
}

export function CargoToolbar({
  workspaceRoot,
  onOpenProblems,
  onDiagnosticsUpdate,
  onOutputMessage,
  onRunCommand,
}: CargoToolbarProps) {
  const [projectInfo, setProjectInfo] = useState<CargoProjectInfo | null>(null);
  const [profile, setProfile] = useState<"dev" | "release">("dev");
  const [diagnostics, setDiagnostics] = useState<CargoDiagnostic[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  // Load project info
  const loadProject = useCallback(async () => {
    if (!workspaceRoot) {
      setProjectInfo(null);
      return;
    }
    const info = await CargoProvider.getProjectInfo(workspaceRoot);
    setProjectInfo(info);
  }, [workspaceRoot]);

  // Check diagnostics periodically or on project change
  const runCheck = useCallback(async () => {
    if (!workspaceRoot) return;
    setIsRunning(true);
    try {
      const diags = await CargoProvider.checkDiagnostics(workspaceRoot);
      setDiagnostics(diags);
      onDiagnosticsUpdate?.(diags);
    } finally {
      setIsRunning(false);
    }
  }, [workspaceRoot, onDiagnosticsUpdate]);

  useEffect(() => {
    loadProject();
    runCheck();
  }, [loadProject, runCheck]);

  const handleRun = async () => {
    if (onRunCommand) {
      onRunCommand("run", profile);
      return;
    }
    if (!workspaceRoot) return;
    setIsRunning(true);
    try {
      const res = await CargoProvider.runCommand(workspaceRoot, "run", profile);
      onOutputMessage?.(`Cargo Run (${profile})`, `${res.stdout}\n${res.stderr}`);
      if (res.diagnostics.length > 0) {
        setDiagnostics(res.diagnostics);
        onDiagnosticsUpdate?.(res.diagnostics);
      }
    } finally {
      setIsRunning(false);
    }
  };

  const handleBuild = async () => {
    if (onRunCommand) {
      onRunCommand("build", profile);
      return;
    }
    if (!workspaceRoot) return;
    setIsRunning(true);
    try {
      const res = await CargoProvider.runCommand(workspaceRoot, "build", profile);
      onOutputMessage?.(`Cargo Build (${profile})`, `${res.stdout}\n${res.stderr}`);
      if (res.diagnostics.length > 0) {
        setDiagnostics(res.diagnostics);
        onDiagnosticsUpdate?.(res.diagnostics);
      }
    } finally {
      setIsRunning(false);
    }
  };

  const handleTest = async () => {
    if (onRunCommand) {
      onRunCommand("test", profile);
      return;
    }
    if (!workspaceRoot) return;
    setIsRunning(true);
    try {
      const res = await CargoProvider.runCommand(workspaceRoot, "test", profile);
      onOutputMessage?.("Cargo Test", `${res.stdout}\n${res.stderr}`);
      if (res.diagnostics.length > 0) {
        setDiagnostics(res.diagnostics);
        onDiagnosticsUpdate?.(res.diagnostics);
      }
    } finally {
      setIsRunning(false);
    }
  };

  const handleClippy = async () => {
    if (onRunCommand) {
      onRunCommand("clippy", profile);
      return;
    }
    if (!workspaceRoot) return;
    setIsRunning(true);
    try {
      const res = await CargoProvider.runCommand(workspaceRoot, "clippy", profile);
      onOutputMessage?.("Cargo Clippy", `${res.stdout}\n${res.stderr}`);
      if (res.diagnostics.length > 0) {
        setDiagnostics(res.diagnostics);
        onDiagnosticsUpdate?.(res.diagnostics);
      }
    } finally {
      setIsRunning(false);
    }
  };

  const handleFormat = async () => {
    if (!workspaceRoot) return;
    await CargoProvider.format(workspaceRoot);
    onOutputMessage?.("Rustfmt", "Formatted workspace code");
  };

  if (!projectInfo?.is_cargo_project) {
    return null;
  }

  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warnCount = diagnostics.filter((d) => d.severity === "warning").length;

  return (
    <div className={styles.cargoToolbar} role="toolbar" aria-label="Rust Cargo Toolbar">
      {/* Target Selector */}
      <div className={styles.targetSelector} title="Active Cargo Package Target">
        <VscPackage color="#e58e26" />
        <span>{projectInfo.package_name || "Rust Project"}</span>
        {projectInfo.bin_targets.length > 0 && <span>(bin)</span>}
      </div>

      {/* Profile Toggle (dev / release) */}
      <div className={styles.profileToggle}>
        <button
          className={`${styles.profileBtn} ${profile === "dev" ? styles.profileBtnActive : ""}`}
          onClick={() => setProfile("dev")}
          title="Debug profile (fast compilation)"
        >
          dev
        </button>
        <button
          className={`${styles.profileBtn} ${profile === "release" ? styles.profileBtnActive : ""}`}
          onClick={() => setProfile("release")}
          title="Release profile (maximum optimization)"
        >
          release
        </button>
      </div>

      <div className={styles.divider} />

      {/* Run Action */}
      <button
        className={styles.runBtn}
        onClick={handleRun}
        disabled={isRunning}
        title="Run Cargo Binary (Shift+F10)"
      >
        <VscPlay />
        <span>Run</span>
      </button>

      {/* Build Action */}
      <button
        className={styles.actionBtn}
        onClick={handleBuild}
        disabled={isRunning}
        title="Build Cargo Project (Ctrl+F9)"
      >
        <VscGear />
        <span>Build</span>
      </button>

      {/* Check Action */}
      <button
        className={styles.actionBtn}
        onClick={runCheck}
        disabled={isRunning}
        title="Cargo Check (Fast type check)"
      >
        <VscCheck />
        <span>Check</span>
      </button>

      {/* Test Action */}
      <button
        className={styles.actionBtn}
        onClick={handleTest}
        disabled={isRunning}
        title="Cargo Test (Run all unit and integration tests)"
      >
        <VscBeaker />
        <span>Test</span>
      </button>

      {/* Clippy Action */}
      <button
        className={styles.actionBtn}
        onClick={handleClippy}
        disabled={isRunning}
        title="Run Cargo Clippy (Rust Linter & Best Practices)"
      >
        <VscLightbulb />
        <span>Clippy</span>
      </button>

      {/* Format Action */}
      <button
        className={styles.actionBtn}
        onClick={handleFormat}
        disabled={isRunning}
        title="Format with Rustfmt (Shift+Alt+F)"
      >
        <VscSparkle />
        <span>Format</span>
      </button>

      {/* Diagnostics Counter Badge */}
      <div
        className={styles.diagnosticsBadge}
        onClick={onOpenProblems}
        title="Open Compiler Diagnostics & Problems"
      >
        <span className={styles.errorItem}>
          <VscError /> {errorCount}
        </span>
        <span className={styles.warningItem}>
          <VscWarning /> {warnCount}
        </span>
      </div>
    </div>
  );
}

export default CargoToolbar;
