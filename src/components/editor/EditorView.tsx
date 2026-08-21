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
import { undoEdit, redoEdit } from "../../ipc/buffer";
import { ViewModel } from "./viewModel/ViewModel";
import { commandRegistry } from "./commands/CommandRegistry";
import { MouseHandler } from "./controller/MouseHandler";
import { ContextMenu } from "./contextmenu/ContextMenu";
import { ContextMenuController } from "./contextmenu/ContextMenuController";
import type { MenuItem, EditorContextState } from "./contextmenu/types";
import { applySurroundTemplate, detectBaseIndentation, type SurroundTemplate } from "../../utils/surroundWith";
import "./commands/NavigationCommands";
import "./commands/SelectionCommands";
import "./commands/EditingCommands";
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
  
  const key = keyMap[e.key] || e.key;
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
    }
  }, [executionLine, viewportHeight]);

  const { measureText } = useTextMeasurement({
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, Consolas, monospace",
    fontSize: 14,
    fontWeight: 600,
    charWidth: 8.4,
  });

  // Integrate rope buffer when enabled
  const ropeBuffer = useRopeBuffer(enableRopeBuffer ? filePath : undefined);
  // Memoize so the array reference only changes when the content actually changes,
  // preventing downstream effects from firing on every parent render.
  const effectiveLines = useMemo(
    () => (enableRopeBuffer && ropeBuffer && ropeBuffer.lines.length > 0) ? ropeBuffer.lines : (lines || []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enableRopeBuffer, ropeBuffer?.lines, lines]
  );
  const effectiveLineCount = (enableRopeBuffer && ropeBuffer && ropeBuffer.lineCount > 0)
    ? ropeBuffer.lineCount
    : effectiveLines.length;

  // Initialize ViewModel with command system
  const viewModelRef = useRef<ViewModel | null>(null);
  const mouseHandlerRef = useRef<MouseHandler | null>(null);

  // Keep ViewModel's internal lines in sync WITHOUT triggering notifyChange
  // (which would call onLinesChange → parent setState → infinite cascade).
  useEffect(() => {
    if (!viewModelRef.current) {
      viewModelRef.current = new ViewModel(effectiveLines, (newLines, line, col) => {
        onLinesChange?.(newLines, line, col);
      });
    } else {
      // Directly update internal lines reference to avoid notifyChange feedback loop
      (viewModelRef.current as any).lines = [...effectiveLines];
    }
  }, [effectiveLines, onLinesChange]);

  useEffect(() => {
    if (!mouseHandlerRef.current && viewModelRef.current) {
      mouseHandlerRef.current = new MouseHandler({
        viewModel: viewModelRef.current,
        onLinesChange
      });
    }
  }, [onLinesChange]);

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
    window.addEventListener("pm:find", handleFindEvent);
    window.addEventListener("pm:replace", handleReplaceEvent);
    return () => {
      window.removeEventListener("pm:find", handleFindEvent);
      window.removeEventListener("pm:replace", handleReplaceEvent);
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

  useEffect(() => {
    const activeLineText = effectiveLines[activeLine] || "";
    const textBeforeCursor = activeLineText.slice(0, activeCol);
    const normalizedText = textBeforeCursor.replace(/\t/g, "    ");
    const width = measureText(normalizedText);
    setCursorX(width);
  }, [activeCol, activeLine, effectiveLines, measureText]);

  useEffect(() => {
    if (!containerRef.current) return;
    const lineY = activeLine * LINE_HEIGHT_PX;
    const st = containerRef.current.scrollTop;
    if (lineY < st) {
      containerRef.current.scrollTop = lineY;
    } else if (lineY > st + viewportHeight - LINE_HEIGHT_PX * 2) {
      containerRef.current.scrollTop = lineY - viewportHeight + LINE_HEIGHT_PX * 2;
    }
  }, [activeLine, viewportHeight]);

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

      setTokenCache((prev) => {
        const next = { ...prev };
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
          setTokenCache((prev) => {
            const next = { ...prev };
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

  const handleContextMenu = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    
    if (!contextMenuControllerRef.current) return;

    // Update context state based on current position
    const line = effectiveLines[activeLine] || "";
    const tokenUnderCursor = ContextMenuController.detectTokenUnderCursor(line, activeCol);
    const diagnosticAtCursor = ContextMenuController.findDiagnosticAtCursor(diagnostics, activeLine, activeCol);

    contextMenuControllerRef.current.updateContextState({
      hasSelection: false, // TODO: Integrate with actual selection state
      selectionText: "",
      cursorPosition: { line: activeLine, column: activeCol },
      lspConnected: true, // TODO: Integrate with actual LSP state
      tokenUnderCursor,
      diagnosticAtCursor,
      fileType: ContextMenuController.detectFileType(filePath),
      isTestContext: ContextMenuController.detectTestContext(effectiveLines, activeLine),
    });

    // Get menu items for current context
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

  const handleMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!onHover || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const scrollTop = containerRef.current.scrollTop;
    const y = e.clientY - rect.top + scrollTop;
    const line = Math.floor(y / LINE_HEIGHT_PX);

    if (line >= 0 && line < lines.length && line !== activeLine) {
      const lineText = lines[line] || "";
      const x = e.clientX - rect.left - GUTTER_TOTAL_OFFSET;
      const col = Math.max(0, Math.min(Math.round(x / 8.1), lineText.length));

      onHover(line, col);
    }
  };

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
  const requestCompletions = useCallback(async () => {
    if (!filePath) return;
    
    const uri = pathToUri(filePath);
    const { prefix } = getWordPrefix(effectiveLines[activeLine] || "", activeCol);
    
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
      requestCompletions();
    }, delay);
  }, [requestCompletions]);

  // Handle completion selection with Rust-specific insertion logic
  const handleCompletionSelect = useCallback((item: CompletionItem) => {
    if (!onLinesChange) return;
    
    const line = lines[activeLine] || "";
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
    
    // Replace prefix with insert text
    const newLine = line.slice(0, start) + insertText.replace("$0", "") + line.slice(activeCol);
    const newLines = [...lines];
    newLines[activeLine] = newLine;
    
    onLinesChange(newLines, activeLine, newCol);
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
          text: insertText.replace("$0", "")
        }]
      }).catch(console.error);
    }
  }, [lines, activeLine, activeCol, onLinesChange, filePath, getWordPrefix]);

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
        if (completionItems[selectedIndex]) {
          handleCompletionSelect(completionItems[selectedIndex]);
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
      command.execute({ viewModel: viewModelRef.current });
      return;
    }

    // Undo/Redo shortcuts (fallback if not in command registry)
    if (e.ctrlKey && e.key.toLowerCase() === "z" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      if (filePath) {
        undoEdit(filePath)
          .then(({ edit, cursor }) => {
            // Apply the inverse edit to the lines
            const newLines = [...lines];
            const { start, end } = edit.range;
            
            // Delete the affected range
            if (start.line === end.line) {
              const line = newLines[start.line];
              newLines[start.line] = line.slice(0, start.column) + line.slice(end.column);
            } else {
              // Multi-line delete (simplified)
              const firstLine = newLines[start.line].slice(0, start.column);
              const lastLine = newLines[end.line].slice(end.column);
              newLines[start.line] = firstLine + lastLine;
              for (let i = start.line + 1; i <= end.line; i++) {
                newLines.splice(start.line + 1, 1);
              }
            }
            
            // Restore cursor position
            onLinesChange?.(newLines, cursor.line, cursor.column);
          })
          .catch(console.error);
      }
      return;
    } else if ((e.ctrlKey && e.key.toLowerCase() === "y" && !e.shiftKey && !e.altKey) ||
               (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "z" && !e.altKey)) {
      e.preventDefault();
      if (filePath) {
        redoEdit(filePath)
          .then(({ edit, result }) => {
            // Apply the redo edit
            const newLines = [...lines];
            const { start, end } = edit.range;
            
            if (start.line === end.line) {
              const line = newLines[start.line];
              newLines[start.line] = line.slice(0, start.column) + edit.new_text + line.slice(end.column);
            } else {
              // Multi-line insert (simplified)
              const insertedLines = edit.new_text.split('\n');
              const firstLine = newLines[start.line].slice(0, start.column) + insertedLines[0];
              const lastLine = insertedLines[insertedLines.length - 1] + newLines[end.line].slice(end.column);
              newLines[start.line] = firstLine;
              for (let i = 1; i < insertedLines.length - 1; i++) {
                newLines.splice(start.line + i, 0, insertedLines[i]);
              }
              if (insertedLines.length > 1) {
                newLines[start.line + insertedLines.length - 1] = lastLine;
              }
            }
            
            // Move cursor to end of edit
            onLinesChange?.(newLines, result.affected_range.end.line, result.affected_range.end.column);
          })
          .catch(console.error);
      }
      return;
    }
    
    if (!onLinesChange) return;

    let newLines = [...lines];
    let nLine = activeLine;
    let nCol = activeCol;
    let isTriggerChar = false;

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
      else if (nLine < lines.length - 1) {
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
      if (nLine < lines.length - 1) {
        nLine += 1;
        nCol = Math.min(nCol, newLines[nLine].length);
      }
      e.preventDefault();
    } else if (e.key === "Backspace") {
      if (nCol > 0) {
        const line = newLines[nLine];
        newLines[nLine] = line.slice(0, nCol - 1) + line.slice(nCol);
        nCol -= 1;
      } else if (nLine > 0) {
        const prevLen = newLines[nLine - 1].length;
        newLines[nLine - 1] += newLines[nLine];
        newLines.splice(nLine, 1);
        nLine -= 1;
        nCol = prevLen;
      }
      e.preventDefault();
      closeCompletion();
    } else if (e.key === "Enter") {
      const line = newLines[nLine];
      const before = line.slice(0, nCol);
      const after = line.slice(nCol);
      newLines[nLine] = before;
      newLines.splice(nLine + 1, 0, after);
      nLine += 1;
      nCol = 0;
      e.preventDefault();
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
      const line = newLines[nLine];
      newLines[nLine] = line.slice(0, nCol) + e.key + line.slice(nCol);
      nCol += 1;
      e.preventDefault();
      
      // Check for Rust-idiomatic trigger characters
      if (e.key === "." || e.key === ":" || e.key === "#" || e.key === "$") {
        isTriggerChar = true;
      }
    } else {
      return;
    }

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
    const rect = containerRef.current.getBoundingClientRect();
    const scrollTop = containerRef.current.scrollTop;

    const y = e.clientY - rect.top + scrollTop;
    let clickedLine = Math.floor(y / LINE_HEIGHT_PX);

    if (clickedLine >= effectiveLines.length) clickedLine = effectiveLines.length - 1;
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
          col = effectiveLines[clickedLine].length;
        }
      }
    }
    // @ts-ignore
    else if (document.caretPositionFromPoint) {
      // @ts-ignore
      const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
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
          col = effectiveLines[clickedLine].length;
        }
      }
    }

    if (col === -1) {
      const targetClass = (e.target as HTMLElement).className || "";
      if (
        typeof targetClass === "string" &&
        (targetClass.includes("lineContent") ||
          targetClass.includes("editorScrollContainer") ||
          targetClass.includes("linesContainer") ||
          targetClass.includes("editorInner"))
      ) {
        col = effectiveLines[clickedLine].length;
      } else {
        const x = e.clientX - rect.left - GUTTER_TOTAL_OFFSET;
        col = Math.max(0, Math.round(x / 8.4));
      }
    }

    const finalCol = Math.min(col, effectiveLines[clickedLine].length);
    onLinesChange(effectiveLines, clickedLine, finalCol);
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
                />
              );
            })}

            {activeLine >= startLine && activeLine < endLine && (
              <div
                className={styles.cursor}
                style={{
                  top: `${(activeLine - startLine) * LINE_HEIGHT_PX + 1}px`,
                  left: `${GUTTER_TOTAL_OFFSET + cursorX}px`,
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