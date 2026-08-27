import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { 
  VscChevronRight, 
  VscChevronDown, 
  VscCollapseAll,
  VscExpandAll, 
  VscAdd, 
  VscLayoutSidebarLeft, 
  VscTarget,
  VscLibrary,
  VscFolder,
  VscFolderOpened
} from "react-icons/vsc";
import { ExplorerNode, FsEntry } from "./ExplorerNode";
import { OutlinePane } from "../outline/OutlinePane";
import { TimelinePane } from "../timeline/TimelinePane";
import { WorkspaceDiagnostics } from "../../extensions/builtin/rust/CargoProvider";
import { AddDropdown } from "./AddDropdown";
import { ExplorerContextMenu } from "./ExplorerContextMenu";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import styles from "./Explorer.module.css";

export interface ExplorerPaneProps {
  workspaceRoots: string[];
  activeFile?: string;
  openFiles: string[];
  fileLines: string[];
  workspaceDiagnostics?: WorkspaceDiagnostics;
  onOpenFolder: () => void;
  onFileClick: (path: string, isDoubleClick?: boolean) => void;
  onFileCreated?: (path: string) => void;
  onNavigateToSymbol?: (_line: number, _col: number) => void;
  onHide?: () => void;
}

export type ClipboardAction = "copy" | "cut";
export interface ClipboardState {
  action: ClipboardAction;
  files: Set<string>;
}

export type CreationKind = "rust_file" | "directory" | "rust_module" | "cargo_crate" | "file" | "scratch";

export interface ExternalLibraryItem {
  name: string;
  version: string;
  root_path: string;
  is_stdlib: boolean;
}

export const ExplorerPane = React.memo(function ExplorerPane({ 
  workspaceRoots, 
  activeFile, 
  openFiles, 
  fileLines = [],
  workspaceDiagnostics,
  onFileClick, 
  onFileCreated, 
  onOpenFolder,
  onNavigateToSymbol,
  onHide
}: ExplorerPaneProps) {
  const [isOpenEditorsExpanded, setIsOpenEditorsExpanded] = useState(true);
  const [isNoFolderExpanded, setIsNoFolderExpanded] = useState(true);
  const [isExternalLibsExpanded, setIsExternalLibsExpanded] = useState(true);
  const [rootsData, setRootsData] = useState<Record<string, FsEntry[]>>({});
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [focusedDirectory, setFocusedDirectory] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [externalLibraries, setExternalLibraries] = useState<ExternalLibraryItem[]>([]);
  const [isAddDropdownOpen, setIsAddDropdownOpen] = useState(false);
  const [pendingCreation, setPendingCreation] = useState<{ kind: CreationKind; targetDir: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; isDir: boolean } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [deleteModalPaths, setDeleteModalPaths] = useState<string[] | null>(null);
  const [focusedNodePath, setFocusedNodePath] = useState<string | null>(null);

  const addTriggerRef = useRef<HTMLDivElement>(null);

  const fetchExternalLibraries = useCallback(async (rootPath: string) => {
    if (!rootPath) {
      setExternalLibraries([]);
      return;
    }
    if (window.__TAURI_INTERNALS__) {
      try {
        const libs = await invoke<ExternalLibraryItem[]>("cargo_get_external_libraries", {
          projectPath: rootPath,
        });
        setExternalLibraries(libs || []);
      } catch (err) {
        console.error("Failed to load external libraries:", err);
        setExternalLibraries([]);
      }
    } else {
      setExternalLibraries([
        { name: "Rust Toolchain (std / core)", version: "sysroot", root_path: "C:/Users/User/.rustup/toolchains/stable/lib/rustlib/src/rust/library", is_stdlib: true },
        { name: "serde", version: "1.0.217", root_path: "C:/Users/User/.cargo/registry/src/index.crates.io-6f17d22bba15001f/serde-1.0.217", is_stdlib: false },
        { name: "tokio", version: "1.43.0", root_path: "C:/Users/User/.cargo/registry/src/index.crates.io-6f17d22bba15001f/tokio-1.43.0", is_stdlib: false },
      ]);
    }
  }, []);

  const refreshRoot = useCallback((root: string) => {
    if (!root) return;
    if (window.__TAURI_INTERNALS__) {
      invoke<FsEntry[]>("list_dir", { path: root })
        .then(res => setRootsData(prev => ({ ...prev, [root]: res || [] })))
        .catch(() => {
          setRootsData(prev => ({ ...prev, [root]: [] }));
        });
      
      fetchExternalLibraries(root);
    } else {
      setRootsData(prev => ({
        ...prev,
        [root]: [
          { name: "src", path: `${root}/src`, kind: "directory" },
          { name: "src-tauri", path: `${root}/src-tauri`, kind: "directory" },
          { name: "Cargo.toml", path: `${root}/Cargo.toml`, kind: "file" },
          { name: "package.json", path: `${root}/package.json`, kind: "file" },
          { name: "README.md", path: `${root}/README.md`, kind: "file" },
          { name: "tsconfig.json", path: `${root}/tsconfig.json`, kind: "file" },
        ]
      }));
      fetchExternalLibraries(root);
    }
  }, [fetchExternalLibraries]);

  useEffect(() => {
    workspaceRoots.forEach(refreshRoot);
  }, [workspaceRoots, refreshRoot]);

  useEffect(() => {
    const handleRefresh = () => {
      workspaceRoots.forEach(refreshRoot);
    };
    window.addEventListener("pm:refreshExplorer", handleRefresh);
    return () => window.removeEventListener("pm:refreshExplorer", handleRefresh);
  }, [workspaceRoots, refreshRoot]);

  const handleNodeContextMenu = useCallback((e: React.MouseEvent, path: string, isDir: boolean) => {
    setContextMenu({ x: e.clientX, y: e.clientY, path, isDir });
    setFocusedNodePath(path);
    if (!selectedFiles.has(path)) {
      setSelectedFiles(new Set([path]));
    }
  }, [selectedFiles]);

  const handleCommitRename = useCallback(async (oldPath: string, newName: string) => {
    setRenamingPath(null);
    const trimmed = newName.trim();
    if (!trimmed) return;

    const parts = oldPath.split(/[/\\]/);
    parts.pop();
    const parentDir = parts.join("/");
    const sep = oldPath.includes("\\") ? "\\" : "/";
    const newPath = parentDir ? `${parentDir}${sep}${trimmed}` : trimmed;

    if (oldPath === newPath) return;

    try {
      if (window.__TAURI_INTERNALS__) {
        await invoke("rename_path", { oldPath, newPath });
      }
      workspaceRoots.forEach(refreshRoot);
      window.dispatchEvent(new Event("pm:refreshExplorer"));
    } catch (err) {
      console.error("Rename failed:", err);
    }
  }, [workspaceRoots, refreshRoot]);

  const handleConfirmDelete = useCallback(async (_useTrash: boolean) => {
    const targets = deleteModalPaths;
    setDeleteModalPaths(null);
    if (!targets || targets.length === 0) return;

    try {
      if (window.__TAURI_INTERNALS__) {
        for (const target of targets) {
          await invoke("delete_path", { path: target });
        }
      }
      workspaceRoots.forEach(refreshRoot);
      window.dispatchEvent(new Event("pm:refreshExplorer"));
    } catch (err) {
      console.error("Delete failed:", err);
    }
  }, [deleteModalPaths, workspaceRoots, refreshRoot]);

  const handleShowInFolder = useCallback(async (path: string) => {
    try {
      if (window.__TAURI_INTERNALS__) {
        await invoke("show_in_folder", { path });
      }
    } catch (err) {
      console.error("Show in folder failed:", err);
    }
  }, []);

  const handleCopyPath = useCallback((targets?: string[]) => {
    const pathsToCopy = targets && targets.length > 0 ? targets : Array.from(selectedFiles);
    navigator.clipboard.writeText(pathsToCopy.join("\n"));
  }, [selectedFiles]);

  const handleCopyRelativePath = useCallback((targets?: string[]) => {
    const root = workspaceRoots[0] || "";
    const pathsToCopy = targets && targets.length > 0 ? targets : Array.from(selectedFiles);
    const rels = pathsToCopy.map(path => {
      if (root && path.startsWith(root)) {
        return path.slice(root.length).replace(/^[/\\]/, "");
      }
      return path;
    });
    navigator.clipboard.writeText(rels.join("\n"));
  }, [selectedFiles, workspaceRoots]);

  const getTargetFileOrDir = useCallback(() => {
    if (focusedNodePath) return focusedNodePath;
    if (selectedFiles.size > 0) return Array.from(selectedFiles)[0];
    if (activeFile) return activeFile;
    return workspaceRoots[0] || null;
  }, [focusedNodePath, selectedFiles, activeFile, workspaceRoots]);

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (renamingPath) return; // Don't intercept when actively typing rename

    if (e.key === "F2") {
      e.preventDefault();
      const target = getTargetFileOrDir();
      if (target) setRenamingPath(target);
      return;
    }

    if (e.key === "Delete") {
      e.preventDefault();
      if (selectedFiles.size > 0) {
        setDeleteModalPaths(Array.from(selectedFiles));
      } else {
        const target = getTargetFileOrDir();
        if (target) setDeleteModalPaths([target]);
      }
      return;
    }

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const nodes = Array.from(document.querySelectorAll('[data-explorer-path]')) as HTMLElement[];
      if (nodes.length === 0) return;

      let currentIndex = nodes.findIndex(n => n.getAttribute('data-explorer-path') === focusedNodePath);
      if (currentIndex === -1) {
        currentIndex = 0;
      } else {
        if (e.key === "ArrowDown") {
          currentIndex = Math.min(currentIndex + 1, nodes.length - 1);
        } else {
          currentIndex = Math.max(currentIndex - 1, 0);
        }
      }
      const newPath = nodes[currentIndex]?.getAttribute('data-explorer-path');
      if (newPath) {
        setFocusedNodePath(newPath);
        setSelectedFiles(new Set([newPath]));
        nodes[currentIndex].scrollIntoView({ block: "nearest" });
      }
      return;
    }

    if (e.key === "Enter") {
      if (focusedNodePath) {
        e.preventDefault();
        onFileClick(focusedNodePath, true);
      }
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();
      if (key === 'a') {
        e.preventDefault();
        const nodeElements = document.querySelectorAll('[data-explorer-path]');
        const newSelected = new Set<string>();
        nodeElements.forEach(el => {
          const path = el.getAttribute('data-explorer-path');
          if (path) newSelected.add(path);
        });
        setSelectedFiles(newSelected);
      } else if (key === 'c') {
        e.preventDefault();
        if (selectedFiles.size > 0) {
          setClipboard({ action: "copy", files: new Set(selectedFiles) });
        }
      } else if (key === 'x') {
        e.preventDefault();
        if (selectedFiles.size > 0) {
          setClipboard({ action: "cut", files: new Set(selectedFiles) });
        }
      } else if (key === 'v') {
        e.preventDefault();
        if (!clipboard || clipboard.files.size === 0) return;
        
        let targetDir = workspaceRoots[0];
        if (focusedDirectory) {
          targetDir = focusedDirectory;
        } else if (selectedFiles.size > 0) {
          const firstSelected = Array.from(selectedFiles)[0];
          const parts = firstSelected.split(/[/\\]/);
          parts.pop();
          targetDir = parts.join("/");
        }

        if (!targetDir) return;

        for (const src of clipboard.files) {
          const fileName = src.split(/[/\\]/).pop();
          if (!fileName) continue;
          const dest = `${targetDir}/${fileName}`;

          try {
            if (clipboard.action === "copy") {
              await invoke("copy_path", { src, dest });
            } else if (clipboard.action === "cut") {
              await invoke("move_path", { src, dest });
            }
          } catch (err) {}
        }

        workspaceRoots.forEach(refreshRoot);
        if (clipboard.action === "cut") {
          setClipboard(null);
        }
      }
    }
  };

  const [lastClickedPath, setLastClickedPath] = useState<string | null>(null);

  useEffect(() => {
    if (activeFile && activeFile !== "Welcome") {
      setFocusedNodePath(activeFile);
      setSelectedFiles(new Set([activeFile]));
      window.dispatchEvent(
        new CustomEvent("pm:revealFileExpand", { detail: { path: activeFile } })
      );
    }
  }, [activeFile]);

  const handleNodeClick = (
    path: string, 
    isDoubleClick = false, 
    isCtrl = false, 
    isShift = false, 
    isDirectory = false
  ) => {
    setFocusedNodePath(path);

    if (isShift && lastClickedPath) {
      const allVisibleElements = Array.from(document.querySelectorAll('[data-explorer-path]'));
      const visiblePaths = allVisibleElements
        .map(el => el.getAttribute('data-explorer-path'))
        .filter(Boolean) as string[];
      
      const startIdx = visiblePaths.indexOf(lastClickedPath);
      const endIdx = visiblePaths.indexOf(path);
      
      if (startIdx !== -1 && endIdx !== -1) {
        const low = Math.min(startIdx, endIdx);
        const high = Math.max(startIdx, endIdx);
        const rangePaths = visiblePaths.slice(low, high + 1);
        
        if (isCtrl) {
          setSelectedFiles(prev => new Set([...prev, ...rangePaths]));
        } else {
          setSelectedFiles(new Set(rangePaths));
        }
      }
      return;
    }

    setLastClickedPath(path);

    if (isCtrl) {
      setSelectedFiles(prev => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
      if (isDirectory) {
        setFocusedDirectory(path);
      }
      return;
    }

    setSelectedFiles(new Set([path]));

    if (isDirectory) {
      setFocusedDirectory(path);
    } else {
      const parts = path.split(/[/\\]/);
      parts.pop();
      setFocusedDirectory(parts.join("/") || workspaceRoots[0]);
      onFileClick(path, isDoubleClick);
    }
  };

  const getResolvedTargetDirectory = (kind: CreationKind): string => {
    const root = workspaceRoots[0] || "";

    if (kind === "cargo_crate") {
      return root;
    }

    let target = focusedNodePath || focusedDirectory;

    if (!target && activeFile && activeFile !== "Welcome") {
      target = activeFile;
    }

    if (target) {
      const normTarget = target.replace(/\\/g, "/");
      const parts = normTarget.split("/");
      const lastPart = parts[parts.length - 1] || "";
      
      // If target is a file (contains an extension dot), use its parent directory
      if (lastPart.includes(".")) {
        parts.pop();
        return parts.join("/") || root;
      }
      return normTarget;
    }

    return root;
  };

  const triggerCreation = (kind: CreationKind) => {
    const targetDir = getResolvedTargetDirectory(kind);
    setPendingCreation({ kind, targetDir });
  };

  return (
    <div 
      className={styles.explorerPane}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={() => {
        setSelectedFiles(new Set());
        setFocusedDirectory(workspaceRoots[0] || null);
      }}
      style={{ outline: "none" }}
    >
      <div className={styles.header}>
        <span style={{ flex: 1 }}>Project</span>
        <div className={styles.headerActions}>
          <div ref={addTriggerRef} style={{ display: 'inline-flex' }}>
            <VscAdd 
              className={styles.headerActionIcon}
              title="Add New..."
              onClick={(e) => {
                e.stopPropagation();
                setIsAddDropdownOpen(prev => !prev);
              }}
            />
          </div>

          <VscTarget 
            className={styles.headerActionIcon}
            title="Always Select Opened File"
            onClick={(e) => {
              e.stopPropagation();
              if (activeFile) {
                window.dispatchEvent(new CustomEvent("pm:revealActiveFile", { detail: { path: activeFile } }));
              }
            }}
          />

          <VscCollapseAll 
            className={styles.headerActionIcon}
            title="Collapse All"
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new Event("pm:collapseAllExplorer"));
            }}
          />

          <VscExpandAll 
            className={styles.headerActionIcon}
            title="Expand All"
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new Event("pm:expandAllExplorer"));
            }}
          />

          {onHide && (
            <VscLayoutSidebarLeft
              className={styles.headerActionIcon}
              title="Hide Sidebar"
              onClick={(e) => {
                e.stopPropagation();
                onHide();
              }}
            />
          )}
        </div>
      </div>

      <AddDropdown 
        isOpen={isAddDropdownOpen}
        onClose={() => setIsAddDropdownOpen(false)}
        workspaceRoots={workspaceRoots}
        triggerRef={addTriggerRef}
        onRustFile={() => triggerCreation("rust_file")}
        onDirectory={() => triggerCreation("directory")}
        onRustModule={() => triggerCreation("rust_module")}
        onCargoCrate={() => triggerCreation("cargo_crate")}
        onFile={() => triggerCreation("file")}
        onScratch={() => triggerCreation("scratch")}
      />

      <div className={styles.treeArea}>
        {openFiles.filter(f => f !== "Welcome").length > 0 && (
          <div className={styles.section}>
            <div 
              className={styles.sectionHeader}
              onClick={() => setIsOpenEditorsExpanded(!isOpenEditorsExpanded)}
            >
              {isOpenEditorsExpanded ? <VscChevronDown className={styles.sectionHeaderIcon}/> : <VscChevronRight className={styles.sectionHeaderIcon}/>}
              <span className={styles.sectionTitle}>OPEN EDITORS</span>
            </div>
            
            {isOpenEditorsExpanded && (
              <div className={styles.sectionContent}>
                {openFiles.filter(f => f !== "Welcome").map(file => (
                  <ExplorerNode 
                    key={file}
                    entry={{ name: file.split("\\").pop()?.split("/").pop() || file, path: file, kind: "file" }}
                    depth={0}
                    activeFile={activeFile}
                    selectedFiles={selectedFiles}
                    clipboard={clipboard}
                    onFileClick={handleNodeClick}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {workspaceRoots.length === 0 && (
          <div className={styles.section}>
            <div 
              className={styles.sectionHeader}
              onClick={() => setIsNoFolderExpanded(!isNoFolderExpanded)}
            >
              {isNoFolderExpanded ? <VscChevronDown className={styles.sectionHeaderIcon}/> : <VscChevronRight className={styles.sectionHeaderIcon}/>}
              <span className={styles.sectionTitle}>NO FOLDER OPENED</span>
            </div>
            
            {isNoFolderExpanded && (
              <div className={styles.emptyWorkspace}>
                <div className={styles.emptyWorkspaceText}>
                  You have not yet opened a folder.
                </div>
                <button 
                  className={styles.primaryBtn} 
                  onClick={onOpenFolder}
                >
                  Open Folder
                </button>
                <div className={styles.emptyWorkspaceText}>
                  You can clone a repository locally.
                </div>
                <button 
                  className={styles.primaryBtn}
                  onClick={() => {}}
                >
                  Clone Repository
                </button>
              </div>
            )}
          </div>
        )}

        {workspaceRoots.map(root => (
          <WorkspaceFolderSection 
            key={root}
            rootPath={root}
            entries={rootsData[root]}
            activeFile={activeFile}
            selectedFiles={selectedFiles}
            focusedDirectory={focusedDirectory}
            clipboard={clipboard}
            workspaceDiagnostics={workspaceDiagnostics}
            pendingCreation={pendingCreation}
            renamingPath={renamingPath}
            focusedNodePath={focusedNodePath}
            onNodeContextMenu={handleNodeContextMenu}
            onCommitRename={handleCommitRename}
            onCancelRename={() => setRenamingPath(null)}
            onResetPendingCreation={() => setPendingCreation(null)}
            onFileClick={handleNodeClick}
            onRefresh={() => refreshRoot(root)}
            onFileCreated={(path) => {
              refreshRoot(root);
              onFileCreated?.(path);
            }}
          />
        ))}

        {workspaceRoots.length > 0 && externalLibraries.length > 0 && (
          <div className={styles.section}>
            <div 
              className={styles.sectionHeader}
              onClick={() => setIsExternalLibsExpanded(!isExternalLibsExpanded)}
            >
              {isExternalLibsExpanded ? <VscChevronDown className={styles.sectionHeaderIcon}/> : <VscChevronRight className={styles.sectionHeaderIcon}/>}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }} className={styles.sectionTitle}>
                <VscLibrary style={{ color: "#dea584", fontSize: "15px" }} />
                <span>EXTERNAL LIBRARIES</span>
              </span>
            </div>
            
            {isExternalLibsExpanded && (
              <div className={styles.sectionContent}>
                {externalLibraries.map((lib) => (
                  <ExplorerNode 
                    key={lib.root_path}
                    entry={{
                      name: `${lib.name} ${lib.version !== "sysroot" ? `v${lib.version}` : ""}`,
                      path: lib.root_path,
                      kind: "directory"
                    }}
                    depth={1}
                    activeFile={activeFile}
                    selectedFiles={selectedFiles}
                    clipboard={clipboard}
                    onFileClick={handleNodeClick}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className={styles.bottomPanesContainer}>
        <OutlinePane 
          activeFile={activeFile}
          fileLines={fileLines}
          onNavigateToSymbol={onNavigateToSymbol}
        />

        <TimelinePane 
          activeFile={activeFile}
        />
      </div>

      {contextMenu && (
        <ExplorerContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          path={contextMenu.path}
          isDir={contextMenu.isDir}
          activeFile={activeFile}
          onClose={() => setContextMenu(null)}
          onNewFile={() => setPendingCreation({ kind: "file", targetDir: contextMenu.isDir ? contextMenu.path : (contextMenu.path.split(/[/\\]/).slice(0, -1).join("/") || workspaceRoots[0]) })}
          onNewFolder={() => setPendingCreation({ kind: "directory", targetDir: contextMenu.isDir ? contextMenu.path : (contextMenu.path.split(/[/\\]/).slice(0, -1).join("/") || workspaceRoots[0]) })}
          onNewRustModule={() => setPendingCreation({ kind: "rust_module", targetDir: contextMenu.isDir ? contextMenu.path : (contextMenu.path.split(/[/\\]/).slice(0, -1).join("/") || workspaceRoots[0]) })}
          onCut={() => { setClipboard({ action: "cut", files: selectedFiles.has(contextMenu.path) ? new Set(selectedFiles) : new Set([contextMenu.path]) }); setContextMenu(null); }}
          onCopy={() => { setClipboard({ action: "copy", files: selectedFiles.has(contextMenu.path) ? new Set(selectedFiles) : new Set([contextMenu.path]) }); setContextMenu(null); }}
          onPaste={() => { setContextMenu(null); }}
          onCopyPath={() => { handleCopyPath(selectedFiles.has(contextMenu.path) ? Array.from(selectedFiles) : [contextMenu.path]); setContextMenu(null); }}
          onCopyRelativePath={() => { handleCopyRelativePath(selectedFiles.has(contextMenu.path) ? Array.from(selectedFiles) : [contextMenu.path]); setContextMenu(null); }}
          onRename={() => { setRenamingPath(contextMenu.path); setContextMenu(null); }}
          onDelete={() => { setDeleteModalPaths(selectedFiles.has(contextMenu.path) ? Array.from(selectedFiles) : [contextMenu.path]); setContextMenu(null); }}
          onShowInFolder={() => { handleShowInFolder(contextMenu.path); setContextMenu(null); }}
          onCompareWithActive={() => { onFileClick(contextMenu.path, true); setContextMenu(null); }}
        />
      )}

      {deleteModalPaths && deleteModalPaths.length > 0 && (
        <DeleteConfirmModal
          isOpen={true}
          targetPaths={deleteModalPaths}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteModalPaths(null)}
        />
      )}
    </div>
  );
});

interface WorkspaceFolderSectionProps {
  rootPath: string;
  entries?: FsEntry[];
  activeFile?: string;
  selectedFiles?: Set<string>;
  focusedDirectory: string | null;
  clipboard?: ClipboardState | null;
  workspaceDiagnostics?: WorkspaceDiagnostics;
  pendingCreation: { kind: CreationKind; targetDir: string } | null;
  renamingPath: string | null;
  focusedNodePath: string | null;
  onNodeContextMenu: (e: React.MouseEvent, path: string, isDir: boolean) => void;
  onCommitRename: (oldPath: string, newName: string) => void;
  onCancelRename: () => void;
  onResetPendingCreation: () => void;
  onFileClick: (path: string, isDoubleClick?: boolean, ctrlKey?: boolean, isDirectory?: boolean) => void;
  onRefresh: () => void;
  onFileCreated: (path: string) => void;
}

const WorkspaceFolderSection = React.memo(function WorkspaceFolderSection({ 
  rootPath, 
  entries, 
  activeFile, 
  selectedFiles, 
  clipboard, 
  workspaceDiagnostics,
  pendingCreation,
  renamingPath,
  focusedNodePath,
  onNodeContextMenu,
  onCommitRename,
  onCancelRename,
  onResetPendingCreation,
  onFileClick, 
  onRefresh, 
  onFileCreated 
}: WorkspaceFolderSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeCreation, setActiveCreation] = useState<{ kind: CreationKind; targetDir: string } | null>(null);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pendingCreation) {
      const normRoot = rootPath.replace(/\\/g, "/");
      const normTarget = pendingCreation.targetDir.replace(/\\/g, "/");
      
      if (normTarget === normRoot) {
        setInputValue("");
        setActiveCreation(pendingCreation);
        setIsExpanded(true);
        onResetPendingCreation();
      }
    }
  }, [pendingCreation, rootPath, onResetPendingCreation]);

  useEffect(() => {
    if (activeCreation && inputRef.current) {
      inputRef.current.focus();
    }
  }, [activeCreation]);

  const commitInlineInput = async () => {
    let name = inputValue.trim();
    if (!name || !activeCreation) {
      setActiveCreation(null);
      return;
    }

    const { kind, targetDir } = activeCreation;
    const sep = targetDir.includes("\\") ? "\\" : "/";

    try {
      if (kind === "rust_file") {
        if (!name.endsWith(".rs")) name += ".rs";
        const finalPath = `${targetDir}${sep}${name}`;
        await invoke("create_rust_file", { path: finalPath });
        onFileCreated(finalPath);
      } else if (kind === "directory") {
        const fullPath = `${targetDir}${sep}${name}`;
        await invoke("create_dir", { path: fullPath });
      } else if (kind === "rust_module") {
        const modPath = `${targetDir}${sep}${name}`;
        await invoke("create_rust_module", { path: modPath });
        onFileCreated(`${modPath}${sep}mod.rs`);
      } else if (kind === "cargo_crate") {
        await invoke("create_cargo_crate", { path: rootPath, name });
        onFileCreated(`${rootPath}${sep}${name}${sep}Cargo.toml`);
      } else if (kind === "scratch") {
        const fullPath = `${targetDir}${sep}${name}`;
        await invoke("create_scratch_file", { path: fullPath });
        onFileCreated(fullPath);
      } else if (kind === "file") {
        const fullPath = `${targetDir}${sep}${name}`;
        await invoke("create_file", { path: fullPath });
        onFileCreated(fullPath);
      }
      onRefresh();
    } catch (e) {
      console.error("Creation error:", e);
    }

    setActiveCreation(null);
    setInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commitInlineInput();
    if (e.key === "Escape") setActiveCreation(null);
  };

  const getPlaceholder = () => {
    if (!activeCreation) return "Name";
    const dirName = activeCreation.targetDir.split(/[/\\]/).pop() || "root";
    switch (activeCreation.kind) {
      case "rust_file": return `New Rust file in ${dirName}/ (e.g. state.rs)`;
      case "directory": return `New Directory in ${dirName}/`;
      case "rust_module": return `New Rust Module in ${dirName}/`;
      case "cargo_crate": return `New Cargo Crate in ${rootPath.split(/[/\\]/).pop()}/`;
      case "file": return `New File in ${dirName}/`;
      case "scratch": return `New Scratch File in ${dirName}/`;
      default: return `Name in ${dirName}/`;
    }
  };

  const folderName = rootPath.split("\\").pop()?.split("/").pop() || "workspace";

  return (
    <div className={styles.section}>
      <div 
        className={styles.sectionHeader}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? <VscChevronDown className={styles.sectionHeaderIcon}/> : <VscChevronRight className={styles.sectionHeaderIcon}/>}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }} className={styles.sectionTitle}>
          {isExpanded ? (
            <VscFolderOpened style={{ color: "#dcb67a", fontSize: "16px", flexShrink: 0 }} />
          ) : (
            <VscFolder style={{ color: "#dcb67a", fontSize: "16px", flexShrink: 0 }} />
          )}
          <span>{folderName}</span>
        </span>
      </div>
      
      {isExpanded && (
        <div className={styles.sectionContent}>
          {activeCreation && (
            <div className={styles.inlineInputRow} style={{ paddingLeft: "36px" }}>
              <input
                ref={inputRef}
                className={styles.inlineInput}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => setActiveCreation(null)}
                placeholder={getPlaceholder()}
              />
            </div>
          )}

          {entries?.map(entry => (
            <ExplorerNode 
              key={entry.path}
              entry={entry}
              depth={1}
              activeFile={activeFile}
              selectedFiles={selectedFiles}
              clipboard={clipboard}
              diagnostics={workspaceDiagnostics}
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
        </div>
      )}
    </div>
  );
});

export default ExplorerPane;