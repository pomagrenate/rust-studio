import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
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

import type { CreationKind } from "./ExplorerPane";

export interface ExplorerNodeProps {
  entry: FsEntry;
  depth: number;
  activeFile?: string;
  selectedFiles?: Set<string>;
  clipboard?: ClipboardState | null;
  diagnostics?: WorkspaceDiagnostics;
  renamingPath?: string | null;
  focusedNodePath?: string | null;
  pendingCreation?: { kind: CreationKind; targetDir: string } | null;
  onResetPendingCreation?: () => void;
  onFileCreated?: (path: string) => void;
  onFileClick: (path: string, isDoubleClick?: boolean, isCtrl?: boolean, isShift?: boolean, isDirectory?: boolean) => void;
  onNodeContextMenu?: (e: ReactMouseEvent, path: string, isDir: boolean) => void;
  onCommitRename?: (oldPath: string, newName: string) => void;
  onCancelRename?: () => void;
}

export const ExplorerNode = React.memo(function ExplorerNode({ 
  entry, 
  depth, 
  activeFile, 
  selectedFiles, 
  clipboard, 
  diagnostics, 
  renamingPath,
  focusedNodePath,
  pendingCreation,
  onResetPendingCreation,
  onFileCreated,
  onFileClick,
  onNodeContextMenu,
  onCommitRename,
  onCancelRename
}: ExplorerNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [children, setChildren] = useState<FsEntry[] | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [renameInput, setRenameInput] = useState("");
  const [creationInputValue, setCreationInputValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const creationInputRef = useRef<HTMLInputElement>(null);

  const isRenaming = renamingPath === entry?.path;
  const isFocused = focusedNodePath === entry?.path;
  const isDir = entry?.kind === "directory";

  const normEntryPath = entry?.path ? entry.path.replace(/\\/g, "/") : "";
  const normTargetDir = pendingCreation?.targetDir ? pendingCreation.targetDir.replace(/\\/g, "/") : "";
  const isCreationTargetingMe = isDir && normTargetDir === normEntryPath;
  const isCreationInsideMe = isDir && normTargetDir.startsWith(normEntryPath + "/") && normTargetDir !== normEntryPath;

  const refreshChildren = useCallback(async () => {
    if (!isDir) return;
    try {
      if (window.__TAURI_INTERNALS__) {
        const res = await invoke<FsEntry[]>("list_dir", { path: entry.path });
        setChildren(res || []);
      }
    } catch (err) {
      console.error("Failed to refresh dir children:", err);
    }
  }, [isDir, entry?.path]);

  useEffect(() => {
    if (!isDir) return;
    const handleRefresh = () => {
      if (isExpanded) {
        refreshChildren();
      }
    };
    window.addEventListener("pm:refreshExplorer", handleRefresh);
    return () => window.removeEventListener("pm:refreshExplorer", handleRefresh);
  }, [isDir, isExpanded, refreshChildren]);

  useEffect(() => {
    if (isCreationTargetingMe) {
      setIsExpanded(true);
      setCreationInputValue("");
      if (children === null) {
        refreshChildren();
      }
      setTimeout(() => {
        creationInputRef.current?.focus();
      }, 50);
    } else if (isCreationInsideMe) {
      setIsExpanded(true);
      if (children === null) {
        refreshChildren();
      }
    }
  }, [isCreationTargetingMe, isCreationInsideMe, children, refreshChildren]);

  useEffect(() => {
    if (isRenaming) {
      const baseName = entry.name || entry.path.split(/[/\\]/).pop() || "";
      setRenameInput(baseName);
      setTimeout(() => {
        if (renameInputRef.current) {
          renameInputRef.current.focus();
          const dotIdx = baseName.lastIndexOf(".");
          if (dotIdx > 0 && entry.kind !== "directory") {
            renameInputRef.current.setSelectionRange(0, dotIdx);
          } else {
            renameInputRef.current.select();
          }
        }
      }, 30);
    }
  }, [isRenaming, entry]);

  if (!entry || !entry.path) {
    return null;
  }

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

  // Calculate diagnostic errors and warnings safely with useMemo
  const { errorCount, warningCount } = useMemo(() => {
    if (!entry?.path || !diagnostics?.files) return { errorCount: 0, warningCount: 0 };
    
    const normPath = entry.path.replace(/\\/g, "/").toLowerCase();
    let errors = 0;
    let warnings = 0;

    if (isDir) {
      for (const [filePath, summary] of Object.entries(diagnostics.files)) {
        if (!summary) continue;
        const normFile = filePath.replace(/\\/g, "/").toLowerCase();
        if (normFile.startsWith(normPath + "/") || normFile === normPath) {
          errors += (summary.errors || 0);
          warnings += (summary.warnings || 0);
        }
      }
    } else {
      for (const [filePath, summary] of Object.entries(diagnostics.files)) {
        if (!summary) continue;
        const normFile = filePath.replace(/\\/g, "/").toLowerCase();
        if (normFile === normPath || normFile.endsWith("/" + normPath) || normPath.endsWith("/" + normFile)) {
          errors = summary.errors || 0;
          warnings = summary.warnings || 0;
          break;
        }
      }
    }

    return { errorCount: errors, warningCount: warnings };
  }, [entry?.path, isDir, diagnostics]);

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
    
    onFileClick(entry.path, false, e.ctrlKey || e.metaKey, e.shiftKey, isDir);

    if (isDir && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
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

  const handleContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onFileClick(entry.path, false, false, false, isDir);
    onNodeContextMenu?.(e, entry.path, isDir);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onCommitRename?.(entry.path, renameInput);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancelRename?.();
    }
  };

  const commitSubfolderCreation = async () => {
    let name = creationInputValue.trim();
    if (!name || !pendingCreation) {
      onResetPendingCreation?.();
      return;
    }

    const { kind, targetDir } = pendingCreation;
    const sep = targetDir.includes("\\") ? "\\" : "/";
    const finalPath = `${targetDir}${sep}${name}`;

    try {
      if (kind === "directory") {
        await invoke("create_dir", { path: finalPath });
      } else if (kind === "rust_file") {
        if (!name.endsWith(".rs")) name += ".rs";
        const rPath = `${targetDir}${sep}${name}`;
        await invoke("create_rust_file", { path: rPath });
        onFileCreated?.(rPath);
      } else if (kind === "rust_module") {
        const modPath = `${targetDir}${sep}${name}`;
        await invoke("create_rust_module", { path: modPath });
        onFileCreated?.(`${modPath}${sep}mod.rs`);
      } else if (kind === "file") {
        await invoke("create_file", { path: finalPath });
        onFileCreated?.(finalPath);
      } else if (kind === "scratch") {
        await invoke("create_scratch_file", { path: finalPath });
        onFileCreated?.(finalPath);
      }

      await refreshChildren();
      window.dispatchEvent(new Event("pm:refreshExplorer"));
    } catch (err) {
      console.error("Failed to create in subfolder:", err);
    }

    onResetPendingCreation?.();
    setCreationInputValue("");
  };

  const handleCreationKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitSubfolderCreation();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onResetPendingCreation?.();
    }
  };

  return (
    <>
      <div 
        className={`${styles.node} ${activeFile === entry.path ? styles.nodeActive : ""} ${selectedFiles?.has(entry.path) ? styles.nodeSelected : ""} ${isCut ? styles.nodeCut : ""} ${isDragOver ? styles.nodeDragOver : ""} ${diagClass} ${isRevealed ? styles.nodeRevealed : ""} ${isFocused ? styles.nodeFocused : ""}`}
        style={{ paddingLeft: `${depth * 12}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
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
        
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className={styles.renameInput}
            value={renameInput}
            onChange={(e) => setRenameInput(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={() => onCommitRename?.(entry.path, renameInput)}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={styles.name}>{nodeName}</span>
        )}

        {/* Priority-driven Diagnostic Numeric Badges */}
        {!isRenaming && hasError && (
          <span
            className={`${styles.diagBadge} ${styles.badgeError}`}
            title={`${errorCount} error${errorCount > 1 ? "s" : ""}`}
          >
            {errorCount}
          </span>
        )}
        {!isRenaming && hasWarning && (
          <span
            className={`${styles.diagBadge} ${styles.badgeWarning}`}
            title={`${warningCount} warning${warningCount > 1 ? "s" : ""}`}
          >
            {warningCount}
          </span>
        )}
      </div>
      
      {isExpanded && (
        <>
          {isCreationTargetingMe && (
            <div 
              className={styles.node} 
              style={{ paddingLeft: `${(depth + 1) * 12}px` }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.chevron} />
              <div className={`${styles.icon} ${pendingCreation?.kind === "directory" ? styles.iconFolder : styles.iconDefault}`}>
                {pendingCreation?.kind === "directory" ? <VscFolderOpened /> : <VscFile />}
              </div>
              <input
                ref={creationInputRef}
                className={styles.renameInput}
                value={creationInputValue}
                onChange={(e) => setCreationInputValue(e.target.value)}
                onKeyDown={handleCreationKeyDown}
                onBlur={commitSubfolderCreation}
                placeholder={`Name in ${nodeName}/`}
              />
            </div>
          )}

          {children && children.map((child, idx) => (
            <ExplorerNode 
              key={child.path || `${child.name}-${idx}`}
              entry={child} 
              depth={depth + 1} 
              activeFile={activeFile}
              selectedFiles={selectedFiles}
              clipboard={clipboard}
              diagnostics={diagnostics}
              renamingPath={renamingPath}
              focusedNodePath={focusedNodePath}
              pendingCreation={pendingCreation}
              onResetPendingCreation={onResetPendingCreation}
              onFileCreated={onFileCreated}
              onFileClick={onFileClick}
              onNodeContextMenu={onNodeContextMenu}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
            />
          ))}
        </>
      )}
    </>
  );
});

export default ExplorerNode;

