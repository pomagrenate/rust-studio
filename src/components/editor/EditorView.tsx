import { useRef, useLayoutEffect, useState, useEffect, useMemo, useCallback } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import EditorLine, { LineDiagnosticRange } from "./EditorLine";
import { FindWidget } from "./FindWidget";
import { CompletionWidget, CompletionItem } from "./CompletionWidget";
import { QuickFixWidget } from "./QuickFixWidget";
import { SurroundWithWidget } from "./SurroundWithWidget";
import { useVirtualScroll } from "../../hooks/useVirtualScroll";
import { useTextMeasurement } from "../../hooks/useTextMeasurement";
import { useRopeBuffer } from "../../hooks/useRopeBuffer";
import { useCodeActions } from "../../hooks/useCodeActions";
import { lspCompletion, pathToUri, lspSyncDocument } from "../../ipc/lsp";
import { ViewModel, type Selection } from "./viewModel/ViewModel";
import { commandRegistry } from "./commands/CommandRegistry";
import { MouseHandler } from "./controller/MouseHandler";
import { ContextMenu } from "./contextmenu/ContextMenu";
import { ContextMenuController } from "./contextmenu/ContextMenuController";
import type { MenuItem, EditorContextState } from "./contextmenu/types";
import { applySurroundTemplate, detectBaseIndentation, type SurroundTemplate } from "../../utils/surroundWith";
import { GoToLineWidget } from "./GoToLineWidget";
import { StickyScroll } from "./StickyScroll";
import { Minimap } from "./Minimap";
import { useWordHighlighter } from "../../hooks/useWordHighlighter";
import { useBracketMatcher } from "../../hooks/useBracketMatcher";
import { computeFoldingRanges, buildFoldableLineSet, getHiddenLines } from "./folding/FoldingProvider";
import "./commands/NavigationCommands";
import "./commands/SelectionCommands";
import "./commands/EditingCommands";
import "./commands/LinesOperationsCommands";
import "./commands/MultiCursorCommands";
import "./commands/AutoClosingCommands";
import "./commands/ScrollCommands";
import "./commands/ClipboardCommands";
import "./commands/FormattingCommands";
import "./commands/LSPCommands";
import styles from "./EditorView.module.css";

const LINE_HEIGHT_PX = 21;
const OVERSCROLL_BOTTOM_PX = 240;
// 48px width + 16px padding-right + 1px border-right + 16px lineContent padding-left = 81px
const GUTTER_TOTAL_OFFSET = 81;

/**
 * Format keyboard event to keybinding string
 */
function formatKeybinding(e: ReactKeyboardEvent): string {
  const parts: string[] = [];
  
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  if (e.metaKey) parts.push('Meta');
  
  // Map special keys
  const keyMap: Record<string, string> = {
    ' ': 'Space',
    'ArrowUp': 'UpArrow',
    'ArrowDown': 'DownArrow',
    'ArrowLeft': 'LeftArrow',
    'ArrowRight': 'RightArrow',
    'PageUp': 'PageUp',
    'PageDown': 'PageDown',
    'Home': 'Home',
    'End': 'End',
    'Escape': 'Escape',
    'Enter': 'Enter',
    'Tab': 'Tab',
    'Backspace': 'Backspace',
    'Delete': 'Delete',
    'Insert': 'Insert',
  };
  
  let key = keyMap[e.key] || e.key;
  if (key.length === 1) {
    key = key.toUpperCase();
  }
  parts.push(key);
  
  return parts.join('+');
}

/**
 * Get current platform
 */
function getPlatform(): 'windows' | 'mac' | 'linux' {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes('win')) return 'windows';
  if (platform.includes('mac')) return 'mac';
  return 'linux';
}

export interface EditorViewProps {
  lines: string[];
  activeLine?: number;
  activeCol?: number;
  executionLine?: number;
  breakpoints?: Set<number>;
  inlineValues?: Record<number, string>;
  onLinesChange?: (lines: string[], activeLine: number, activeCol: number) => void;
  onToggleBreakpoint?: (line: number) => void;
  "aria-label"?: string;
  filePath?: string;
  enableRopeBuffer?: boolean; // Flag to enable rope buffer integration
  diagnostics?: Array<{
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    severity: "Error" | "Warning" | "Information" | "Hint";
    message: string;
  }>;
  onHover?: (line: number, col: number) => void;
  onGotoDefinition?: (line: number, col: number) => void;
  onLspCompletion?: (uri: string, line: number, col: number) => Promise<CompletionItem[]>;
}

export function EditorView({
  lines,
  activeLine = 0,
  activeCol = 0,
  executionLine,
  breakpoints = new Set(),
  inlineValues = {},
  onLinesChange,
  onToggleBreakpoint,
  "aria-label": ariaLabel = "Code editor",
  filePath,
  enableRopeBuffer = false,
  diagnostics = [],
  onHover,
  onGotoDefinition,
  onLspCompletion,
}: EditorViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [cursorX, setCursorX] = useState(0);
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const [tokenCache, setTokenCache] = useState<Record<number, number[]>>({});
  
  // Completion widget state
  const [completionOpen, setCompletionOpen] = useState(false);
  const [completionItems, setCompletionItems] = useState<CompletionItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [completionPosition, setCompletionPosition] = useState({ x: 0, y: 0 });
  const [filterText, setFilterText] = useState("");
  const completionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Context menu state
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [contextMenuItems, setContextMenuItems] = useState<MenuItem[]>([]);
  const contextMenuControllerRef = useRef<ContextMenuController | null>(null);

  // Quick-fix widget state
  const [quickFixOpen, setQuickFixOpen] = useState(false);
  const [quickFixPosition, setQuickFixPosition] = useState({ x: 0, y: 0 });
  const { actions, fetchCodeActions, clearActions } = useCodeActions();

  // Surround With widget state
  const [surroundWithOpen, setSurroundWithOpen] = useState(false);
  const [surroundWithPosition, setSurroundWithPosition] = useState({ x: 0, y: 0 });
  const [selectedTextForSurround, setSelectedTextForSurround] = useState("");

  // Go to Line widget state
  const [isGoToLineOpen, setIsGoToLineOpen] = useState(false);
  // Feature toggles
  const [showMinimap] = useState(true);
  const [showStickyScroll] = useState(true);
  // Code folding state
  const [foldedLines, setFoldedLines] = useState<Set<number>>(new Set());

  // Handle quick-fix action application
  const handleQuickFixApply = useCallback((_action: any) => {
    // For now, just close the widget
    // TODO: Implement actual action application via workspace edit
    setQuickFixOpen(false);
    clearActions();
  }, [clearActions]);

  // Handle surround with template application
  const handleSurroundApply = useCallback((template: SurroundTemplate) => {
    if (!viewModelRef.current || !selectedTextForSurround || !filePath) return;

    const viewModel = viewModelRef.current;
    const selection = viewModel.getSelection();
    
    if (!viewModel.hasSelection()) return;

    const baseIndentation = detectBaseIndentation([selectedTextForSurround]);
    const result = applySurroundTemplate(template, selectedTextForSurround, baseIndentation);

    // Apply the wrapped text as a single atomic edit via rope buffer
    const startLine = Math.min(selection.start.line, selection.end.line);
    const endLine = Math.max(selection.start.line, selection.end.line);
    const startCol = Math.min(selection.start.column, selection.end.column);
    const endCol = Math.max(selection.start.column, selection.end.column);

    // Create atomic edit for the rope buffer
    const edit = {
      range: {
        start: { line: startLine, column: startCol },
        end: { line: endLine, column: endCol }
      },
      newText: result.newText
    };

    // Apply via rope buffer for atomic undo/redo
    invoke("apply_edit", {
      path: filePath,
      edit
    }).then(() => {
      // Refresh the editor content
      onLinesChange?.([...lines], startLine, startCol);
    }).catch(err => {
      console.error("Failed to apply surround edit:", err);
    });

    // Close the widget
    setSurroundWithOpen(false);
    setSelectedTextForSurround("");
  }, [selectedTextForSurround, filePath, lines, onLinesChange]);

  useEffect(() => {
    if (executionLine !== undefined && containerRef.current) {
      const targetScrollTop = Math.max(0, executionLine * LINE_HEIGHT_PX - viewportHeight / 2);
      containerRef.current.scrollTo({ top: targetScrollTop, behavior: "smooth" });
    } else if (activeLine !== undefined && activeLine >= 0 && containerRef.current) {
      const targetScrollTop = Math.max(0, activeLine * LINE_HEIGHT_PX - viewportHeight / 3);
      containerRef.current.scrollTo({ top: targetScrollTop, behavior: "smooth" });
      if (viewModelRef.current) {
        viewModelRef.current.setCursorPosition({ line: activeLine, column: activeCol || 0 });
      }
    }
  }, [executionLine, activeLine, activeCol, viewportHeight]);

  const { measureText } = useTextMeasurement({
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, Consolas, monospace",
    fontSize: 14,
    fontWeight: 600,
    charWidth: 8.4,
  });

  // Synchronous text model buffer ref (VS Code TextModel pattern)
  const bufferRef = useRef<{ lines: string[]; activeLine: number; activeCol: number }>({
    lines: lines || [],
    activeLine: activeLine || 0,
    activeCol: activeCol || 0,
  });

  const undoStackRef = useRef<Array<{ lines: string[]; line: number; col: number }>>([]);
  const redoStackRef = useRef<Array<{ lines: string[]; line: number; col: number }>>([]);
  const prevFilePathRef = useRef<string | undefined>(filePath);

  // Local state for view updates
  const [localLines, setLocalLines] = useState<string[]>(lines || []);
  const [localActiveLine, setLocalActiveLine] = useState(activeLine);
  const [localActiveCol, setLocalActiveCol] = useState(activeCol);
  const [selection, setSelection] = useState<Selection | null>(null);

  const isDraggingRef = useRef<boolean>(false);
  const dragStartPosRef = useRef<{ line: number; column: number } | null>(null);

  // Synchronize buffer with props only on active file change or when undo stack is clean
  useEffect(() => {
    if (filePath !== prevFilePathRef.current) {
      prevFilePathRef.current = filePath;
      undoStackRef.current = [];
      redoStackRef.current = [];
      bufferRef.current = {
        lines: lines || [],
        activeLine: activeLine || 0,
        activeCol: activeCol || 0,
      };
      setLocalLines(lines || []);
      setLocalActiveLine(activeLine || 0);
      setLocalActiveCol(activeCol || 0);
    } else if (undoStackRef.current.length === 0) {
      bufferRef.current.lines = lines || [];
      setLocalLines(lines || []);
    }
  }, [filePath, lines, activeLine, activeCol]);

  // Integrate rope buffer when enabled
  const ropeBuffer = useRopeBuffer(enableRopeBuffer ? filePath : undefined);
  
  const effectiveLines = (enableRopeBuffer && ropeBuffer && ropeBuffer.lines.length > 0)
    ? ropeBuffer.lines
    : localLines;
  const effectiveLineCount = (enableRopeBuffer && ropeBuffer && ropeBuffer.lineCount > 0)
    ? ropeBuffer.lineCount
    : effectiveLines.length;

  // Initialize ViewModel with command system
  const viewModelRef = useRef<ViewModel | null>(null);
  const mouseHandlerRef = useRef<MouseHandler | null>(null);

  const onLinesChangeRef = useRef(onLinesChange);
  useEffect(() => {
    onLinesChangeRef.current = onLinesChange;
  }, [onLinesChange]);

  // Keep ViewModel's internal lines in sync WITHOUT triggering notifyChange
  // (which would call onLinesChange → parent setState → infinite cascade).
  useEffect(() => {
    if (!viewModelRef.current) {
      viewModelRef.current = new ViewModel(effectiveLines, (newLines, line, col) => {
        onLinesChangeRef.current?.(newLines, line, col);
      });
    } else {
      // Directly update internal lines reference to avoid notifyChange feedback loop
      (viewModelRef.current as any).lines = [...effectiveLines];
    }
  }, [effectiveLines]);

  useEffect(() => {
    if (!mouseHandlerRef.current && viewModelRef.current) {
      mouseHandlerRef.current = new MouseHandler({
        viewModel: viewModelRef.current,
        onLinesChange: (...args) => onLinesChangeRef.current?.(...args)
      });
    }
  }, []);

  // Initialize ContextMenuController
  useEffect(() => {
    const initialContextState: EditorContextState = {
      hasSelection: false,
      selectionText: "",
      cursorPosition: { line: activeLine, column: activeCol },
      lspConnected: true, // TODO: Integrate with actual LSP state
      tokenUnderCursor: null,
      diagnosticAtCursor: null,
      fileType: ContextMenuController.detectFileType(filePath),
      isTestContext: ContextMenuController.detectTestContext(effectiveLines, activeLine),
    };

    contextMenuControllerRef.current = new ContextMenuController(
      initialContextState,
      (commandId: string) => {
        const command = commandRegistry.getCommand(commandId);
        if (command && viewModelRef.current) {
          command.execute({ 
            viewModel: viewModelRef.current,
            filePath,
            cursorPosition: { line: activeLine, column: activeCol }
          });
        }
      }
    );
  }, [filePath, effectiveLines, activeLine, activeCol]);

  const { lineGutterSeverities, lineDiagnosticsMap } = useMemo(() => {
    const severities: Record<number, "Error" | "Warning" | "Information" | "Hint"> = {};
    const rangesMap: Record<number, LineDiagnosticRange[]> = {};

    diagnostics.forEach((diag) => {
      const startLine = diag.range.start.line;
      const endLine = diag.range.end.line;

      for (let line = startLine; line <= endLine; line++) {
        if (
          !severities[line] ||
          diag.severity === "Error" ||
          (diag.severity === "Warning" && severities[line] !== "Error") ||
          (diag.severity === "Information" && severities[line] === "Hint")
        ) {
          severities[line] = diag.severity;
        }

        const lineLen = effectiveLines[line] ? effectiveLines[line].length : 0;
        const startCol = line === startLine ? diag.range.start.character : 0;
        const endCol = line === endLine ? Math.max(diag.range.end.character, startCol + 1) : Math.max(lineLen, 1);

        if (!rangesMap[line]) {
          rangesMap[line] = [];
        }
        rangesMap[line].push({
          startCol,
          endCol,
          severity: diag.severity,
          message: diag.message,
        });
      }
    });

    return { lineGutterSeverities: severities, lineDiagnosticsMap: rangesMap };
  }, [diagnostics, effectiveLines]);

  useEffect(() => {
    const handleFindEvent = () => {
      setIsFindOpen((prev) => {
        if (prev && !isReplaceOpen) {
          return false;
        }
        setIsReplaceOpen(false);
        return true;
      });
    };
    const handleReplaceEvent = () => {
      setIsFindOpen((prev) => {
        if (prev && isReplaceOpen) {
          return false;
        }
        setIsReplaceOpen(true);
        return true;
      });
    };
    const handleGoToLineEvent = () => {
      setIsGoToLineOpen((prev) => !prev);
    };
    window.addEventListener("pm:find", handleFindEvent);
    window.addEventListener("pm:replace", handleReplaceEvent);
    window.addEventListener("pm:gotoline", handleGoToLineEvent);
    return () => {
      window.removeEventListener("pm:find", handleFindEvent);
      window.removeEventListener("pm:replace", handleReplaceEvent);
      window.removeEventListener("pm:gotoline", handleGoToLineEvent);
    };
  }, [isReplaceOpen]);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h) setViewportHeight(h);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const { startLine, endLine, totalHeight, topSpacerPx, onScroll } =
    useVirtualScroll({
      totalLines: effectiveLineCount,
      lineHeightPx: LINE_HEIGHT_PX,
      viewportHeightPx: viewportHeight,
    });

  // Word occurrence highlighter
  const wordHighlightMap = useWordHighlighter(
    effectiveLines,
    localActiveLine,
    localActiveCol,
    startLine,
    endLine,
    true
  );

  // Bracket pair matcher
  const bracketMatch = useBracketMatcher(
    effectiveLines,
    localActiveLine,
    localActiveCol,
    true
  );

  // Code folding computations
  const foldingRanges = useMemo(
    () => computeFoldingRanges(effectiveLines),
    [effectiveLines]
  );
  const foldableSet = useMemo(
    () => buildFoldableLineSet(foldingRanges),
    [foldingRanges]
  );
  const hiddenLinesSet = useMemo(
    () => getHiddenLines(foldedLines, foldingRanges),
    [foldedLines, foldingRanges]
  );

  useEffect(() => {
    const activeLineText = effectiveLines[localActiveLine] || "";
    const textBeforeCursor = activeLineText.slice(0, localActiveCol);
    const normalizedText = textBeforeCursor.replace(/\t/g, "    ");
    const width = measureText(normalizedText);
    setCursorX(width);
  }, [localActiveCol, localActiveLine, effectiveLines, measureText]);

  useEffect(() => {
    if (!containerRef.current) return;
    const lineY = localActiveLine * LINE_HEIGHT_PX;
    const st = containerRef.current.scrollTop;
    if (lineY < st) {
      containerRef.current.scrollTop = lineY;
    } else if (lineY > st + viewportHeight - LINE_HEIGHT_PX * 2) {
      containerRef.current.scrollTop = lineY - viewportHeight + LINE_HEIGHT_PX * 2;
    }
  }, [localActiveLine, viewportHeight]);

  // Memoize visible slice — new array reference only when startLine/endLine or content changes
  const visibleLines = useMemo(
    () => effectiveLines.slice(startLine, endLine),
    // Join is a cheap but reliable way to detect actual content change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [startLine, endLine, effectiveLines]
  );

  useEffect(() => {
    let isMounted = true;

    if (!window.__TAURI_INTERNALS__) {
      const fallbackTokens = visibleLines.map((line) => {
        const tokens: number[] = [];
        const pushToken = (start: number, kind: number) => {
          const metadata = kind << 15;
          tokens.push(start, metadata);
        };

        if (line.trim().startsWith("//")) {
          pushToken(0, 4);
          return tokens;
        }

        const words = line.matchAll(/([a-zA-Z_]\w*|"[^"]*"|'[^']*'|[{}()[\];,.=+\-*/]|[\s]+)/g);
        for (const match of words) {
          const word = match[0];
          const idx = match.index!;
          if (word.startsWith('"') || word.startsWith("'")) {
            pushToken(idx, 2);
          } else if (["import", "export", "function", "const", "let", "var", "return", "from", "fn", "pub", "struct", "enum", "impl", "use", "mod"].includes(word)) {
            pushToken(idx, 1);
          } else if (["React", "useState", "useEffect", "Component", "String", "Vec", "Option", "Result", "PathBuf", "DefinitionResolver"].includes(word)) {
            pushToken(idx, 6);
          } else if (!word.trim()) {
            pushToken(idx, 0);
          } else if (/[{}()[\];,.=+\-*/]/.test(word)) {
            pushToken(idx, 8);
          } else if (!isNaN(Number(word))) {
            pushToken(idx, 3);
          } else {
            pushToken(idx, 0);
          }
        }
        return tokens;
      });

      setTokenCache(() => {
        const next: Record<number, number[]> = {};
        fallbackTokens.forEach((tokens, i) => {
          next[startLine + i] = tokens;
        });
        return next;
      });
      return;
    }

    // Debounce Tauri IPC call by 30ms so rapid scrolling doesn't flood the backend
    const timer = setTimeout(() => {
      if (!isMounted) return;
      invoke<number[][]>("tokenize_lines", { lines: visibleLines })
        .then((tokenArrays) => {
          if (!isMounted) return;
          setTokenCache(() => {
            const next: Record<number, number[]> = {};
            tokenArrays.forEach((tokens, i) => {
              next[startLine + i] = tokens;
            });
            return next;
          });
        })
        .catch(console.error);
    }, 30);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [visibleLines, startLine]);

  const getLineSelectionRange = useCallback(
    (lineIdx: number): { startCol: number; endCol: number } | null => {
      const vm = viewModelRef.current;
      if (!vm || !vm.hasSelection()) return null;
      const sel = vm.getSelection();

      let l1 = sel.start.line;
      let c1 = sel.start.column;
      let l2 = sel.end.line;
      let c2 = sel.end.column;

      if (l1 > l2 || (l1 === l2 && c1 > c2)) {
        [l1, l2] = [l2, l1];
        [c1, c2] = [c2, c1];
      }

      if (lineIdx < l1 || lineIdx > l2) return null;

      const lineLen = effectiveLines[lineIdx] ? effectiveLines[lineIdx].length : 0;

      if (l1 === l2) {
        return { startCol: c1, endCol: c2 };
      }
      if (lineIdx === l1) {
        return { startCol: c1, endCol: lineLen + 1 };
      }
      if (lineIdx === l2) {
        return { startCol: 0, endCol: c2 };
      }
      return { startCol: 0, endCol: lineLen + 1 };
    },
    [effectiveLines]
  );

  const handleContextMenu = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!contextMenuControllerRef.current) return;

    const vm = viewModelRef.current;
    const hasSel = vm ? vm.hasSelection() : false;
    let selText = "";
    if (hasSel && vm) {
      const sel = vm.getSelection();
      let l1 = sel.start.line, c1 = sel.start.column;
      let l2 = sel.end.line, c2 = sel.end.column;
      if (l1 > l2 || (l1 === l2 && c1 > c2)) {
        [l1, l2] = [l2, l1];
        [c1, c2] = [c2, c1];
      }
      if (l1 === l2) {
        selText = (effectiveLines[l1] || "").substring(c1, c2);
      } else {
        let t = (effectiveLines[l1] || "").substring(c1) + "\n";
        for (let i = l1 + 1; i < l2; i++) {
          t += (effectiveLines[i] || "") + "\n";
        }
        t += (effectiveLines[l2] || "").substring(0, c2);
        selText = t;
      }
    }

    const line = effectiveLines[activeLine] || "";
    const tokenUnderCursor = ContextMenuController.detectTokenUnderCursor(line, activeCol);
    const diagnosticAtCursor = ContextMenuController.findDiagnosticAtCursor(diagnostics, activeLine, activeCol);

    contextMenuControllerRef.current.updateContextState({
      hasSelection: hasSel,
      selectionText: selText,
      cursorPosition: { line: activeLine, column: activeCol },
      lspConnected: true,
      tokenUnderCursor,
      diagnosticAtCursor,
      fileType: ContextMenuController.detectFileType(filePath),
      isTestContext: ContextMenuController.detectTestContext(effectiveLines, activeLine),
    });

    const items = contextMenuControllerRef.current.getMenuItems();
    setContextMenuItems(items);
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setContextMenuOpen(true);
  };

  const handleContextMenuSelect = (item: MenuItem) => {
    if (contextMenuControllerRef.current) {
      contextMenuControllerRef.current.executeMenuItem(item);
    }
    setContextMenuOpen(false);
  };

  const getPosFromMouseEvent = useCallback(
    (e: ReactMouseEvent<HTMLDivElement> | MouseEvent): { line: number; column: number } => {
      if (!containerRef.current) return { line: 0, column: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const scrollTop = containerRef.current.scrollTop;

      const y = e.clientY - rect.top + scrollTop;
      let clickedLine = Math.floor(y / LINE_HEIGHT_PX);

      if (clickedLine >= effectiveLines.length) clickedLine = Math.max(0, effectiveLines.length - 1);
      if (clickedLine < 0) clickedLine = 0;

      let col = -1;

      if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(e.clientX, e.clientY);
        if (range && range.startContainer) {
          const node = range.startContainer;
          if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
            let charOffset = range.startOffset;
            let sibling = node.parentElement.previousSibling;
            while (sibling) {
              charOffset += sibling.textContent?.length || 0;
              sibling = sibling.previousSibling;
            }
            col = charOffset;
          } else if (
            (node as HTMLElement).className &&
            typeof (node as HTMLElement).className === "string" &&
            (node as HTMLElement).className.includes("lineContent")
          ) {
            col = effectiveLines[clickedLine] ? effectiveLines[clickedLine].length : 0;
          }
        }
      } else if ((document as any).caretPositionFromPoint) {
        const pos = (document as any).caretPositionFromPoint(e.clientX, e.clientY);
        if (pos && pos.offsetNode) {
          const node = pos.offsetNode;
          if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
            let charOffset = pos.offset;
            let sibling = node.parentElement.previousSibling;
            while (sibling) {
              charOffset += sibling.textContent?.length || 0;
              sibling = sibling.previousSibling;
            }
            col = charOffset;
          } else if (
            (node as HTMLElement).className &&
            typeof (node as HTMLElement).className === "string" &&
            (node as HTMLElement).className.includes("lineContent")
          ) {
            col = effectiveLines[clickedLine] ? effectiveLines[clickedLine].length : 0;
          }
        }
      }

      if (col === -1) {
        const targetClass = (e.target as HTMLElement)?.className || "";
        if (
          typeof targetClass === "string" &&
          (targetClass.includes("lineContent") ||
            targetClass.includes("editorScrollContainer") ||
            targetClass.includes("linesContainer") ||
            targetClass.includes("editorInner"))
        ) {
          col = effectiveLines[clickedLine] ? effectiveLines[clickedLine].length : 0;
        } else {
          const x = e.clientX - rect.left - GUTTER_TOTAL_OFFSET;
          col = Math.max(0, Math.round(x / 8.4));
        }
      }

      const lineLen = effectiveLines[clickedLine] ? effectiveLines[clickedLine].length : 0;
      const finalCol = Math.min(col, lineLen);
      return { line: clickedLine, column: finalCol };
    },
    [effectiveLines]
  );

  const handleMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (isDraggingRef.current && dragStartPosRef.current) {
      const endPos = getPosFromMouseEvent(e);
      const startPos = dragStartPosRef.current;
      if (startPos.line !== endPos.line || startPos.column !== endPos.column) {
        const newSel: Selection = { start: startPos, end: endPos };
        setSelection(newSel);
        if (viewModelRef.current) viewModelRef.current.setSelection(newSel);
        bufferRef.current.activeLine = endPos.line;
        bufferRef.current.activeCol = endPos.column;
        setLocalActiveLine(endPos.line);
        setLocalActiveCol(endPos.column);
        return;
      }
    }

    if (onHover && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const scrollTop = containerRef.current.scrollTop;
      const y = e.clientY - rect.top + scrollTop;
      const line = Math.floor(y / LINE_HEIGHT_PX);

      if (line >= 0 && line < effectiveLines.length && line !== activeLine) {
        const lineText = effectiveLines[line] || "";
        const x = e.clientX - rect.left - GUTTER_TOTAL_OFFSET;
        const col = Math.max(0, Math.min(Math.round(x / 8.1), lineText.length));

        onHover(line, col);
      }
    }
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      isDraggingRef.current = false;
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  // Extract word prefix before cursor for completion
  const getWordPrefix = useCallback((line: string, col: number): { prefix: string; start: number } => {
    const before = line.slice(0, col);
    const match = before.match(/[\w_]+$/);
    if (match) {
      return { prefix: match[0], start: col - match[0].length };
    }
    return { prefix: "", start: col };
  }, []);

  // Request completions from LSP
  const requestCompletions = useCallback(async (isManualTrigger = false) => {
    if (!filePath) return;
    
    const lineText = effectiveLines[activeLine] || "";
    const charBeforeCursor = activeCol > 0 ? lineText[activeCol - 1] : "";
    const { prefix } = getWordPrefix(lineText, activeCol);
    const isTriggerChar = [".", ":", "#", "$"].includes(charBeforeCursor);

    // Don't auto-popup on empty lines or spaces unless manually triggered (Ctrl+Space) or after a trigger char or active word prefix
    if (!isManualTrigger && !isTriggerChar && !prefix) {
      setCompletionOpen(false);
      return;
    }
    
    const uri = pathToUri(filePath);
    
    try {
      // Use the provided onLspCompletion if available, otherwise fall back to direct IPC call
      let items: CompletionItem[];
      if (onLspCompletion) {
        items = await onLspCompletion(uri, activeLine, activeCol);
      } else {
        items = await lspCompletion(uri, activeLine, activeCol);
      }
      
      setCompletionItems(items);
      setFilterText(prefix);
      setSelectedIndex(0);
      
      // Calculate widget position
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const x = rect.left + GUTTER_TOTAL_OFFSET + cursorX;
        const y = rect.top + (activeLine - startLine + 1) * LINE_HEIGHT_PX;
        setCompletionPosition({ x, y });
      }
      
      setCompletionOpen(items.length > 0);
    } catch (err) {
      console.error("Completion request failed:", err);
      setCompletionOpen(false);
    }
  }, [filePath, effectiveLines, activeLine, activeCol, cursorX, startLine, getWordPrefix, onLspCompletion]);

  // Trigger completion with debouncing
  const triggerCompletion = useCallback((triggerInstant = false) => {
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
    }
    const delay = triggerInstant ? 0 : 75;
    completionTimeoutRef.current = setTimeout(() => {
      requestCompletions(triggerInstant);
    }, delay);
  }, [requestCompletions]);

  // Handle completion selection with Rust-specific insertion logic
  const handleCompletionSelect = useCallback((item: CompletionItem) => {
    const currentLines = bufferRef.current.lines.length > 0 ? bufferRef.current.lines : effectiveLines;
    const line = currentLines[activeLine] || "";
    const { start } = getWordPrefix(line, activeCol);
    let insertText = item.insertText || item.label;
    let newCol = start + insertText.length;
    
    // Rust-specific: Position cursor inside parentheses for function calls
    if (insertText.endsWith("()") && !insertText.includes("$0")) {
      insertText = insertText.slice(0, -1) + "$0)";
      newCol = start + insertText.indexOf("$0");
    }
    
    // Rust-specific: Preserve macro delimiters
    if (item.label.endsWith("!") && !insertText.endsWith("!")) {
      insertText += "!";
      newCol = start + insertText.length;
    }
    
    const cleanText = insertText.replace("$0", "");
    // Replace word prefix (from start to activeCol) with cleanText
    const newLine = line.slice(0, start) + cleanText + line.slice(activeCol);
    const newLines = [...currentLines];
    newLines[activeLine] = newLine;
    
    bufferRef.current = {
      lines: newLines,
      activeLine,
      activeCol: newCol,
    };
    setLocalLines(newLines);
    setLocalActiveLine(activeLine);
    setLocalActiveCol(newCol);
    if (viewModelRef.current) {
      viewModelRef.current.setLines(newLines);
      viewModelRef.current.setCursorPosition({ line: activeLine, column: newCol });
    }
    onLinesChangeRef.current?.(newLines, activeLine, newCol);
    setCompletionOpen(false);
    setFilterText("");
    
    // Sync with LSP
    if (filePath) {
      const uri = pathToUri(filePath);
      lspSyncDocument({
        uri,
        version: Date.now(),
        changes: [{
          range: {
            start: { line: activeLine, character: start },
            end: { line: activeLine, character: activeCol }
          },
          text: cleanText
        }]
      }).catch(console.error);
    }
  }, [effectiveLines, activeLine, activeCol, filePath, getWordPrefix, lspSyncDocument]);

  // Handle completion navigation
  const handleCompletionNavigate = useCallback((direction: "up" | "down") => {
    if (!completionOpen || completionItems.length === 0) return;
    
    if (direction === "up") {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : completionItems.length - 1));
    } else {
      setSelectedIndex((prev) => (prev < completionItems.length - 1 ? prev + 1 : 0));
    }
  }, [completionOpen, completionItems.length]);

  // Close completion widget
  const closeCompletion = useCallback(() => {
    setCompletionOpen(false);
    setFilterText("");
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }
  }, []);

  // Synchronize state from ViewModel after command execution
  const syncFromViewModel = useCallback(() => {
    if (!viewModelRef.current) return;
    const vm = viewModelRef.current;
    const newLines = vm.getLines();
    const cursor = vm.getCursorPosition();

    const linesChanged =
      newLines.length !== bufferRef.current.lines.length ||
      newLines.some((l, idx) => l !== bufferRef.current.lines[idx]);

    if (linesChanged) {
      undoStackRef.current.push({
        lines: [...bufferRef.current.lines],
        line: bufferRef.current.activeLine,
        col: bufferRef.current.activeCol,
      });
      if (undoStackRef.current.length > 200) {
        undoStackRef.current.shift();
      }
      redoStackRef.current = [];
    }

    bufferRef.current = {
      lines: newLines,
      activeLine: cursor.line,
      activeCol: cursor.column,
    };
    setLocalLines(newLines);
    setLocalActiveLine(cursor.line);
    setLocalActiveCol(cursor.column);
    const sel = vm.hasSelection() ? vm.getSelection() : null;
    setSelection(sel);
    onLinesChange?.(newLines, cursor.line, cursor.column);
  }, [onLinesChange]);

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // Intercept keys when completion is open
    if (completionOpen) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeCompletion();
        return;
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        handleCompletionNavigate(e.key === "ArrowUp" ? "up" : "down");
        return;
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const filtered = filterText
          ? completionItems.filter((item) => {
              if (!item.label) return false;
              return item.label.toLowerCase().includes(filterText.toLowerCase());
            })
          : completionItems;

        const targetItem = filtered[selectedIndex] || completionItems[selectedIndex] || completionItems[0];
        if (targetItem) {
          handleCompletionSelect(targetItem);
        } else {
          closeCompletion();
        }
        return;
      }
    }

    // Quick-fix trigger: Alt+Enter or Ctrl+.
    if ((e.altKey && e.key === "Enter") || (e.ctrlKey && e.key === ".")) {
      e.preventDefault();
      if (filePath) {
        const uri = pathToUri(filePath);
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const x = rect.left + GUTTER_TOTAL_OFFSET + cursorX;
          const y = rect.top + (activeLine - startLine + 1) * LINE_HEIGHT_PX;
          setQuickFixPosition({ x, y });
          fetchCodeActions(uri, activeLine, activeCol);
          setQuickFixOpen(true);
        }
      }
      return;
    }

    // Go To Line trigger: Ctrl+G
    if (e.ctrlKey && e.key.toLowerCase() === "g" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      setIsGoToLineOpen((prev) => !prev);
      return;
    }

    // Surround With trigger: Ctrl+Alt+T
    if (e.ctrlKey && e.altKey && e.key === "t") {
      e.preventDefault();
      const viewModel = viewModelRef.current;
      if (viewModel && viewModel.hasSelection()) {
        const selection = viewModel.getSelection();
        const startLine = Math.min(selection.start.line, selection.end.line);
        const endLine = Math.max(selection.start.line, selection.end.line);
        const startCol = Math.min(selection.start.column, selection.end.column);
        const endCol = Math.max(selection.start.column, selection.end.column);

        // Extract selected text
        let selectedText = "";
        for (let line = startLine; line <= endLine; line++) {
          const lineText = viewModel.getLine(line);
          if (line === startLine && line === endLine) {
            selectedText = lineText.substring(startCol, endCol);
          } else if (line === startLine) {
            selectedText = lineText.substring(startCol);
          } else if (line === endLine) {
            selectedText += "\n" + lineText.substring(0, endCol);
          } else {
            selectedText += "\n" + lineText;
          }
        }

        setSelectedTextForSurround(selectedText);

        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const x = rect.left + GUTTER_TOTAL_OFFSET + cursorX;
          const y = rect.top + (activeLine - startLine + 1) * LINE_HEIGHT_PX;
          setSurroundWithPosition({ x, y });
          setSurroundWithOpen(true);
        }
      }
      return;
    }

    // Close quick-fix on Escape
    if (quickFixOpen && e.key === "Escape") {
      e.preventDefault();
      setQuickFixOpen(false);
      clearActions();
      return;
    }

    // Close surround widget on Escape
    if (surroundWithOpen && e.key === "Escape") {
      e.preventDefault();
      setSurroundWithOpen(false);
      setSelectedTextForSurround("");
      return;
    }

    // Try command registry first for registered commands
    const keybinding = formatKeybinding(e);
    const platform = getPlatform();
    const command = commandRegistry.getCommandForKey(keybinding, platform);
    
    if (command && viewModelRef.current) {
      e.preventDefault();
      const vm = viewModelRef.current;
      vm.setLines(bufferRef.current.lines);
      vm.setCursorPosition({
        line: bufferRef.current.activeLine,
        column: bufferRef.current.activeCol,
      });

      const res = command.execute({ viewModel: vm });
      if (res && typeof (res as any).then === "function") {
        (res as Promise<void>).then(() => syncFromViewModel());
      } else {
        syncFromViewModel();
      }
      return;
    }

    // In-memory Undo / Redo shortcuts for zero-latency instant editing
    if (e.ctrlKey && e.key.toLowerCase() === "z" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const prev = undoStackRef.current.pop();
      if (prev) {
        redoStackRef.current.push({
          lines: [...bufferRef.current.lines],
          line: bufferRef.current.activeLine,
          col: bufferRef.current.activeCol,
        });
        bufferRef.current = { lines: prev.lines, activeLine: prev.line, activeCol: prev.col };
        setLocalLines(prev.lines);
        setLocalActiveLine(prev.line);
        setLocalActiveCol(prev.col);
        onLinesChange?.(prev.lines, prev.line, prev.col);
      }
      return;
    } else if (
      (e.ctrlKey && e.key.toLowerCase() === "y" && !e.shiftKey && !e.altKey) ||
      (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "z" && !e.altKey)
    ) {
      e.preventDefault();
      const next = redoStackRef.current.pop();
      if (next) {
        undoStackRef.current.push({
          lines: [...bufferRef.current.lines],
          line: bufferRef.current.activeLine,
          col: bufferRef.current.activeCol,
        });
        bufferRef.current = { lines: next.lines, activeLine: next.line, activeCol: next.col };
        setLocalLines(next.lines);
        setLocalActiveLine(next.line);
        setLocalActiveCol(next.col);
        onLinesChange?.(next.lines, next.line, next.col);
      }
      return;
    }
    
    if (!onLinesChange) return;

    let newLines = [...bufferRef.current.lines];
    let nLine = bufferRef.current.activeLine;
    let nCol = bufferRef.current.activeCol;
    let isTriggerChar = false;

    // Handle selection deletion when Backspace, Delete, Enter, or a printable key is pressed
    const vmForSelection = viewModelRef.current;
    let selectionWasDeleted = false;
    if (
      vmForSelection &&
      vmForSelection.hasSelection() &&
      (e.key === "Backspace" ||
        e.key === "Delete" ||
        e.key === "Enter" ||
        (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey))
    ) {
      const sel = vmForSelection.getSelection();
      let l1 = sel.start.line;
      let c1 = sel.start.column;
      let l2 = sel.end.line;
      let c2 = sel.end.column;

      if (l1 > l2 || (l1 === l2 && c1 > c2)) {
        [l1, l2] = [l2, l1];
        [c1, c2] = [c2, c1];
      }

      const startLineText = newLines[l1] || "";
      const endLineText = newLines[l2] || "";
      const prefix = startLineText.slice(0, c1);
      const suffix = endLineText.slice(c2);

      newLines.splice(l1, l2 - l1 + 1, prefix + suffix);
      if (newLines.length === 0) {
        newLines.push("");
      }

      nLine = l1;
      nCol = c1;
      vmForSelection.clearSelection();
      setSelection(null);
      selectionWasDeleted = true;
    }

    if (e.ctrlKey && e.key.toLowerCase() === "f" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      setIsFindOpen((prev) => (prev && !isReplaceOpen ? false : true));
      setIsReplaceOpen(false);
    } else if (e.ctrlKey && e.key.toLowerCase() === "h" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      setIsFindOpen((prev) => (prev && isReplaceOpen ? false : true));
      setIsReplaceOpen(true);
    } else if (e.key === "F12") {
      e.preventDefault();
      onGotoDefinition?.(activeLine, activeCol);
      return;
    } else if (e.key === " " && e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      triggerCompletion(true);
      return;
    } else if (e.key === "ArrowLeft") {
      if (nCol > 0) nCol -= 1;
      else if (nLine > 0) {
        nLine -= 1;
        nCol = newLines[nLine].length;
      }
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      if (nCol < newLines[nLine].length) nCol += 1;
      else if (nLine < newLines.length - 1) {
        nLine += 1;
        nCol = 0;
      }
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      if (nLine > 0) {
        nLine -= 1;
        nCol = Math.min(nCol, newLines[nLine].length);
      }
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      if (nLine < newLines.length - 1) {
        nLine += 1;
        nCol = Math.min(nCol, newLines[nLine].length);
      }
      e.preventDefault();
    } else if (e.key === "Backspace" || e.key === "Delete") {
      if (selectionWasDeleted) {
        e.preventDefault();
        closeCompletion();
      } else if (e.key === "Backspace") {
        const line = newLines[nLine] || "";
        if (nCol > 0) {
          const charBefore = line[nCol - 1];
          const charAfter = line[nCol];
          const isBracketPair =
            (charBefore === "(" && charAfter === ")") ||
            (charBefore === "[" && charAfter === "]") ||
            (charBefore === "{" && charAfter === "}") ||
            (charBefore === '"' && charAfter === '"') ||
            (charBefore === "'" && charAfter === "'") ||
            (charBefore === "`" && charAfter === "`");

          if (isBracketPair) {
            newLines[nLine] = line.slice(0, nCol - 1) + line.slice(nCol + 1);
            nCol -= 1;
          } else {
            const before = line.slice(0, nCol);
            // Smart indentation backspace: if text before cursor is pure whitespace, delete full 4-space tab stop
            if (/^\s+$/.test(before)) {
              const deleteCount = before.length % 4 || 4;
              newLines[nLine] = line.slice(0, nCol - deleteCount) + line.slice(nCol);
              nCol -= deleteCount;
            } else {
              newLines[nLine] = line.slice(0, nCol - 1) + line.slice(nCol);
              nCol -= 1;
            }
          }
        } else if (nLine > 0) {
          // Line merge: if current line is blank/whitespace-only, remove line cleanly without attaching trailing spaces to previous line
          const currentTrimmed = line.trim();
          const prevLine = newLines[nLine - 1] || "";
          if (currentTrimmed === "") {
            newLines.splice(nLine, 1);
            nLine -= 1;
            nCol = prevLine.length;
          } else {
            const prevLen = prevLine.length;
            newLines[nLine - 1] += line.trimStart();
            newLines.splice(nLine, 1);
            nLine -= 1;
            nCol = prevLen;
          }
        }
        e.preventDefault();
        closeCompletion();
      } else if (e.key === "Delete") {
        const line = newLines[nLine] || "";
        if (nCol < line.length) {
          newLines[nLine] = line.slice(0, nCol) + line.slice(nCol + 1);
        } else if (nLine < newLines.length - 1) {
          const nextLine = newLines[nLine + 1] || "";
          newLines[nLine] += nextLine;
          newLines.splice(nLine + 1, 1);
        }
        e.preventDefault();
        closeCompletion();
      }
    } else if (e.key === "Enter") {
      const line = newLines[nLine] || "";
      const before = line.slice(0, nCol);
      const after = line.slice(nCol);

      // Inherit leading indentation from current line
      const indentMatch = line.match(/^(\s*)/);
      const baseIndent = indentMatch ? indentMatch[1] : "";

      const trimmedBefore = before.trimEnd();
      const trimmedAfter = after.trimStart();

      // Bracket-split: e.g. cursor between `{` and `}`, `(` and `)`, or `[` and `]`
      if (/[{(\[]$/.test(trimmedBefore) && /^[}\]\)]/.test(trimmedAfter)) {
        const innerIndent = baseIndent + "    ";
        newLines[nLine] = before;
        newLines.splice(nLine + 1, 0, innerIndent);
        newLines.splice(nLine + 2, 0, baseIndent + after);
        nLine += 1;
        nCol = innerIndent.length;
      } else if (/[{(\[:]$/.test(trimmedBefore)) {
        const nextIndent = baseIndent + "    ";
        newLines[nLine] = before;
        newLines.splice(nLine + 1, 0, nextIndent + after);
        nLine += 1;
        nCol = nextIndent.length;
      } else {
        newLines[nLine] = before;
        newLines.splice(nLine + 1, 0, baseIndent + after);
        nLine += 1;
        nCol = baseIndent.length;
      }
      e.preventDefault();
      closeCompletion();
    } else if (e.key === "Tab") {
      e.preventDefault();
      const tabSpaces = "    ";
      const viewModel = viewModelRef.current;
      
      if (viewModel && viewModel.hasSelection()) {
        const selection = viewModel.getSelection();
        const startL = Math.min(selection.start.line, selection.end.line);
        const endL = Math.max(selection.start.line, selection.end.line);

        for (let l = startL; l <= endL; l++) {
          const lText = newLines[l] || "";
          if (e.shiftKey) {
            if (lText.startsWith(tabSpaces)) {
              newLines[l] = lText.slice(4);
            } else if (lText.startsWith("\t")) {
              newLines[l] = lText.slice(1);
            } else {
              let cnt = 0;
              while (cnt < 4 && lText[cnt] === " ") cnt++;
              if (cnt > 0) newLines[l] = lText.slice(cnt);
            }
          } else {
            newLines[l] = tabSpaces + lText;
          }
        }
        nCol = e.shiftKey ? Math.max(0, nCol - 4) : nCol + 4;
      } else {
        if (e.shiftKey) {
          const lText = newLines[nLine] || "";
          if (lText.slice(0, nCol).endsWith(tabSpaces)) {
            newLines[nLine] = lText.slice(0, nCol - 4) + lText.slice(nCol);
            nCol = Math.max(0, nCol - 4);
          } else if (lText.slice(0, nCol).endsWith("\t")) {
            newLines[nLine] = lText.slice(0, nCol - 1) + lText.slice(nCol);
            nCol = Math.max(0, nCol - 1);
          } else if (lText.startsWith(tabSpaces)) {
            newLines[nLine] = lText.slice(4);
            nCol = Math.max(0, nCol - 4);
          }
        } else {
          const line = newLines[nLine] || "";
          newLines[nLine] = line.slice(0, nCol) + tabSpaces + line.slice(nCol);
          nCol += 4;
        }
      }
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const char = e.key;
      const line = newLines[nLine] || "";

      const bracketPairs: Record<string, string> = {
        "(": ")",
        "[": "]",
        "{": "}",
        '"': '"',
        "'": "'",
        "`": "`",
      };
      const closingChars = new Set([")", "]", "}", '"', "'", "`"]);

      if (closingChars.has(char) && line[nCol] === char) {
        // Skip over existing closing character
        nCol += 1;
      } else if (bracketPairs[char]) {
        const closing = bracketPairs[char];
        const charAfter = line[nCol] || "";
        if ((char === '"' || char === "'" || char === "`") && /[a-zA-Z0-9_]/.test(charAfter)) {
          newLines[nLine] = line.slice(0, nCol) + char + line.slice(nCol);
          nCol += 1;
        } else {
          newLines[nLine] = line.slice(0, nCol) + char + closing + line.slice(nCol);
          nCol += 1;
        }
      } else {
        newLines[nLine] = line.slice(0, nCol) + char + line.slice(nCol);
        nCol += 1;
      }
      e.preventDefault();
      
      // Check for Rust-idiomatic trigger characters
      if (e.key === "." || e.key === ":" || e.key === "#" || e.key === "$") {
        isTriggerChar = true;
      }
    } else {
      return;
    }

    // Save snapshot for undo before committing edit mutation
    undoStackRef.current.push({
      lines: [...bufferRef.current.lines],
      line: bufferRef.current.activeLine,
      col: bufferRef.current.activeCol,
    });
    if (undoStackRef.current.length > 200) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];

    bufferRef.current = { lines: newLines, activeLine: nLine, activeCol: nCol };
    setLocalLines(newLines);
    setLocalActiveLine(nLine);
    setLocalActiveCol(nCol);
    onLinesChange(newLines, nLine, nCol);
    
    // Trigger completion after character insertion
    if (isTriggerChar) {
      triggerCompletion(true);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      triggerCompletion(false);
    }
  };

  const handleMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    containerRef.current?.focus();
    if (!onLinesChange || !containerRef.current) return;

    const pos = getPosFromMouseEvent(e);

    // Right click (button 2): preserve selection if clicked inside active selection
    if (e.button === 2) {
      const vm = viewModelRef.current;
      if (vm && vm.hasSelection()) {
        const sel = vm.getSelection();
        let l1 = sel.start.line, c1 = sel.start.column;
        let l2 = sel.end.line, c2 = sel.end.column;
        if (l1 > l2 || (l1 === l2 && c1 > c2)) {
          [l1, l2] = [l2, l1];
          [c1, c2] = [c2, c1];
        }
        const inside =
          pos.line >= l1 &&
          pos.line <= l2 &&
          (pos.line !== l1 || pos.column >= c1) &&
          (pos.line !== l2 || pos.column <= c2);

        if (inside) {
          return;
        }
      }
    }

    dragStartPosRef.current = pos;
    isDraggingRef.current = true;

    if (e.shiftKey && bufferRef.current) {
      const anchor = selection ? selection.start : { line: bufferRef.current.activeLine, column: bufferRef.current.activeCol };
      const newSel: Selection = { start: anchor, end: pos };
      setSelection(newSel);
      if (viewModelRef.current) viewModelRef.current.setSelection(newSel);
    } else {
      bufferRef.current.activeLine = pos.line;
      bufferRef.current.activeCol = pos.column;
      setLocalActiveLine(pos.line);
      setLocalActiveCol(pos.column);
      setSelection(null);
      if (viewModelRef.current) viewModelRef.current.clearSelection();
      onLinesChange(effectiveLines, pos.line, pos.column);
    }
  };

  const calculatedTotalHeight = Math.max(
    effectiveLineCount * LINE_HEIGHT_PX + OVERSCROLL_BOTTOM_PX,
    totalHeight + OVERSCROLL_BOTTOM_PX
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <FindWidget
        isOpen={isFindOpen}
        isReplaceOpen={isReplaceOpen}
        lines={effectiveLines}
        activeLine={activeLine}
        onNavigateToMatch={(lineIdx, col) => {
          onLinesChange?.(effectiveLines, lineIdx, col);
        }}
        onLinesChange={(newLines, nLine, nCol) => {
          onLinesChange?.(newLines, nLine, nCol);
        }}
        onClose={() => {
          setIsFindOpen(false);
          setIsReplaceOpen(false);
        }}
      />
      
      {completionOpen && (
        <CompletionWidget
          x={completionPosition.x}
          y={completionPosition.y}
          items={completionItems}
          selectedIndex={selectedIndex}
          filterText={filterText}
          onSelect={handleCompletionSelect}
          onClose={closeCompletion}
          onNavigate={handleCompletionNavigate}
        />
      )}

      {quickFixOpen && (
        <QuickFixWidget
          position={quickFixPosition}
          actions={actions}
          onApply={handleQuickFixApply}
          onClose={() => {
            setQuickFixOpen(false);
            clearActions();
          }}
        />
      )}

      {surroundWithOpen && (
        <SurroundWithWidget
          position={surroundWithPosition}
          selectedText={selectedTextForSurround}
          onApply={handleSurroundApply}
          onClose={() => {
            setSurroundWithOpen(false);
            setSelectedTextForSurround("");
          }}
        />
      )}

      {contextMenuOpen && (
        <ContextMenu
          isOpen={contextMenuOpen}
          position={contextMenuPosition}
          onClose={() => setContextMenuOpen(false)}
          items={contextMenuItems}
          onSelect={handleContextMenuSelect}
        />
      )}


      {isGoToLineOpen && (
        <GoToLineWidget
          isOpen={isGoToLineOpen}
          totalLines={effectiveLines.length}
          onGoToLine={(targetLine) => {
            if (viewModelRef.current) {
              viewModelRef.current.setCursorPosition({ line: targetLine, column: 0 });
            }
            bufferRef.current.activeLine = targetLine;
            bufferRef.current.activeCol = 0;
            setLocalActiveLine(targetLine);
            setLocalActiveCol(0);
            onLinesChange?.(effectiveLines, targetLine, 0);
          }}
          onClose={() => setIsGoToLineOpen(false)}
        />
      )}

      {showStickyScroll && (
        <StickyScroll
          lines={effectiveLines}
          startLine={startLine}
          onJumpToLine={(targetLine) => {
            if (containerRef.current) {
              containerRef.current.scrollTop = targetLine * LINE_HEIGHT_PX;
            }
          }}
        />
      )}

      {showMinimap && (
        <Minimap
          lines={effectiveLines}
          totalLines={effectiveLines.length}
          startLine={startLine}
          endLine={endLine}
          activeLine={activeLine}
          viewportHeight={viewportHeight}
          onJumpToLine={(targetLine) => {
            if (containerRef.current) {
              containerRef.current.scrollTop = targetLine * LINE_HEIGHT_PX;
            }
          }}
        />
      )}

      <div
        ref={containerRef}
        className={styles.editorScrollContainer}
        onScroll={onScroll}
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onContextMenu={handleContextMenu}
      >
        <div
          className={styles.editorInner}
          style={{ height: `${calculatedTotalHeight}px` }}
          aria-hidden="true"
        >
          <div style={{ height: `${topSpacerPx}px` }} />

          <div className={styles.linesContainer} onMouseDown={handleMouseDown}>
            {visibleLines.map((content, i) => {
              const lineIndex = startLine + i;

              if (hiddenLinesSet.has(lineIndex)) {
                return null;
              }

              const wordRanges = wordHighlightMap.ranges.get(lineIndex) || [];
              const bracketRange =
                bracketMatch.source?.line === lineIndex
                  ? bracketMatch.source
                  : bracketMatch.target?.line === lineIndex
                  ? bracketMatch.target
                  : null;

              return (
                <EditorLine
                  key={lineIndex}
                  lineIndex={lineIndex}
                  content={content}
                  isActive={lineIndex === activeLine}
                  isExecutionLine={executionLine === lineIndex}
                  hasBreakpoint={breakpoints.has(lineIndex)}
                  inlineValue={inlineValues[lineIndex]}
                  tokens={tokenCache[lineIndex]}
                  onToggleBreakpoint={onToggleBreakpoint}
                  diagnosticSeverity={lineGutterSeverities[lineIndex]}
                  lineDiagnostics={lineDiagnosticsMap[lineIndex]}
                  selectionRange={getLineSelectionRange(lineIndex)}
                  wordHighlightRanges={wordRanges}
                  bracketMatchRange={bracketRange}
                  isFoldable={foldableSet.has(lineIndex)}
                  isFolded={foldedLines.has(lineIndex)}
                  onToggleFold={(idx) => {
                    setFoldedLines((prev) => {
                      const next = new Set(prev);
                      if (next.has(idx)) next.delete(idx);
                      else next.add(idx);
                      return next;
                    });
                  }}
                />
              );
            })}

            {activeLine >= startLine && activeLine < endLine && (
              <div
                className={styles.cursor}
                style={{
                  top: 0,
                  left: 0,
                  transform: `translate3d(${GUTTER_TOTAL_OFFSET + cursorX}px, ${(activeLine - startLine) * LINE_HEIGHT_PX + 1}px, 0)`,
                  willChange: "transform",
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default EditorView;