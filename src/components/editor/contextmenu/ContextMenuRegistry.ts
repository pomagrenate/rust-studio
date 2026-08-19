/**
 * ContextMenuRegistry.ts - Central registry for context menu actions
 * Defines action groups, conditions, and submenu structures
 */

import type { MenuItem, EditorContextState } from "./types";

export type ContextCondition = (state: EditorContextState) => boolean;

export interface ActionDefinition {
  id: string;
  label: string;
  commandId: string;
  shortcut?: string;
  icon?: React.ReactNode;
  group: string;
  condition?: ContextCondition;
  submenu?: ActionDefinition[];
  separatorAfter?: boolean;
}

export class ContextMenuRegistry {
  private actions: Map<string, ActionDefinition>;
  private groupOrder: string[];

  constructor() {
    this.actions = new Map();
    this.groupOrder = [
      "navigation",
      "codeActions",
      "clipboard",
      "rust",
      "editing",
    ];
    this.registerDefaultActions();
  }

  private registerDefaultActions() {
    // Group 1: Navigation & Symbols (LSP-driven)
    this.registerAction({
      id: "goToDefinition",
      label: "Go to Definition",
      commandId: "editor.action.goToDefinition",
      shortcut: "F12",
      group: "navigation",
      condition: (state) => state.lspConnected && state.tokenUnderCursor !== null,
    });

    this.registerAction({
      id: "goToTypeDefinition",
      label: "Go to Type Definition",
      commandId: "editor.action.goToTypeDefinition",
      group: "navigation",
      condition: (state) => state.lspConnected && state.tokenUnderCursor !== null,
    });

    this.registerAction({
      id: "findAllReferences",
      label: "Find All References",
      commandId: "editor.action.findReferences",
      shortcut: "Shift+F12",
      group: "navigation",
      condition: (state) => state.lspConnected && state.tokenUnderCursor !== null,
      separatorAfter: true,
    });

    this.registerAction({
      id: "peekDefinition",
      label: "Peek Definition",
      commandId: "editor.action.peekDefinition",
      shortcut: "Alt+F12",
      group: "navigation",
      condition: (state) => state.lspConnected && state.tokenUnderCursor !== null,
    });

    // Group 2: Code Actions & Refactoring
    this.registerAction({
      id: "quickFix",
      label: "Quick Fix...",
      commandId: "editor.action.quickFix",
      shortcut: "Alt+Enter",
      group: "codeActions",
      condition: (state) => state.diagnosticAtCursor !== null,
    });

    this.registerAction({
      id: "formatDocument",
      label: "Format Document",
      commandId: "formatDocument",
      shortcut: "Shift+Alt+F",
      group: "codeActions",
    });

    this.registerAction({
      id: "renameSymbol",
      label: "Rename Symbol",
      commandId: "editor.action.renameSymbol",
      shortcut: "F2",
      group: "codeActions",
      condition: (state) => state.lspConnected && state.tokenUnderCursor !== null,
      separatorAfter: true,
    });

    // Refactor submenu
    this.registerAction({
      id: "refactor",
      label: "Refactor",
      commandId: "editor.action.refactor",
      group: "codeActions",
      submenu: [
        {
          id: "extractVariable",
          label: "Extract Variable",
          commandId: "editor.action.extractVariable",
          group: "refactor",
          condition: (state) => state.hasSelection,
        },
        {
          id: "extractFunction",
          label: "Extract Function",
          commandId: "editor.action.extractFunction",
          group: "refactor",
          condition: (state) => state.hasSelection,
        },
        {
          id: "inlineVariable",
          label: "Inline Variable",
          commandId: "editor.action.inlineVariable",
          group: "refactor",
          condition: (state) => state.lspConnected && state.tokenUnderCursor !== null,
        },
      ],
    });

    // Group 3: Clipboard & Selection
    this.registerAction({
      id: "cut",
      label: "Cut",
      commandId: "cut",
      shortcut: "Ctrl+X",
      group: "clipboard",
      condition: (state) => state.hasSelection,
    });

    this.registerAction({
      id: "copy",
      label: "Copy",
      commandId: "copy",
      shortcut: "Ctrl+C",
      group: "clipboard",
      condition: (state) => state.hasSelection,
    });

    this.registerAction({
      id: "paste",
      label: "Paste",
      commandId: "paste",
      shortcut: "Ctrl+V",
      group: "clipboard",
    });

    this.registerAction({
      id: "selectAll",
      label: "Select All",
      commandId: "selectAll",
      shortcut: "Ctrl+A",
      group: "clipboard",
      separatorAfter: true,
    });

    // Group 4: Rust Execution & Diagnostics
    this.registerAction({
      id: "runTestAtCursor",
      label: "Run Test at Cursor",
      commandId: "editor.action.runTestAtCursor",
      group: "rust",
      condition: (state) => state.fileType === "rs" && state.isTestContext,
    });

    this.registerAction({
      id: "explainErrorWithAI",
      label: "Explain Error with AI",
      commandId: "editor.action.explainErrorWithAI",
      group: "rust",
      condition: (state) => state.diagnosticAtCursor !== null && state.diagnosticAtCursor.severity === "Error",
      separatorAfter: true,
    });

    // Rust Tools submenu
    this.registerAction({
      id: "rustTools",
      label: "Rust Tools",
      commandId: "editor.action.rustTools",
      group: "rust",
      condition: (state) => state.fileType === "rs",
      submenu: [
        {
          id: "expandMacroRecursively",
          label: "Expand Macro Recursively",
          commandId: "editor.action.expandMacroRecursively",
          group: "rustTools",
          condition: (state) => state.lspConnected,
        },
        {
          id: "viewCrateGraph",
          label: "View Crate Graph",
          commandId: "editor.action.viewCrateGraph",
          group: "rustTools",
        },
      ],
    });

    // Group 5: Editing Utilities
    this.registerAction({
      id: "toggleLineComment",
      label: "Toggle Line Comment",
      commandId: "toggleLineComment",
      shortcut: "Ctrl+/",
      group: "editing",
    });
  }

  registerAction(definition: ActionDefinition): void {
    this.actions.set(definition.id, definition);
  }

  getAction(id: string): ActionDefinition | undefined {
    return this.actions.get(id);
  }

  getAllActions(): ActionDefinition[] {
    return Array.from(this.actions.values());
  }

  getActionsForContext(state: EditorContextState): MenuItem[] {
    const menuItems: MenuItem[] = [];

    for (const group of this.groupOrder) {
      const groupActions = Array.from(this.actions.values())
        .filter(action => action.group === group);

      for (const action of groupActions) {
        const enabled = action.condition ? action.condition(state) : true;
        const visible = this.shouldShowAction(action, state);

        if (!visible) continue;

        const menuItem: MenuItem = {
          id: action.id,
          label: action.label,
          commandId: action.commandId,
          shortcut: action.shortcut,
          icon: action.icon,
          group: action.group,
          enabled,
          visible,
          separatorAfter: action.separatorAfter,
        };

        // Process submenu if present
        if (action.submenu) {
          menuItem.submenu = action.submenu
            .map(subAction => this.actionToMenuItem(subAction, state))
            .filter(item => item.visible);
        }

        menuItems.push(menuItem);
      }
    }

    return menuItems;
  }

  private actionToMenuItem(action: ActionDefinition, state: EditorContextState): MenuItem {
    const enabled = action.condition ? action.condition(state) : true;
    const visible = this.shouldShowAction(action, state);

    const menuItem: MenuItem = {
      id: action.id,
      label: action.label,
      commandId: action.commandId,
      shortcut: action.shortcut,
      icon: action.icon,
      group: action.group,
      enabled,
      visible,
      separatorAfter: action.separatorAfter,
    };

    if (action.submenu) {
      menuItem.submenu = action.submenu
        .map(subAction => this.actionToMenuItem(subAction, state))
        .filter(item => item.visible);
    }

    return menuItem;
  }

  private shouldShowAction(action: ActionDefinition, state: EditorContextState): boolean {
    // File type filtering for Rust-specific actions
    if (action.group === "rust" && state.fileType !== "rs") {
      return false;
    }

    return true;
  }
}

// Singleton instance
export const contextMenuRegistry = new ContextMenuRegistry();
