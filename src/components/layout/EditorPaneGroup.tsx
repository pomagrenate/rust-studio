import React, { useState, useMemo, useCallback } from "react";
import { TabBar } from "./TabBar";
import { EditorView } from "../editor/EditorView";
import { CompletionItem } from "../editor/CompletionWidget";
import { WelcomeScreen, EmptyScreen } from "../welcome/Welcome";
import { ImageViewer } from "../viewers/ImageViewer";
import { MarkdownPreview } from "../viewers/MarkdownPreview";
import { CsvTableViewer } from "../viewers/CsvTableViewer";
import { MediaViewer } from "../viewers/MediaViewer";
import { BreadcrumbsBar } from "../editor/BreadcrumbsBar";
import { MergeConflictBanner } from "../git/MergeConflictBanner";
import { MergeConflictResolverModal } from "../git/MergeConflictResolverModal";
import { findMergeConflicts, resolveAllConflicts } from "../../extensions/builtin/git/MergeConflictParser";
import { PdfViewer } from "../viewers/PdfViewer";
import styles from "./EditorPaneGroup.module.css";

export interface EditorGroup {
  id: string;
  openFiles: string[];
  activeFile?: string;
  previewFile: string | null;
}

interface EditorPaneGroupProps {
  group: EditorGroup;
  isActive: boolean;
  dirtyFiles: Set<string>;
  fileContents: Record<string, string[]>;
  canCloseGroup: boolean;
  workspaceRoot?: string;
  onFocus: () => void;
  onSelectFile: (file: string) => void;
  onCloseFile: (file: string) => void;
  onCloseAll: () => void;
  onCloseSaved: () => void;
  onSplitRight: () => void;
  onLinesChange: (filePath: string, newLines: string[], activeLine?: number, activeCol?: number) => void;
  debugExecutionState?: {
    isRunning: boolean;
    isPaused: boolean;
    activeFile?: string;
    activeLine?: number;
    inlineValues?: Record<number, string>;
    breakpoints?: Record<string, Set<number>>;
  };
  onToggleBreakpoint?: (filePath: string, line: number) => void;
  onNewFile: () => void;
  onOpenFile: () => void;
  onOpenFolder: () => void;
  onMoveTab?: (sourceGroupId: string, targetGroupId: string, file: string) => void;
  // LSP integration props
  lspDiagnostics?: Record<string, any[]>;
  onLspHover?: (line: number, col: number) => void;
  onLspGotoDefinition?: (line: number, col: number) => void;
  onLspCompletion?: (uri: string, line: number, col: number) => Promise<CompletionItem[]>;
}

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"];
const MARKDOWN_EXTENSIONS = ["md", "markdown"];
const CSV_EXTENSIONS = ["csv", "tsv"];
const MEDIA_EXTENSIONS = ["mp3", "wav", "ogg", "mp4", "webm", "mov"];
const PDF_EXTENSIONS = ["pdf"];

export const EditorPaneGroup = React.memo(function EditorPaneGroup({
  group,
  isActive,
  dirtyFiles,
  fileContents,
  workspaceRoot,
  debugExecutionState,
  onFocus,
  onSelectFile,
  onCloseFile,
  onCloseAll,
  onCloseSaved,
  onSplitRight,
  onLinesChange,
  onToggleBreakpoint,
  onNewFile,
  onOpenFile,
  onOpenFolder,
  onMoveTab,
  lspDiagnostics,
  onLspHover,
  onLspGotoDefinition,
  onLspCompletion,
}: EditorPaneGroupProps) {
  const activeFile = group.activeFile;
  const rawLines = activeFile ? fileContents[activeFile] : undefined;
  const isLoading = Boolean(activeFile && activeFile !== "Welcome" && rawLines === undefined);
  const lines = rawLines || [];
  const [activeLine, setActiveLine] = useState(0);
  const [activeCol, setActiveCol] = useState(0);
  const [is3WayOpen, setIs3WayOpen] = useState(false);

  const handleEditorLinesChange = useCallback(
    (newLines: string[], nLine: number, nCol: number) => {
      if (!activeFile) return;
      setActiveLine(nLine);
      setActiveCol(nCol);
      onLinesChange(activeFile, newLines, nLine, nCol);
    },
    [activeFile, onLinesChange]
  );

  const handleEditorToggleBreakpoint = useCallback(
    (line: number) => {
      if (activeFile && onToggleBreakpoint) {
        onToggleBreakpoint(activeFile, line);
      }
    },
    [activeFile, onToggleBreakpoint]
  );

  // Discover merge conflicts in active file lines
  const conflicts = useMemo(() => {
    if (!activeFile || activeFile === "Welcome" || !lines || lines.length === 0) return [];
    return findMergeConflicts(lines);
  }, [activeFile, lines]);

  const ext = activeFile ? activeFile.split(".").pop()?.toLowerCase() || "" : "";

  const renderActiveContent = () => {
    if (activeFile === "Welcome") {
      return (
        <WelcomeScreen
          onNewFile={onNewFile}
          onOpenFile={onOpenFile}
          onOpenFolder={onOpenFolder}
        />
      );
    }

    if (!activeFile) {
      return <EmptyScreen />;
    }

    if (isLoading) {
      return (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '100%',
          color: 'var(--pm-fg-muted)',
          fontSize: '13px'
        }}>
          Loading...
        </div>
      );
    }

    // Image & SVG Viewer
    if (IMAGE_EXTENSIONS.includes(ext)) {
      return <ImageViewer filePath={activeFile} />;
    }

    // Markdown Live Preview
    if (MARKDOWN_EXTENSIONS.includes(ext)) {
      return (
        <MarkdownPreview
          filePath={activeFile}
          lines={lines}
          onLinesChange={handleEditorLinesChange}
        />
      );
    }

    // CSV & Data Table Grid
    if (CSV_EXTENSIONS.includes(ext)) {
      return (
        <CsvTableViewer
          filePath={activeFile}
          lines={lines}
          onLinesChange={handleEditorLinesChange}
        />
      );
    }

    // Audio & Video Player
    if (MEDIA_EXTENSIONS.includes(ext)) {
      return <MediaViewer filePath={activeFile} />;
    }

    // PDF Document Preview
    if (PDF_EXTENSIONS.includes(ext)) {
      return <PdfViewer filePath={activeFile} />;
    }

    // Default Code Editor
    const isDebugFile = debugExecutionState?.isRunning && debugExecutionState?.activeFile === activeFile;
    const fileDiagnostics = lspDiagnostics?.[activeFile || ""] || [];
    return (
      <EditorView
        lines={lines}
        activeLine={activeLine}
        activeCol={activeCol}
        executionLine={isDebugFile ? debugExecutionState?.activeLine : undefined}
        breakpoints={debugExecutionState?.breakpoints?.[activeFile] ?? new Set()}
        inlineValues={isDebugFile ? (debugExecutionState?.inlineValues ?? {}) : {}}
        diagnostics={fileDiagnostics}
        onHover={onLspHover}
        onGotoDefinition={onLspGotoDefinition}
        onLspCompletion={onLspCompletion}
        onLinesChange={handleEditorLinesChange}
        onToggleBreakpoint={handleEditorToggleBreakpoint}
        aria-label={`Editor: ${activeFile}`}
        filePath={activeFile}
        enableRopeBuffer={false}
      />
    );
  };

  return (
    <div
      className={`${styles.groupContainer} ${isActive ? styles.focused : ""}`}
      onClick={onFocus}
      tabIndex={-1}
    >
      <TabBar
        groupId={group.id}
        openFiles={group.openFiles}
        activeFile={group.activeFile}
        previewFile={group.previewFile}
        dirtyFiles={dirtyFiles}
        onSelectFile={onSelectFile}
        onCloseFile={onCloseFile}
        onSplitRight={onSplitRight}
        onCloseAll={onCloseAll}
        onCloseSaved={onCloseSaved}
        onMoveTab={onMoveTab}
      />

      <div className={styles.groupCanvas}>
        {activeFile && activeFile !== "Welcome" && !isLoading && (
          <BreadcrumbsBar
            filePath={activeFile}
            activeLine={activeLine}
            fileLines={lines}
            onNavigateToSymbol={(line, col) => {
              setActiveLine(line);
              setActiveCol(col);
              onLinesChange(activeFile, lines, line, col);
            }}
          />
        )}
        {conflicts.length > 0 && activeFile && (
          <MergeConflictBanner
            conflicts={conflicts}
            onAcceptAllCurrent={() => {
              const nextLines = resolveAllConflicts(lines, "current");
              onLinesChange(activeFile, nextLines, 0, 0);
            }}
            onAcceptAllIncoming={() => {
              const nextLines = resolveAllConflicts(lines, "incoming");
              onLinesChange(activeFile, nextLines, 0, 0);
            }}
            onOpen3WayResolver={() => setIs3WayOpen(true)}
          />
        )}
        {renderActiveContent()}
      </div>

      {/* ── 3-Way Visual Merge Conflict Resolver Modal ── */}
      {is3WayOpen && activeFile && (
        <MergeConflictResolverModal
          filePath={activeFile}
          repoPath={workspaceRoot}
          initialContent={lines.join("\n")}
          onSaveAndResolve={(resolvedText) => {
            const nextLines = resolvedText.split(/\r?\n/);
            onLinesChange(activeFile, nextLines, 0, 0);
            setIs3WayOpen(false);
          }}
          onClose={() => setIs3WayOpen(false)}
        />
      )}
    </div>
  );
});

export default EditorPaneGroup;

