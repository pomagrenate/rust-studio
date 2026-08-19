import { useState, useEffect } from "react";
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { 
  VscChevronRight, VscChevronDown, 
  VscFolder, VscFolderOpened, VscFile, 
  VscJson, VscMarkdown, VscFileCode 
} from "react-icons/vsc";
import { FaReact, FaRust } from "react-icons/fa";
import { WorkspaceDiagnostics } from "../../extensions/builtin/rust/CargoProvider";
import styles from "./ExplorerNode.module.css";
import type { ClipboardState } from "./ExplorerPane";

export interface FsEntry {
  name: string;
  path: string;
  kind: "file" | "directory" | "symlink" | "unknown";
  size?: number;
  modified?: number;
}

export interface ExplorerNodeProps {
  entry: FsEntry;
  depth: number;
  activeFile?: string;
  selectedFiles?: Set<string>;
  clipboard?: ClipboardState | null;
  diagnostics?: WorkspaceDiagnostics;
  onFileClick: (path: string, isDoubleClick?: boolean, ctrlKey?: boolean) => void;
}

export function ExplorerNode({ 
  entry, 
  depth, 
  activeFile, 
  selectedFiles, 
  clipboard, 
  diagnostics, 
  onFileClick 
}: ExplorerNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [children, setChildren] = useState<FsEntry[] | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);

  if (!entry || !entry.path) {
    return null;
  }

  const isDir = entry.kind === "directory";
  const nodeName = entry.name || entry.path.split(/[/\\]/).pop() || entry.path;

  // Auto-expand this directory and load children when revealing a file inside it
  useEffect(() => {
    if (!entry || !entry.path || !isDir) return;
    const handler = async (e: Event) => {
      const ev = e as CustomEvent<{ path: string }>;
      const filePath = ev.detail.path.replace(/\\/g, "/");
      const normSelf = entry.path.replace(/\\/g, "/");
      // If the target file is inside this directory
      if (filePath.startsWith(normSelf + "/") && filePath !== normSelf) {
        if (children === null) {
          try {
            if (window.__TAURI_INTERNALS__) {
              const res = await invoke<FsEntry[]>("list_dir", { path: entry.path });
              setChildren(res || []);
            }
          } catch {}
        }
        setIsExpanded(true);
        // If the file is a direct child (not deeper), mark it as revealed
        const remaining = filePath.slice(normSelf.length + 1);
        if (!remaining.includes("/")) {
          setIsRevealed(true);
          setTimeout(() => setIsRevealed(false), 2000);
        }
      }
    };
    window.addEventListener("pm:revealFileExpand", handler);
    return () => window.removeEventListener("pm:revealFileExpand", handler);
  }, [entry, isDir, children]);

  // Also handle reveal for file nodes themselves
  useEffect(() => {
    if (!entry || !entry.path || isDir) return;
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ path: string }>;
      const filePath = ev.detail.path.replace(/\\/g, "/");
      const normSelf = entry.path.replace(/\\/g, "/");
      if (filePath === normSelf) {
        setIsRevealed(true);
        setTimeout(() => setIsRevealed(false), 2000);
      }
    };
    window.addEventListener("pm:revealFileExpand", handler);
    return () => window.removeEventListener("pm:revealFileExpand", handler);
  }, [entry, isDir]);

  // Handle expand all nodes recursively
  useEffect(() => {
    if (!entry || !entry.path || !isDir) return;
    const handler = async (e: Event) => {
      const ev = e as CustomEvent<{ rootPath: string }>;
      const normSelf = entry.path.replace(/\\/g, "/");
      const normRoot = ev.detail.rootPath.replace(/\\/g, "/");
      
      // Only expand if this node is under the root path
      if (normSelf.startsWith(normRoot)) {
        // Load children if not loaded
        if (children === null) {
          try {
            if (window.__TAURI_INTERNALS__) {
              const res = await invoke<FsEntry[]>("list_dir", { path: entry.path });
              setChildren(res || []);
            }
          } catch {}
        }
        setIsExpanded(true);
      }
    };
    window.addEventListener("pm:expandAllNodes", handler);
    return () => window.removeEventListener("pm:expandAllNodes", handler);
  }, [entry, isDir, children]);

  // Handle collapse all nodes recursively
  useEffect(() => {
    if (!entry || !entry.path || !isDir) return;
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ rootPath: string }>;
      const normSelf = entry.path.replace(/\\/g, "/");
      const normRoot = ev.detail.rootPath.replace(/\\/g, "/");
      
      // Only collapse if this node is under the root path
      if (normSelf.startsWith(normRoot)) {
        setIsExpanded(false);
      }
    };
    window.addEventListener("pm:collapseAllNodes", handler);
    return () => window.removeEventListener("pm:collapseAllNodes", handler);
  }, [entry, isDir]);

  // Calculate diagnostic errors and warnings safely
  const normPath = (entry.path || "").replace(/\\/g, "/").toLowerCase();
  let errorCount = 0;
  let warningCount = 0;

  if (diagnostics && diagnostics.files) {
    if (isDir) {
      for (const [filePath, summary] of Object.entries(diagnostics.files)) {
        if (!summary) continue;
        const normFile = filePath.replace(/\\/g, "/").toLowerCase();
        if (normFile.startsWith(normPath + "/") || normFile === normPath) {
          errorCount += (summary.errors || 0);
          warningCount += (summary.warnings || 0);
        }
      }
    } else {
      // Find matching entry either by normalized path or exact
      for (const [filePath, summary] of Object.entries(diagnostics.files)) {
        if (!summary) continue;
        const normFile = filePath.replace(/\\/g, "/").toLowerCase();
        if (normFile === normPath || normFile.endsWith("/" + normPath) || normPath.endsWith("/" + normFile)) {
          errorCount = summary.errors || 0;
          warningCount = summary.warnings || 0;
          break;
        }
      }
    }
  }

  // Priority rule: Error strictly overrides Warning
  const hasError = errorCount > 0;
  const hasWarning = !hasError && warningCount > 0;
  const diagClass = hasError ? styles.nodeError : hasWarning ? styles.nodeWarning : "";
  
  let Icon = VscFile;
  let iconClass = styles.iconDefault;
  
  if (isDir) {
    Icon = isExpanded ? VscFolderOpened : VscFolder;
    iconClass = styles.iconFolder;
  } else {
    const ext = nodeName.split('.').pop()?.toLowerCase();
    if (ext === 'tsx' || ext === 'jsx') { Icon = FaReact; iconClass = styles.iconReact; }
    else if (ext === 'ts') { Icon = VscFileCode; iconClass = styles.iconTs; }
    else if (ext === 'json') { Icon = VscJson; iconClass = styles.iconJson; }
    else if (ext === 'css') { Icon = VscFile; iconClass = styles.iconCss; }
    else if (ext === 'rs') { Icon = FaRust; iconClass = styles.iconRust; }
    else if (ext === 'md') { Icon = VscMarkdown; iconClass = styles.iconDefault; }
  }

  const handleClick = async (e: ReactMouseEvent) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      onFileClick(entry.path, false, true);
      return;
    }

    if (isDir) {
      if (!isExpanded && children === null) {
        try {
          if (window.__TAURI_INTERNALS__) {
            const res = await invoke<FsEntry[]>("list_dir", { path: entry.path });
            setChildren(res || []);
          } else {
            setChildren([
              { name: "main.rs", path: `${entry.path}/main.rs`, kind: "file" },
              { name: "lib.rs", path: `${entry.path}/lib.rs`, kind: "file" },
            ]);
          }
        } catch (err) {
          console.error("Failed to list dir", err);
          setChildren([]);
        }
      }
      setIsExpanded(!isExpanded);
    } else {
      onFileClick(entry.path, false, false);
    }
  };

  const handleDoubleClick = (e: ReactMouseEvent) => {
    e.stopPropagation();
    if (!isDir) {
      onFileClick(entry.path, true);
    }
  };

  const handleDragStart = (e: ReactDragEvent) => {
    let dragPaths = [entry.path];
    if (selectedFiles?.has(entry.path)) {
      dragPaths = Array.from(selectedFiles);
    }
    e.dataTransfer.setData("application/json", JSON.stringify(dragPaths));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: ReactDragEvent) => {
    if (isDir) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (e: ReactDragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!isDir) return;

    try {
      const data = e.dataTransfer.getData("application/json");
      if (!data) return;
      const paths: string[] = JSON.parse(data);
      
      for (const src of paths) {
        const filename = src.split(/[/\\]/).pop();
        if (!filename) continue;
        const dest = `${entry.path}/${filename}`;
        if (src !== dest) {
          if (window.__TAURI_INTERNALS__) {
            await invoke("move_path", { src, dest });
          }
        }
      }
      
      if (window.__TAURI_INTERNALS__) {
        const res = await invoke<FsEntry[]>("list_dir", { path: entry.path });
        setChildren(res || []);
      }
      setIsExpanded(true);
      window.dispatchEvent(new Event("pm:refreshExplorer"));
    } catch (err) {
      console.error("Drop failed:", err);
    }
  };

  const isCut = clipboard?.action === "cut" && clipboard.files.has(entry.path);

  return (
    <>
      <div 
        className={`${styles.node} ${activeFile === entry.path ? styles.nodeActive : ""} ${selectedFiles?.has(entry.path) ? styles.nodeSelected : ""} ${isCut ? styles.nodeCut : ""} ${isDragOver ? styles.nodeDragOver : ""} ${diagClass} ${isRevealed ? styles.nodeRevealed : ""}`}
        style={{ paddingLeft: `${depth * 12}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        draggable={true}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        title={hasError ? `${errorCount} error(s) in ${nodeName}` : hasWarning ? `${warningCount} warning(s) in ${nodeName}` : entry.path}
        data-explorer-path={entry.path}
      >
        <div className={styles.chevron}>
          {isDir && (isExpanded ? <VscChevronDown /> : <VscChevronRight />)}
        </div>
        <div className={`${styles.icon} ${iconClass}`}>
          <Icon />
        </div>
        <span className={styles.name}>{nodeName}</span>

        {/* Priority-driven Diagnostic Numeric Badges */}
        {hasError && (
          <span
            className={`${styles.diagBadge} ${styles.badgeError}`}
            title={`${errorCount} error${errorCount > 1 ? "s" : ""}`}
          >
            {errorCount}
          </span>
        )}
        {hasWarning && (
          <span
            className={`${styles.diagBadge} ${styles.badgeWarning}`}
            title={`${warningCount} warning${warningCount > 1 ? "s" : ""}`}
          >
            {warningCount}
          </span>
        )}
      </div>
      
      {isExpanded && children && children.map((child, idx) => (
        <ExplorerNode 
          key={child.path || `${child.name}-${idx}`}
          entry={child} 
          depth={depth + 1} 
          activeFile={activeFile}
          selectedFiles={selectedFiles}
          clipboard={clipboard}
          diagnostics={diagnostics}
          onFileClick={onFileClick}
        />
      ))}
    </>
  );
}

export default ExplorerNode;
