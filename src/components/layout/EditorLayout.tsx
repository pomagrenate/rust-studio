import React, { useState, useEffect, useCallback, useMemo } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Navbar } from "../navbar/Navbar";
import { ExplorerPane } from "../explorer/ExplorerPane";
import { SearchEverywhereModal } from "../search/SearchEverywhereModal";
import { CodeWikiModal } from "../codewiki/CodeWikiModal";
import { BackupManagerModal } from "../backup/BackupManagerModal";
import { RustTestGenModal } from "../testgen/RustTestGenModal";
import { SourceControlPane } from "../scm/SourceControlPane";
import { EditorPaneGroup, EditorGroup } from "./EditorPaneGroup";
import { BottomPanel, TabName } from "../panel/BottomPanel";
import { SavePrompt } from "../dialogs/SavePrompt";
import { CargoProvider, CargoDiagnostic, WorkspaceDiagnostics } from "../../extensions/builtin/rust/CargoProvider";
import { HoverTooltip } from "../editor/HoverTooltip";
import { CompletionWidget, CompletionItem } from "../editor/CompletionWidget";
import { CargoBuildPanel, BuildRecord } from "../rust/CargoBuildPanel";
import { ProblemsPanel } from "../rust/ProblemsPanel";
import { DebugPanel } from "../debugger/DebugPanel";
import { TestExplorer } from "../rust/TestExplorer";
import { HierarchyPanel } from "../hierarchy/HierarchyPanel";
import { useLsp } from "../../hooks/useLsp";
import { useCargoDiagnostics } from "../../hooks/useCargoDiagnostics";
import { useClippy } from "../../hooks/useClippy";
import { extensionRegistry } from "../../extensions/extensionRegistry";
import { ISCMRepository } from "../../extensions/types";
import styles from "./EditorLayout.module.css";

export interface EditorLayoutProps {
  initialWorkspace?: string;
  onCloseWorkspace?: () => void;
}

export function EditorLayout({ initialWorkspace, onCloseWorkspace }: EditorLayoutProps = {}) {
  const [editorGroups, setEditorGroups] = useState<EditorGroup[]>([
    {
      id: "group-1",
      openFiles: ["Welcome"],
      activeFile: "Welcome",
      previewFile: null,
    },
  ]);
  const [activeGroupId, setActiveGroupId] = useState<string>("group-1");
  const [groupWidths, setGroupWidths] = useState<number[]>([100]);
  const [resizingGroupIndex, setResizingGroupIndex] = useState<number | null>(null);

  const [activeBottomTool, setActiveBottomTool] = useState<'terminal' | 'build' | 'problems' | 'debug' | 'tests' | 'hierarchy' | null>(null);
  const [terminalTab, setTerminalTab] = useState<TabName>("Terminal");
  const [isSearchEverywhereOpen, setIsSearchEverywhereOpen] = useState(false);
  const [isCodeWikiOpen, setIsCodeWikiOpen] = useState(false);
  const [isSearchDockedRight, setIsSearchDockedRight] = useState(false);
  const [searchSidebarWidth, setSearchSidebarWidth] = useState(380);
  const [isResizingSearchSidebar, setIsResizingSearchSidebar] = useState(false);

  const [cargoDiagnostics, setCargoDiagnostics] = useState<CargoDiagnostic[]>([]);
  const [workspaceDiagnostics, setWorkspaceDiagnostics] = useState<WorkspaceDiagnostics | null>(null);
  const [cargoOutputLogs] = useState<string>("");
  const [buildRecords, setBuildRecords] = useState<BuildRecord[]>([]);
  const [activeBuildId, setActiveBuildId] = useState<string | undefined>(undefined);
  const [workspaceRoots, setWorkspaceRoots] = useState<string[]>(initialWorkspace ? [initialWorkspace] : []);
  const [closingFile, setClosingFile] = useState<{ groupId: string; path: string } | null>(null);

  const [debugIsRunning, setDebugIsRunning] = useState(false);
  const [debugIsPaused, setDebugIsPaused] = useState(false);
  const [debugActiveFile, setDebugActiveFile] = useState<string | undefined>(undefined);
  const [debugActiveLine, setDebugActiveLine] = useState<number | undefined>(undefined);
  const [debugInlineValues, setDebugInlineValues] = useState<Record<number, string>>({});
  const [debugBreakpoints, setDebugBreakpoints] = useState<Record<string, Set<number>>>({});

  const handleToggleBreakpoint = useCallback((filePath: string, line: number) => {
    setDebugBreakpoints(prev => {
      const next = { ...prev };
      const fileSet = new Set(next[filePath] ?? []);
      if (fileSet.has(line)) {
        fileSet.delete(line);
      } else {
        fileSet.add(line);
      }
      next[filePath] = fileSet;
      return next;
    });
  }, []);
  
  const [fileContents, setFileContents] = useState<Record<string, string[]>>({});
  const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set());
  
  const [isScmOpen, setIsScmOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isTestGenModalOpen, setIsTestGenModalOpen] = useState(false);
  const [isExplorerOpen, setIsExplorerOpen] = useState(true);
  const [_scmBadgeCount, setScmBadgeCount] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem('pm-sidebar-width');
    return saved ? Math.max(160, Math.min(800, Number(saved))) : 260;
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  // Git repository state for branch management
  const [gitRepo, setGitRepo] = useState<ISCMRepository | null>(null);
  const [gitBranches, setGitBranches] = useState<string[]>([]);
  const [gitCurrentBranch, setGitCurrentBranch] = useState<string>("main");

  const activeGroup = useMemo(() => {
    return editorGroups.find(g => g.id === activeGroupId) || editorGroups[0] || null;
  }, [editorGroups, activeGroupId]);

  const activeFile = activeGroup?.activeFile;

  const {
    diagnosticsMap: lspDiagnosticsMap,
    openDoc: lspOpenDoc,
    syncDoc: lspSyncDoc,
    hover: lspHover,
    gotoDefinition: lspGotoDefinition,
    completion,
  } = useLsp(workspaceRoots[0] ?? null);

  const [hoverTooltip, setHoverTooltip] = useState<{
    x: number;
    y: number;
    content: { range?: { start: { line: number; character: number }; end: { line: number; character: number } }; contents?: Array<string | { language: string; value: string }> } | null;
  } | null>(null);

  const [completionWidget, setCompletionWidget] = useState<{
    x: number;
    y: number;
    items: CompletionItem[];
    selectedIndex: number;
    filterText: string;
  } | null>(null);

  const allOpenFiles = useMemo(() => {
    return Array.from(new Set(editorGroups.flatMap(g => g.openFiles)));
  }, [editorGroups]);

  const refreshWorkspaceDiagnostics = useCallback(async () => {
    if (!workspaceRoots[0]) {
      setWorkspaceDiagnostics(null);
      return;
    }
    try {
      const res = await CargoProvider.checkWorkspaceDiagnostics(workspaceRoots[0]);
      setWorkspaceDiagnostics(res);
      const allDiags: CargoDiagnostic[] = [];
      for (const fileSummary of Object.values(res.files)) {
        allDiags.push(...fileSummary.diagnostics);
      }
      setCargoDiagnostics(allDiags);
    } catch (err) {
      console.error("Diagnostic scan error:", err);
    }
  }, [workspaceRoots]);

  useEffect(() => {
    refreshWorkspaceDiagnostics();
  }, [refreshWorkspaceDiagnostics]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    if (window.__TAURI_INTERNALS__) {
      import("@tauri-apps/api/event").then(({ listen }) => {
        listen<{
          total_errors: number;
          total_warnings: number;
          files: Record<string, {
            file_path: string;
            errors: number;
            warnings: number;
            diagnostics: CargoDiagnostic[];
          }>;
        }>("workspace-diagnostics-updated", (event) => {
          const payload = event.payload;
          const mappedFiles: Record<string, {
            filePath: string;
            errors: number;
            warnings: number;
            diagnostics: CargoDiagnostic[];
          }> = {};
          for (const [k, v] of Object.entries(payload.files || {})) {
            mappedFiles[k] = {
              filePath: v.file_path,
              errors: v.errors,
              warnings: v.warnings,
              diagnostics: v.diagnostics,
            };
          }
          setWorkspaceDiagnostics({
            totalErrors: payload.total_errors,
            totalWarnings: payload.total_warnings,
            files: mappedFiles,
          });
        }).then(u => { unlisten = u; });
      });
    }
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const count = editorGroups.length;
    if (count === 0) return;
    const equal = 100 / count;
    setGroupWidths(new Array(count).fill(equal));
  }, [editorGroups.length]);

  // Initialize Git repository and fetch branches
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let isCancelled = false;

    async function initGitRepo() {
      if (!workspaceRoots[0]) {
        setGitRepo(null);
        setGitBranches([]);
        setGitCurrentBranch("main");
        return;
      }

      try {
        const repo = await extensionRegistry.getRepositoryForWorkspace(workspaceRoots[0]);
        if (isCancelled) return;

        setGitRepo(repo);
        if (repo) {
          // Subscribe to repository state changes
          unsubscribe = repo.subscribe((state) => {
            setGitCurrentBranch(state.branch || "main");
          });

          // Fetch branches
          const branches = await repo.getBranches();
          if (!isCancelled) {
            setGitBranches(branches);
          }
        }
      } catch (err) {
        console.error("Failed to initialize Git repository:", err);
        setGitRepo(null);
        setGitBranches([]);
        setGitCurrentBranch("main");
      }
    }

    initGitRepo();

    return () => {
      isCancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [workspaceRoots]);

  const handleGroupResizeStart = (e: React.MouseEvent, groupIndex: number) => {
    e.preventDefault();
    setResizingGroupIndex(groupIndex);
    const startX = e.clientX;
    const initialWidths = [...groupWidths];
    const container = (e.currentTarget.parentElement as HTMLElement)?.parentElement;
    const totalPx = container ? container.clientWidth : window.innerWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = moveEvent.clientX - startX;
      const deltaPct = (deltaPx / totalPx) * 100;
      const nextWidths = [...initialWidths];

      const minPct = 15;
      const w1 = Math.max(minPct, initialWidths[groupIndex] + deltaPct);
      const w2 = Math.max(minPct, initialWidths[groupIndex + 1] - deltaPct);

      if (w1 >= minPct && w2 >= minPct) {
        nextWidths[groupIndex] = w1;
        nextWidths[groupIndex + 1] = w2;
        setGroupWidths(nextWidths);
      }
    };

    const onMouseUp = () => {
      setResizingGroupIndex(null);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleResetGroupWidths = () => {
    const count = editorGroups.length;
    if (count === 0) return;
    const equal = 100 / count;
    setGroupWidths(new Array(count).fill(equal));
  };

  const handleSidebarResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingSidebar(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(170, Math.min(window.innerWidth * 0.6, startWidth + delta));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      setIsResizingSidebar(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      const delta = upEvent.clientX - startX;
      const finalWidth = Math.max(170, Math.min(window.innerWidth * 0.6, startWidth + delta));
      localStorage.setItem('pm-sidebar-width', finalWidth.toString());
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleSidebarResetWidth = () => {
    setSidebarWidth(260);
    localStorage.setItem('pm-sidebar-width', '260');
  };

  const handleSearchSidebarResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingSearchSidebar(true);
    const startX = e.clientX;
    const startWidth = searchSidebarWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.max(280, Math.min(window.innerWidth * 0.6, startWidth + delta));
      setSearchSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsResizingSearchSidebar(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const loadFileContentIfNeeded = useCallback(async (path: string) => {
    if (!path || path === "Welcome" || fileContents[path]) return;

    if (window.__TAURI_INTERNALS__) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const content = await invoke<string>("read_file", { path });
        const splitLines = content.split(/\r?\n/);
        setFileContents(prev => ({ ...prev, [path]: splitLines }));
      } catch (err) {
        console.error("Failed to read file from disk", path, err);
        setFileContents(prev => ({ ...prev, [path]: [""] }));
      }
    } else {
      const sample = [
        `// Content of ${path}`,
        "function main() {",
        "    console.log('Hello from Pomai Studio!');",
        "}",
        "",
        "main();"
      ];
      setFileContents(prev => ({ ...prev, [path]: sample }));
    }
  }, [fileContents]);

  // Clippy integration
  const {
    applyWorkspaceFix: applyClippyWorkspaceFix,
  } = useClippy();

  const handleClippyAutoFix = useCallback(async () => {
    if (!workspaceRoots[0]) return;
    
    await applyClippyWorkspaceFix(workspaceRoots[0], true, (modifiedFiles) => {
      // Reload modified files in editor
      modifiedFiles.forEach(file => {
        if (fileContents[file]) {
          loadFileContentIfNeeded(file);
        }
      });
    });

    // Show Problems panel to display results
    setActiveBottomTool('problems');
  }, [workspaceRoots, applyClippyWorkspaceFix, fileContents, loadFileContentIfNeeded, setActiveBottomTool]);

  const handleOpenFileInActiveGroup = useCallback(async (rawPath: string, isPermanent = false, targetGroupId = activeGroupId) => {
    if (!rawPath) return;

    let path = rawPath.replace(/\\/g, "/");
    if (workspaceRoots[0] && !/^[a-zA-Z]:/.test(path) && !path.startsWith("/")) {
      const cleanRoot = workspaceRoots[0].replace(/\\/g, "/").replace(/\/$/, "");
      const cleanRel = path.replace(/^\.\//, "").replace(/^\//, "");
      path = `${cleanRoot}/${cleanRel}`;
    }

    setEditorGroups(prev => {
      return prev.map(group => {
        if (group.id !== targetGroupId) return group;

        const newOpen = group.openFiles.filter(f => f !== "Welcome");
        if (isPermanent) {
          if (!newOpen.includes(path)) newOpen.push(path);
          return {
            ...group,
            openFiles: newOpen,
            activeFile: path,
            previewFile: group.previewFile === path ? null : group.previewFile,
          };
        }

        if (newOpen.includes(path)) {
          return { ...group, activeFile: path };
        }

        const newPreview = group.previewFile;
        if (newPreview && !dirtyFiles.has(newPreview) && newOpen.includes(newPreview)) {
          const idx = newOpen.indexOf(newPreview);
          if (idx !== -1) newOpen[idx] = path;
          else newOpen.push(path);
        } else {
          newOpen.push(path);
        }
        return { ...group, openFiles: newOpen, activeFile: path, previewFile: path };
      });
    });
    
    // Load file content directly for LSP
    let fullText = "";
    if (window.__TAURI_INTERNALS__) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        fullText = await invoke<string>("read_file", { path });
      } catch (err) {
        console.error("Failed to read file for LSP", path, err);
      }
    }
    
    lspOpenDoc(path, fullText).catch(console.error);
    
    // Also load for editor display
    loadFileContentIfNeeded(path);
  }, [activeGroupId, dirtyFiles, loadFileContentIfNeeded, lspOpenDoc, workspaceRoots]);

  const {
    isBuilding,
    runCheck,
    runClippy,
    cancelBuild,
  } = useCargoDiagnostics((filePath, _line, _col) => {
    handleOpenFileInActiveGroup(filePath, true);
  });

  const handleSplitRight = useCallback((fromGroupId = activeGroupId, initialFile?: string) => {
    const sourceGroup = editorGroups.find(g => g.id === fromGroupId) || editorGroups[0];
    const newGroupId = `group-${Date.now()}`;
    const fileToOpen = initialFile || sourceGroup?.activeFile;

    const newGroup: EditorGroup = {
      id: newGroupId,
      openFiles: fileToOpen ? [fileToOpen] : [],
      activeFile: fileToOpen,
      previewFile: null,
    };

    setEditorGroups(prev => {
      const idx = prev.findIndex(g => g.id === fromGroupId);
      if (idx === -1) return [...prev, newGroup];
      const next = [...prev];
      next.splice(idx + 1, 0, newGroup);
      return next;
    });
    setActiveGroupId(newGroupId);
    if (fileToOpen) {
      loadFileContentIfNeeded(fileToOpen);
    }
  }, [activeGroupId, editorGroups, loadFileContentIfNeeded]);

  const executeCloseTabInGroup = useCallback((groupId: string, path: string) => {
    setEditorGroups(prev => {
      const nextGroups = prev.map(group => {
        if (group.id !== groupId) return group;
        const remaining = group.openFiles.filter(f => f !== path);
        let newActive = group.activeFile;
        if (group.activeFile === path) {
          newActive = remaining.length > 0 ? remaining[remaining.length - 1] : undefined;
        }
        return {
          ...group,
          openFiles: remaining,
          activeFile: newActive,
          previewFile: group.previewFile === path ? null : group.previewFile,
        };
      });

      if (nextGroups.length > 1) {
        const targetGroup = nextGroups.find(g => g.id === groupId);
        if (targetGroup && targetGroup.openFiles.length === 0) {
          const filtered = nextGroups.filter(g => g.id !== groupId);
          if (activeGroupId === groupId) {
            setActiveGroupId(filtered[0].id);
          }
          return filtered;
        }
      }
      return nextGroups;
    });

    setTimeout(() => {
      setEditorGroups(currentGroups => {
        const stillOpen = currentGroups.some(g => g.openFiles.includes(path));
        if (!stillOpen) {
          setDirtyFiles(prev => {
            const next = new Set(prev);
            next.delete(path);
            return next;
          });
        }
        return currentGroups;
      });
    }, 0);
  }, [activeGroupId]);

  const handleCloseTabInGroup = useCallback((groupId: string, path: string) => {
    if (dirtyFiles.has(path)) {
      setClosingFile({ groupId, path });
    } else {
      executeCloseTabInGroup(groupId, path);
    }
  }, [dirtyFiles, executeCloseTabInGroup]);

  const handleMoveTab = useCallback((sourceGroupId: string, targetGroupId: string, filePath: string) => {
    if (sourceGroupId === targetGroupId) return;

    setEditorGroups(prev => {
      let newGroups = [...prev];

      const targetGroupIndex = newGroups.findIndex(g => g.id === targetGroupId);
      if (targetGroupIndex === -1) return prev;

      const targetGroup = { ...newGroups[targetGroupIndex] };
      if (!targetGroup.openFiles.includes(filePath)) {
        targetGroup.openFiles = [...targetGroup.openFiles, filePath];
      }
      targetGroup.activeFile = filePath;
      targetGroup.previewFile = null;
      newGroups[targetGroupIndex] = targetGroup;

      const sourceGroupIndex = newGroups.findIndex(g => g.id === sourceGroupId);
      if (sourceGroupIndex !== -1) {
        const sourceGroup = { ...newGroups[sourceGroupIndex] };
        sourceGroup.openFiles = sourceGroup.openFiles.filter(f => f !== filePath);

        if (sourceGroup.activeFile === filePath) {
          sourceGroup.activeFile = sourceGroup.openFiles.length > 0 
            ? sourceGroup.openFiles[sourceGroup.openFiles.length - 1] 
            : undefined;
        }
        if (sourceGroup.previewFile === filePath) {
          sourceGroup.previewFile = null;
        }
        newGroups[sourceGroupIndex] = sourceGroup;

        if (sourceGroup.openFiles.length === 0 && newGroups.length > 1) {
          newGroups = newGroups.filter(g => g.id !== sourceGroupId);
          setGroupWidths(() => {
            const avg = 100 / newGroups.length;
            return Array(newGroups.length).fill(avg);
          });
        }
      }

      setActiveGroupId(targetGroupId);
      return newGroups;
    });
  }, []);

  const handleLinesChange = useCallback((filePath: string, newLines: string[]) => {
    if (!filePath || filePath === "Welcome") return;
    
    // Check if content actually changed — if only cursor moved, skip expensive state updates
    const existingLines = fileContents[filePath];
    const contentChanged = !existingLines || 
      existingLines.length !== newLines.length || 
      existingLines.some((line, i) => line !== newLines[i]);
    
    if (!contentChanged) {
      // Cursor-only update: no file content change, no re-render needed
      return;
    }

    setFileContents(prev => ({ ...prev, [filePath]: newLines }));
    
    if (!dirtyFiles.has(filePath)) {
      setDirtyFiles(prev => new Set(prev).add(filePath));
    }
    setEditorGroups(prev => prev.map(g => g.previewFile === filePath ? { ...g, previewFile: null } : g));
    const fullText = newLines.join("\n");
    lspSyncDoc(filePath, 0, fullText).catch(console.error);
  }, [fileContents, dirtyFiles, lspSyncDoc]);

  const handleNewFile = async () => {
    if (workspaceRoots.length === 0) {
      try {
        const filePath = await save({ defaultPath: "Untitled.txt" });
        if (filePath) {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("create_file", { path: filePath });
          handleOpenFileInActiveGroup(filePath, true);
          await invoke("add_recently_opened", { path: filePath, isFolder: false });
        }
      } catch (e) { 
        console.error("Tauri dialog failed, falling back to mock:", e); 
        const name = `Untitled-${allOpenFiles.length + 1}`;
        handleOpenFileInActiveGroup(name, true);
      }
    } else {
      window.dispatchEvent(new CustomEvent("pm:newFile", { detail: { root: workspaceRoots[0] } }));
    }
  };

  const handleNewPhysicalFile = async () => {
    try {
      const filePath = await save({ defaultPath: "Untitled.txt" });
      if (filePath) {
        handleOpenFileInActiveGroup(filePath, true);
      }
    } catch (e) { 
      console.error(e);
      alert("Native Action 'New File...' requires running via Tauri (npm run tauri dev).");
    }
  };

  const handleNewWindow = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("spawn_new_window");
    } catch (e) { 
      console.error(e); 
      alert("Native Action 'New Window' requires running via Tauri (npm run tauri dev).");
    }
  };

  const handleOpenFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
      });
      
      if (typeof selected === "string") {
        handleOpenFileInActiveGroup(selected, true);
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("add_recently_opened", { path: selected, isFolder: false });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenFolder = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: true,
      });
      if (typeof selected === "string") {
        setWorkspaceRoots([selected]);
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("add_recently_opened", { path: selected, isFolder: true });
      }
    } catch (e) {
      alert("Open folder dialog error: " + String(e));
    }
  };

  const handleOpenRecent = async (path: string, isFolder: boolean) => {
    if (isFolder) {
      setWorkspaceRoots([path]);
      if (window.__TAURI_INTERNALS__) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("add_recently_opened", { path, isFolder: true });
      }
    } else {
      handleOpenFileInActiveGroup(path, true);
      if (window.__TAURI_INTERNALS__) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("add_recently_opened", { path, isFolder: false });
      }
    }
  };

  const handleAddFolderToWorkspace = async () => {
    try {
      if (!window.__TAURI_INTERNALS__) return;
      const selected = await open({
        multiple: false,
        directory: true,
      });
      if (typeof selected === "string" && !workspaceRoots.includes(selected)) {
        setWorkspaceRoots([...workspaceRoots, selected]);
      }
    } catch (e) { console.error(e); }
  };

  const handleSaveFile = useCallback(async (filePath = activeFile) => {
    if (!filePath || filePath === "Welcome" || !fileContents[filePath]) return;

    if (filePath.startsWith("Untitled")) {
      await handleSaveFileAs(filePath);
      return;
    }

    const content = fileContents[filePath].join("\n");
    if (window.__TAURI_INTERNALS__) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("save_file", { path: filePath, content });
        setDirtyFiles(prev => {
          const next = new Set(prev);
          next.delete(filePath);
          return next;
        });
      } catch (err) {
        console.error("Save file failed:", err);
      }
    } else {
      setDirtyFiles(prev => {
        const next = new Set(prev);
        next.delete(filePath);
        return next;
      });
    }
  }, [activeFile, fileContents]);

  const handleSaveFileAs = useCallback(async (filePath = activeFile) => {
    if (!filePath || filePath === "Welcome") return;
    try {
      const selectedPath = await save({ defaultPath: filePath.startsWith("Untitled") ? "Untitled.txt" : filePath });
      if (selectedPath) {
        const content = (fileContents[filePath] || []).join("\n");
        if (window.__TAURI_INTERNALS__) {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("save_file", { path: selectedPath, content });
          await invoke("add_recently_opened", { path: selectedPath, isFolder: false });
        }
        setFileContents(prev => {
          const next = { ...prev, [selectedPath]: prev[filePath] || [""] };
          delete next[filePath];
          return next;
        });
        setDirtyFiles(prev => {
          const next = new Set(prev);
          next.delete(filePath);
          return next;
        });
        setEditorGroups(prev => prev.map(g => ({
          ...g,
          openFiles: g.openFiles.map(f => f === filePath ? selectedPath : f),
          activeFile: g.activeFile === filePath ? selectedPath : g.activeFile,
        })));
      }
    } catch (e) {
      console.error("Save As error:", e);
    }
  }, [activeFile, fileContents]);

  const handleSaveAll = useCallback(async () => {
    const promises = Array.from(dirtyFiles).map(file => handleSaveFile(file));
    await Promise.all(promises);
  }, [dirtyFiles, handleSaveFile]);

  const handleCloseAllInGroup = useCallback((groupId = activeGroupId) => {
    const group = editorGroups.find(g => g.id === groupId);
    if (!group) return;
    const filesToClose = [...group.openFiles];
    for (const f of filesToClose) {
      handleCloseTabInGroup(groupId, f);
    }
  }, [activeGroupId, editorGroups, handleCloseTabInGroup]);

  const handleCloseSavedInGroup = useCallback((groupId = activeGroupId) => {
    const group = editorGroups.find(g => g.id === groupId);
    if (!group) return;
    const savedFiles = group.openFiles.filter(f => !dirtyFiles.has(f));
    for (const f of savedFiles) {
      executeCloseTabInGroup(groupId, f);
    }
  }, [activeGroupId, editorGroups, dirtyFiles, executeCloseTabInGroup]);

  const handleRevertFile = async () => {
    if (!activeFile || activeFile === "Welcome" || activeFile.startsWith("Untitled")) return;
    try {
      if (window.__TAURI_INTERNALS__) {
        const { invoke } = await import("@tauri-apps/api/core");
        const content = await invoke<string>("read_file", { path: activeFile });
        const splitLines = content.split(/\r?\n/);
        setFileContents(prev => ({ ...prev, [activeFile]: splitLines }));
        setDirtyFiles(prev => {
          const next = new Set(prev);
          next.delete(activeFile);
          return next;
        });
      }
    } catch (e) {
      console.error("Failed to revert file", e);
    }
  };

  const handleCloseEditor = () => {
    if (activeFile && activeGroup) {
      handleCloseTabInGroup(activeGroup.id, activeFile);
    }
  };

  const handleCloseFolder = () => {
    setWorkspaceRoots([]);
    onCloseWorkspace?.();
  };

  const handleCloseWindow = async () => {
    if (window.__TAURI_INTERNALS__) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    }
  };

  const handleExit = async () => {
    if (window.__TAURI_INTERNALS__) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    }
  };

  const handleSaveWorkspaceAs = async () => {
    try {
      if (!window.__TAURI_INTERNALS__) return;
      const { invoke } = await import("@tauri-apps/api/core");
      const filePath = await save({ 
        defaultPath: "workspace.pomai-workspace",
        filters: [{ name: "Pomai Workspace", extensions: ["pomai-workspace"] }]
      });
      if (filePath) {
        await invoke("save_workspace_as", { path: filePath, folders: workspaceRoots });
        await invoke("add_recently_opened", { path: filePath, isFolder: true });
      }
    } catch (e) { console.error(e); }
  };

  const handleDuplicateWorkspace = async () => {
    try {
      if (!window.__TAURI_INTERNALS__) return;
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("duplicate_workspace_window", { folders: workspaceRoots });
    } catch (e) { console.error(e); }
  };

  const handleExecuteAction = async (act: string) => {
    if (act === "new_project") {
      if (onCloseWorkspace) onCloseWorkspace();
    } else if (act === "open_folder") {
      handleOpenFolder();
    } else if (act === "toggle_terminal") {
      setActiveBottomTool((prev) => prev === 'terminal' ? null : 'terminal');
    } else if (act === "cargo_check") {
      runCargoBuildCommand("check", "dev");
    } else if (act === "cargo_build") {
      runCargoBuildCommand("build", "dev");
    } else if (act === "cargo_run") {
      runCargoBuildCommand("run", "dev");
    } else if (act === "cargo_test") {
      runCargoBuildCommand("test", "dev");
    } else if (act === "generate_rust_tests") {
      setIsTestGenModalOpen(true);
    } else if (act === "git_clone") {
      if (onCloseWorkspace) onCloseWorkspace();
    }
  };

  const runCargoBuildCommand = useCallback(async (cmd: "build" | "run" | "test" | "check", profile = "dev") => {
    if (!workspaceRoots[0]) return;
    const buildId = `build-${Date.now()}`;
    const pkgName = workspaceRoots[0].split(/[/\\]/).pop() || "project";
    const now = new Date();
    const timeStr = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${now.toLocaleTimeString()}`;
    const fullCmd = `C:/Users/Admin/.cargo/bin/cargo.exe ${cmd} --color=always --message-format=json-diagnostic-rendered-ansi --package ${pkgName}`;

    const initialRecord: BuildRecord = {
      id: buildId,
      command: `Build (${cmd} ${profile})`,
      fullCommandLine: fullCmd,
      status: "running",
      timestamp: timeStr,
      durationFormatted: "0 sec",
      output: `[Cargo ${cmd}]\nExecuting ${fullCmd}...\n`,
      exitCode: 0,
    };

    setBuildRecords(prev => [initialRecord, ...prev]);
    setActiveBuildId(buildId);
    setActiveBottomTool("build");

    const startTime = performance.now();
    try {
      const res = await CargoProvider.runCommand(workspaceRoots[0], cmd, profile);
      const durationMs = Math.round(performance.now() - startTime);
      const sec = Math.floor(durationMs / 1000);
      const ms = durationMs % 1000;
      const durationFormatted = `${sec} sec, ${ms} ms`;
      const isSuccess = res.exit_code === 0;

      setBuildRecords(prev =>
        prev.map(r =>
          r.id === buildId
            ? {
                ...r,
                status: isSuccess ? "success" : "error",
                durationFormatted,
                output: (res.stdout ? res.stdout + "\n" : "") + (res.stderr || ""),
                exitCode: res.exit_code,
              }
            : r
        )
      );

      if (res.diagnostics && res.diagnostics.length > 0) {
        setCargoDiagnostics(res.diagnostics);
      }
    } catch (err) {
      setBuildRecords(prev =>
        prev.map(r =>
          r.id === buildId
            ? {
                ...r,
                status: "error",
                durationFormatted: "0 sec",
                output: `Error executing command: ${err}`,
                exitCode: 1,
              }
            : r
        )
      );
    }
  }, [workspaceRoots]);

  const currentOpenFiles = activeGroup ? activeGroup.openFiles : [];
  const currentActiveFile = activeGroup ? activeGroup.activeFile : null;
  const activeFileIndex = currentActiveFile ? currentOpenFiles.indexOf(currentActiveFile) : -1;

  const canNavigateBack = activeFileIndex > 0;
  const canNavigateForward = activeFileIndex >= 0 && activeFileIndex < currentOpenFiles.length - 1;

  const handleNavigateBack = useCallback(() => {
    if (activeFileIndex > 0) {
      const prevFile = currentOpenFiles[activeFileIndex - 1];
      setEditorGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, activeFile: prevFile } : g));
      loadFileContentIfNeeded(prevFile);
    }
  }, [activeFileIndex, currentOpenFiles, activeGroupId, loadFileContentIfNeeded]);

  const handleNavigateForward = useCallback(() => {
    if (activeFileIndex >= 0 && activeFileIndex < currentOpenFiles.length - 1) {
      const nextFile = currentOpenFiles[activeFileIndex + 1];
      setEditorGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, activeFile: nextFile } : g));
      loadFileContentIfNeeded(nextFile);
    }
  }, [activeFileIndex, currentOpenFiles, activeGroupId, loadFileContentIfNeeded]);

  // Branch management handlers
  const handleSelectBranch = useCallback(async (branchName: string) => {
    if (gitRepo) {
      try {
        await gitRepo.checkoutBranch(branchName);
        const branches = await gitRepo.getBranches();
        setGitBranches(branches);
      } catch (err) {
        console.error("Failed to checkout branch:", err);
      }
    } else if (window.__TAURI_INTERNALS__ && workspaceRoots[0]) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("git_checkout", { repoPath: workspaceRoots[0], branch: branchName });
        setGitCurrentBranch(branchName);
        const branches = await invoke<string[]>("git_get_branches", { repoPath: workspaceRoots[0] });
        if (branches) setGitBranches(branches);
      } catch (err) {
        console.error("Failed to checkout branch:", err);
      }
    }
  }, [gitRepo, workspaceRoots]);

  const handleCreateBranch = useCallback(async (branchName: string) => {
    if (gitRepo) {
      try {
        await gitRepo.createBranch(branchName);
        await gitRepo.checkoutBranch(branchName);
        const branches = await gitRepo.getBranches();
        setGitBranches(branches);
      } catch (err) {
        console.error("Failed to create branch:", err);
      }
    } else if (window.__TAURI_INTERNALS__ && workspaceRoots[0]) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("git_create_branch", { repoPath: workspaceRoots[0], branchName });
        await invoke("git_checkout", { repoPath: workspaceRoots[0], branch: branchName });
        setGitCurrentBranch(branchName);
        const branches = await invoke<string[]>("git_get_branches", { repoPath: workspaceRoots[0] });
        if (branches) setGitBranches(branches);
      } catch (err) {
        console.error("Failed to create branch:", err);
      }
    }
  }, [gitRepo, workspaceRoots]);

  useEffect(() => {
    let chordKTimeout: ReturnType<typeof setTimeout> | null = null;
    let isChordKActive = false;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'ArrowLeft' || e.code === 'ArrowLeft')) {
        e.preventDefault();
        handleNavigateBack();
      }
      else if (e.altKey && (e.key === 'ArrowRight' || e.code === 'ArrowRight')) {
        e.preventDefault();
        handleNavigateForward();
      }
      else if (e.ctrlKey && (e.key === '\\' || e.code === 'Backslash')) {
        e.preventDefault();
        handleSplitRight();
      }
      else if (e.ctrlKey && e.key.toLowerCase() === 'w' && !e.shiftKey && !e.altKey && !isChordKActive) {
        e.preventDefault();
        handleCloseEditor();
      }
      else if (e.ctrlKey && e.key.toLowerCase() === 'b' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setIsExplorerOpen(prev => !prev);
      }
      else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsSearchEverywhereOpen(true);
      }
      else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setIsSearchEverywhereOpen(true);
      }
      else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        setIsScmOpen(prev => !prev);
      }
      else if (e.ctrlKey && e.key.toLowerCase() === 'f' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("pm:find"));
      }
      else if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        setIsTestGenModalOpen(true);
      }
      else if (e.ctrlKey && e.key.toLowerCase() === 'h' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("pm:replace"));
      }
      else if (e.ctrlKey && (e.key === '`' || e.code === 'Backquote') && !e.shiftKey) {
        e.preventDefault();
        setActiveBottomTool(prev => prev === 'terminal' ? null : 'terminal');
      }
      else if (e.ctrlKey && e.shiftKey && (e.key === '`' || e.code === 'Backquote' || e.key === '~')) {
        e.preventDefault();
        setActiveBottomTool('terminal');
      }
      else if (e.ctrlKey && e.key.toLowerCase() === 's' && !e.shiftKey) {
        e.preventDefault();
        if (isChordKActive) {
          handleSaveAll();
          isChordKActive = false;
        } else {
          handleSaveFile();
        }
      }
      else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveFileAs();
      }
      else if (e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        isChordKActive = true;
        if (chordKTimeout) clearTimeout(chordKTimeout);
        chordKTimeout = setTimeout(() => { isChordKActive = false; }, 2000);
      }
      else if (isChordKActive && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        handleCloseAllInGroup();
        isChordKActive = false;
      }
      else if (isChordKActive && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        handleCloseSavedInGroup();
        isChordKActive = false;
      }
      else if (e.ctrlKey && e.key.toLowerCase() === 'n' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handleNewFile();
      }
      else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewWindow();
      }
      if (e.key === "Shift") {
        const now = Date.now();
        if (now - lastShiftTime < 350) {
          setIsSearchEverywhereOpen(true);
        }
        lastShiftTime = now;
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setIsSearchEverywhereOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsSearchEverywhereOpen(true);
      }
      else if (e.ctrlKey && e.altKey && e.metaKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewPhysicalFile();
      }
    };
    
    let lastShiftTime = 0;
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (chordKTimeout) clearTimeout(chordKTimeout);
    };
  }, [handleSplitRight, handleCloseEditor, handleSaveAll, handleSaveFile, handleSaveFileAs, handleCloseAllInGroup, handleCloseSavedInGroup, handleNavigateBack, handleNavigateForward]);

  return (
    <div className={styles.layout}>
      <div className={styles.navbarWrapper}>
        <Navbar 
          workspaceRoot={workspaceRoots[0]}
          activeBranch={gitCurrentBranch}
          branches={gitBranches}
          onSelectBranch={handleSelectBranch}
          onNewBranch={async () => {
            const branchName = prompt("Enter new branch name:");
            if (branchName && branchName.trim()) {
              await handleCreateBranch(branchName.trim());
            }
          }}
          canNavigateBack={canNavigateBack}
          canNavigateForward={canNavigateForward}
          onNavigateBack={handleNavigateBack}
          onNavigateForward={handleNavigateForward}
          onRunBuild={() => runCargoBuildCommand("build", "dev")}
          onStartRun={() => runCargoBuildCommand("run", "dev")}
          onRunDebug={() => {
            setActiveBottomTool(prev => prev === 'debug' ? null : 'debug');
          }}
          onCargoCheck={() => workspaceRoots[0] && runCheck(workspaceRoots[0])}
          onCargoClippy={() => workspaceRoots[0] && runClippy(workspaceRoots[0])}
          onClippyAutoFix={handleClippyAutoFix}
          onOpenSearchEverywhere={() => setIsSearchEverywhereOpen(true)}
          isCodeWikiOpen={isCodeWikiOpen}
          onToggleCodeWiki={() => setIsCodeWikiOpen(prev => !prev)}
          isBackupModalOpen={isBackupModalOpen}
          onToggleBackupModal={() => setIsBackupModalOpen(prev => !prev)}
          onNewFile={handleNewFile}
          onNewPhysicalFile={handleNewPhysicalFile}
          onNewWindow={handleNewWindow}
          onNewProject={onCloseWorkspace || handleCloseFolder}
          onOpenFile={handleOpenFile}
          onOpenFolder={handleOpenFolder}
          onCloneVcs={() => {
            if (onCloseWorkspace) onCloseWorkspace();
          }}
          onOpenRecent={handleOpenRecent}
          onAddFolderToWorkspace={handleAddFolderToWorkspace}
          onSaveWorkspaceAs={handleSaveWorkspaceAs}
          onDuplicateWorkspace={handleDuplicateWorkspace}
          onSave={handleSaveFile}
          onSaveAs={handleSaveFileAs}
          onSaveAll={handleSaveAll}
          onRevertFile={handleRevertFile}
          onCloseEditor={handleCloseEditor}
          onCloseFolder={handleCloseFolder}
          onCloseWindow={handleCloseWindow}
          onExitToWorkspace={onCloseWorkspace || handleCloseFolder}
          onExit={handleExit}
          onFind={() => {
            window.dispatchEvent(new CustomEvent("pm:find"));
          }}
          onReplace={() => {
            window.dispatchEvent(new CustomEvent("pm:replace"));
          }}
          isProblemsOpen={activeBottomTool === 'problems'}
          onToggleProblems={() => setActiveBottomTool(prev => prev === 'problems' ? null : 'problems')}
          problemsBadgeCount={(workspaceDiagnostics?.totalErrors || 0) + (workspaceDiagnostics?.totalWarnings || 0) + cargoDiagnostics.length}
          isTestsOpen={activeBottomTool === 'tests'}
          onToggleTests={() => setActiveBottomTool(prev => prev === 'tests' ? null : 'tests')}
          isHierarchyOpen={activeBottomTool === 'hierarchy'}
          onToggleHierarchy={() => setActiveBottomTool(prev => prev === 'hierarchy' ? null : 'hierarchy')}
          isTerminalOpen={activeBottomTool === 'terminal'}
          onToggleTerminal={() => setActiveBottomTool(prev => prev === 'terminal' ? null : 'terminal')}
          isScmOpen={isScmOpen}
          onToggleScm={() => setIsScmOpen(prev => !prev)}
          scmBadgeCount={0}
          isBuilding={isBuilding}
          onCancelBuild={cancelBuild}
        />
      </div>

      <div className={styles.mainContainer}>
        {isExplorerOpen && (
          <div className={styles.sidebarWrapper} style={{ width: sidebarWidth }}>
            <ExplorerPane 
              workspaceRoots={workspaceRoots} 
              activeFile={activeFile}
              openFiles={allOpenFiles}
              fileLines={activeFile && fileContents[activeFile] ? fileContents[activeFile] : []}
              workspaceDiagnostics={workspaceDiagnostics || undefined}
              onOpenFolder={handleOpenFolder}
              onFileClick={(path, isDoubleClick = false) => {
                handleOpenFileInActiveGroup(path, isDoubleClick);
              }}
              onFileCreated={(path) => {
                handleOpenFileInActiveGroup(path, true);
              }}
              onNavigateToSymbol={(_line, _col) => {
              }}
              onHide={() => setIsExplorerOpen(false)}
            />
            <div 
              className={`${styles.sidebarResizer} ${isResizingSidebar ? styles.isResizing : ''}`}
              onMouseDown={handleSidebarResizeStart}
              onDoubleClick={handleSidebarResetWidth}
              title="Drag to resize sidebar (Double click to reset)"
            />
          </div>
        )}

        <main className={styles.editorArea}>
          <div className={styles.editorContentWrapper}>
            <div className={styles.splitEditorContainer}>
              {editorGroups.map((group, idx) => (
                <div
                  key={group.id}
                  className={styles.splitEditorPane}
                  style={{ flex: `${groupWidths[idx] || (100 / editorGroups.length)} 1 0%` }}
                >
                  <EditorPaneGroup
                    group={group}
                    isActive={group.id === activeGroupId}
                    dirtyFiles={dirtyFiles}
                    fileContents={fileContents}
                    canCloseGroup={editorGroups.length > 1}
                    workspaceRoot={workspaceRoots[0]}
                    debugExecutionState={{
                      isRunning: debugIsRunning,
                      isPaused: debugIsPaused,
                      activeFile: debugActiveFile,
                      activeLine: debugActiveLine,
                      inlineValues: debugInlineValues,
                      breakpoints: debugBreakpoints,
                    }}
                    onToggleBreakpoint={handleToggleBreakpoint}
                    onFocus={() => setActiveGroupId(group.id)}
                    onSelectFile={(file) => {
                      setActiveGroupId(group.id);
                      setEditorGroups(prev => prev.map(g => g.id === group.id ? { ...g, activeFile: file } : g));
                      loadFileContentIfNeeded(file);
                    }}
                    onCloseFile={(file) => handleCloseTabInGroup(group.id, file)}
                    onCloseAll={() => handleCloseAllInGroup(group.id)}
                    onCloseSaved={() => handleCloseSavedInGroup(group.id)}
                    onSplitRight={() => handleSplitRight(group.id)}
                    onLinesChange={(filePath, newLines) => handleLinesChange(filePath, newLines)}
                    onNewFile={handleNewFile}
                    onOpenFile={handleOpenFile}
                    onOpenFolder={handleOpenFolder}
                    onMoveTab={handleMoveTab}
                    lspDiagnostics={lspDiagnosticsMap}
                    onLspHover={async (line, col) => {
                      if (!activeFile) return;
                      const result = await lspHover(activeFile, line, col);
                      if (result) {
                        const cursorX = 72 + (col * 8.4);
                        const cursorY = (line + 1) * 21;
                        setHoverTooltip({ x: cursorX, y: cursorY, content: result });
                      } else {
                        setHoverTooltip(null);
                      }
                    }}
                    onLspGotoDefinition={async (line, col) => {
                      if (!activeFile) return;
                      const result = await lspGotoDefinition(activeFile, line, col);
                      if (result) {
                        const targetPath = result.uri.replace(/^file:\/\//, "").replace(/^file:\/\//, "");
                        
                        if (result.is_virtual && result.content) {
                          const virtualPath = `[VIRTUAL] ${targetPath.split(/[\\/]/).pop() || targetPath}`;
                          setFileContents(prev => ({ ...prev, [virtualPath]: result.content!.split('\n') }));
                          handleOpenFileInActiveGroup(virtualPath, true);
                        } else {
                          handleOpenFileInActiveGroup(targetPath, true);
                        }
                      }
                    }}
                    onLspCompletion={async (_uri, line, col) => {
                      if (!activeFile) return [];
                      return await completion(activeFile, line, col);
                    }}
                  />

                  {idx < editorGroups.length - 1 && (
                    <div 
                      className={`${styles.editorGroupResizer} ${resizingGroupIndex === idx ? styles.isResizing : ''}`}
                      onMouseDown={(e) => handleGroupResizeStart(e, idx)}
                      onDoubleClick={handleResetGroupWidths}
                      title="Drag to resize split editor panes (Double click to equalize)"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {activeBottomTool === 'build' && (
            <div className={styles.terminalPanelWrapper}>
              <CargoBuildPanel 
                buildRecords={buildRecords}
                activeBuildId={activeBuildId}
                onSelectBuild={(id: string) => setActiveBuildId(id)}
                onRerunBuild={() => runCargoBuildCommand("build", "dev")}
                onStopBuild={() => {}}
                onClearBuilds={() => setBuildRecords([])}
                onClose={() => setActiveBottomTool(null)}
              />
            </div>
          )}

          {activeBottomTool === 'problems' && (
            <div className={styles.terminalPanelWrapper}>
              <ProblemsPanel 
                activeFile={activeFile}
                workspaceRoot={workspaceRoots[0]}
                workspaceDiagnostics={workspaceDiagnostics}
                diagnostics={cargoDiagnostics}
                lspDiagnostics={lspDiagnosticsMap}
                onOpenFile={(filePath) => {
                  handleOpenFileInActiveGroup(filePath, true);
                }}
                onNavigateToProblem={(filePath, _line, _col) => {
                  handleOpenFileInActiveGroup(filePath, true);
                }}
                onClose={() => setActiveBottomTool(null)}
              />
            </div>
          )}

          {activeBottomTool === 'terminal' && (
            <div className={styles.terminalPanelWrapper}>
              <BottomPanel 
                onClose={() => setActiveBottomTool(null)}
                cwd={workspaceRoots[0]}
                activeTab={terminalTab}
                onTabChange={(tab) => setTerminalTab(tab)}
                diagnostics={cargoDiagnostics}
                outputLogs={cargoOutputLogs}
                onNavigateToProblem={(filePath) => {
                  handleOpenFileInActiveGroup(filePath, true);
                }}
              />
            </div>
          )}

          {activeBottomTool === 'debug' && (
            <div className={styles.terminalPanelWrapper}>
              <DebugPanel 
                workspaceRoot={workspaceRoots[0]}
                onNavigateToFile={(filePath, line, _col) => {
                  handleOpenFileInActiveGroup(filePath, true);
                  setDebugActiveFile(filePath);
                  setDebugActiveLine(line - 1);
                }}
                onDebugStateChange={(state) => {
                  setDebugIsRunning(state.isRunning);
                  setDebugIsPaused(state.isPaused);
                  if (state.activeFile) {
                    setDebugActiveFile(state.activeFile);
                    handleOpenFileInActiveGroup(state.activeFile, true);
                  }
                  if (state.activeLine !== undefined) {
                    setDebugActiveLine(state.activeLine);
                  }
                  if (state.inlineValues) {
                    setDebugInlineValues(state.inlineValues);
                  }
                  if (!state.isRunning) {
                    setDebugActiveFile(undefined);
                    setDebugActiveLine(undefined);
                    setDebugInlineValues({});
                  }
                }}
                onClose={() => setActiveBottomTool(null)}
              />
            </div>
          )}

          {activeBottomTool === 'tests' && (
            <div className={styles.terminalPanelWrapper}>
              <TestExplorer 
                workspaceRoot={workspaceRoots[0]}
                onNavigateToFile={(filePath, _line, _col) => {
                  handleOpenFileInActiveGroup(filePath, true);
                }}
                onDebugTest={(_testName, filePath, _line) => {
                  handleOpenFileInActiveGroup(filePath, true);
                  setActiveBottomTool('debug');
                }}
                onClose={() => setActiveBottomTool(null)}
              />
            </div>
          )}

          {activeBottomTool === 'hierarchy' && (
            <div className={styles.terminalPanelWrapper}>
              <HierarchyPanel 
                workspaceRoot={workspaceRoots[0]}
                onNavigateToFile={(filePath, _line, _col) => {
                  handleOpenFileInActiveGroup(filePath, true);
                }}
                onDebugTest={(_symName, filePath, _line) => {
                  handleOpenFileInActiveGroup(filePath, true);
                  setActiveBottomTool('debug');
                }}
                onClose={() => setActiveBottomTool(null)}
              />
            </div>
          )}
        </main>

        {isScmOpen && (
          <div className={styles.sidebarWrapper} style={{ width: sidebarWidth, borderLeft: '1px solid var(--pm-border-default, #282b33)', borderRight: 'none' }}>
            <div 
              className={`${styles.sidebarResizer} ${isResizingSidebar ? styles.isResizing : ''}`}
              style={{ left: -2, right: 'auto' }}
              onMouseDown={handleSidebarResizeStart}
              onDoubleClick={handleSidebarResetWidth}
              title="Drag to resize sidebar (Double click to reset)"
            />
            <SourceControlPane
              workspaceRoots={workspaceRoots}
              onOpenFile={(path) => handleOpenFileInActiveGroup(path, true)}
              onStatusChange={(total) => setScmBadgeCount(total)}
            />
          </div>
        )}

        {isSearchDockedRight && (
          <div className={styles.sidebarWrapper} style={{ width: searchSidebarWidth, borderLeft: '1px solid var(--pm-border-default, #282b33)', borderRight: 'none' }}>
            <div 
              className={`${styles.sidebarResizer} ${isResizingSearchSidebar ? styles.isResizing : ''}`}
              style={{ left: -2, right: 'auto' }}
              onMouseDown={handleSearchSidebarResizeStart}
              title="Drag to resize search panel"
            />
            <SearchEverywhereModal
              isOpen={true}
              isDocked={true}
              onToggleDock={() => setIsSearchDockedRight(false)}
              workspaceRoot={workspaceRoots[0]}
              openFiles={allOpenFiles}
              onClose={() => setIsSearchDockedRight(false)}
              onOpenFile={(path) => handleOpenFileInActiveGroup(path, true)}
              onExecuteAction={handleExecuteAction}
            />
          </div>
        )}
      </div>

      {closingFile && (
        <SavePrompt
          fileName={closingFile.path.split(/[/\\]/).pop() || closingFile.path}
          onSave={async () => {
            await handleSaveFile(closingFile.path);
            executeCloseTabInGroup(closingFile.groupId, closingFile.path);
            setClosingFile(null);
          }}
          onDiscard={() => {
            setDirtyFiles(prev => {
              const next = new Set(prev);
              next.delete(closingFile.path);
              return next;
            });
            executeCloseTabInGroup(closingFile.groupId, closingFile.path);
            setClosingFile(null);
          }}
          onCancel={() => {
            setClosingFile(null);
          }}
        />
      )}

      {isSearchEverywhereOpen && !isSearchDockedRight && (
        <SearchEverywhereModal
          isOpen={true}
          isDocked={false}
          onToggleDock={() => {
            setIsSearchDockedRight(true);
            setIsSearchEverywhereOpen(false);
          }}
          workspaceRoot={workspaceRoots[0]}
          openFiles={allOpenFiles}
          onClose={() => setIsSearchEverywhereOpen(false)}
          onOpenFile={(path) => {
            handleOpenFileInActiveGroup(path, true);
          }}
          onExecuteAction={handleExecuteAction}
        />
      )}

      {/* CodeWiki Architecture Knowledge Base Modal */}
      {isCodeWikiOpen && (
        <CodeWikiModal
          isOpen={isCodeWikiOpen}
          onClose={() => setIsCodeWikiOpen(false)}
          workspacePath={workspaceRoots[0]}
        />
      )}

      {/* Local Production-Ready Code Backup Manager Modal */}
      {isBackupModalOpen && (
        <BackupManagerModal
          isOpen={isBackupModalOpen}
          onClose={() => setIsBackupModalOpen(false)}
          workspacePath={workspaceRoots[0]}
        />
      )}

      {/* Rust AST Test Synthesizer Modal */}
      {isTestGenModalOpen && (
        <RustTestGenModal
          isOpen={isTestGenModalOpen}
          onClose={() => setIsTestGenModalOpen(false)}
          activeFilePath={activeFile}
          onRunCargoTest={() => runCargoBuildCommand("test", "dev")}
        />
      )}

      {hoverTooltip && (
        <HoverTooltip
          x={hoverTooltip.x}
          y={hoverTooltip.y}
          content={hoverTooltip.content}
          onClose={() => setHoverTooltip(null)}
        />
      )}

      {completionWidget && (
        <CompletionWidget
          x={completionWidget.x}
          y={completionWidget.y}
          items={completionWidget.items}
          selectedIndex={completionWidget.selectedIndex}
          filterText={completionWidget.filterText || ""}
          onSelect={(item) => {
            console.log("Selected completion:", item);
            setCompletionWidget(null);
          }}
          onClose={() => setCompletionWidget(null)}
          onNavigate={(direction) => {
            setCompletionWidget(prev => {
              if (!prev) return null;
              const newIndex = direction === "up" 
                ? Math.max(0, prev.selectedIndex - 1)
                : Math.min(prev.items.length - 1, prev.selectedIndex + 1);
              return { ...prev, selectedIndex: newIndex };
            });
          }}
        />
      )}
    </div>
  );
}

export default EditorLayout;