/**
 * types.ts - Context menu type definitions
 */

export interface MenuItem {
  id: string;
  label: string;
  commandId: string;
  shortcut?: string;
  icon?: React.ReactNode;
  group: string;
  submenu?: MenuItem[];
  enabled: boolean;
  visible: boolean;
  separatorAfter?: boolean;
}

export interface EditorContextState {
  hasSelection: boolean;
  selectionText: string;
  cursorPosition: { line: number; column: number };
  lspConnected: boolean;
  tokenUnderCursor: string | null;
  diagnosticAtCursor: Diagnostic | null;
  fileType: string;
  isTestContext: boolean;
}

export interface Diagnostic {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  severity: "Error" | "Warning" | "Information" | "Hint";
  message: string;
}

export interface ContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  items: MenuItem[];
  onSelect: (item: MenuItem) => void;
}

export interface ContextMenuControllerProps {
  contextState: EditorContextState;
  onExecuteCommand: (commandId: string) => void;
}
