/**
 * ScrollCommands.ts - Editor scrolling and viewport navigation commands
 * Implements scroll line/page, viewport navigation, and reveal commands
 */

import { commandRegistry } from './CommandRegistry';

export interface ScrollArgs {
  viewModel: any;
  viewportHeight?: number;
  lineHeight?: number;
}

/**
 * Scroll up by one line
 */
export function scrollLineUp(args: ScrollArgs): void {
  const { viewModel } = args;
  // This would interact with the scroll container
  // For now, we'll implement a basic version
  const currentScrollTop = viewModel.getScrollTop() || 0;
  const lineHeight = args.lineHeight || 21;
  viewModel.setScrollTop(Math.max(0, currentScrollTop - lineHeight));
}

/**
 * Scroll down by one line
 */
export function scrollLineDown(args: ScrollArgs): void {
  const { viewModel } = args;
  const currentScrollTop = viewModel.getScrollTop() || 0;
  const lineHeight = args.lineHeight || 21;
  const maxScrollTop = viewModel.getMaxScrollTop() || 0;
  viewModel.setScrollTop(Math.min(maxScrollTop, currentScrollTop + lineHeight));
}

/**
 * Scroll up by one page
 */
export function scrollPageUp(args: ScrollArgs): void {
  const { viewModel, viewportHeight } = args;
  const currentScrollTop = viewModel.getScrollTop() || 0;
  const pageSize = viewportHeight || 600;
  viewModel.setScrollTop(Math.max(0, currentScrollTop - pageSize));
}

/**
 * Scroll down by one page
 */
export function scrollPageDown(args: ScrollArgs): void {
  const { viewModel, viewportHeight } = args;
  const currentScrollTop = viewModel.getScrollTop() || 0;
  const pageSize = viewportHeight || 600;
  const maxScrollTop = viewModel.getMaxScrollTop() || 0;
  viewModel.setScrollTop(Math.min(maxScrollTop, currentScrollTop + pageSize));
}

/**
 * Scroll to top of document
 */
export function scrollEditorTop(args: ScrollArgs): void {
  const { viewModel } = args;
  viewModel.setScrollTop(0);
}

/**
 * Scroll to bottom of document
 */
export function scrollEditorBottom(args: ScrollArgs): void {
  const { viewModel } = args;
  const maxScrollTop = viewModel.getMaxScrollTop() || 0;
  viewModel.setScrollTop(maxScrollTop);
}

/**
 * Scroll left
 */
export function scrollLeft(args: ScrollArgs): void {
  const { viewModel } = args;
  const currentScrollLeft = viewModel.getScrollLeft() || 0;
  const scrollAmount = 2; // Two columns
  viewModel.setScrollLeft(Math.max(0, currentScrollLeft - scrollAmount));
}

/**
 * Scroll right
 */
export function scrollRight(args: ScrollArgs): void {
  const { viewModel } = args;
  const currentScrollLeft = viewModel.getScrollLeft() || 0;
  const scrollAmount = 2; // Two columns
  const maxScrollLeft = viewModel.getMaxScrollLeft() || 0;
  viewModel.setScrollLeft(Math.min(maxScrollLeft, currentScrollLeft + scrollAmount));
}

/**
 * Move cursor to viewport top
 */
export function moveToViewportTop(args: ScrollArgs): void {
  const { viewModel } = args;
  const currentScrollTop = viewModel.getScrollTop() || 0;
  const lineHeight = args.lineHeight || 21;
  const topLine = Math.floor(currentScrollTop / lineHeight);
  
  const cursor = viewModel.getCursorPosition();
  viewModel.setCursorPosition({ line: topLine, column: cursor.column });
}

/**
 * Move cursor to viewport center
 */
export function moveToViewportCenter(args: ScrollArgs): void {
  const { viewModel, viewportHeight } = args;
  const currentScrollTop = viewModel.getScrollTop() || 0;
  const lineHeight = args.lineHeight || 21;
  const pageSize = viewportHeight || 600;
  const centerLine = Math.floor((currentScrollTop + pageSize / 2) / lineHeight);
  
  const cursor = viewModel.getCursorPosition();
  viewModel.setCursorPosition({ line: centerLine, column: cursor.column });
}

/**
 * Move cursor to viewport bottom
 */
export function moveToViewportBottom(args: ScrollArgs): void {
  const { viewModel, viewportHeight } = args;
  const currentScrollTop = viewModel.getScrollTop() || 0;
  const lineHeight = args.lineHeight || 21;
  const pageSize = viewportHeight || 600;
  const bottomLine = Math.floor((currentScrollTop + pageSize) / lineHeight);
  
  const cursor = viewModel.getCursorPosition();
  viewModel.setCursorPosition({ line: bottomLine, column: cursor.column });
}

/**
 * Reveal line at top of viewport
 */
export function revealLineAtTop(args: ScrollArgs & { line: number }): void {
  const { viewModel, line, lineHeight } = args;
  const lineHeightPx = lineHeight || 21;
  const targetScrollTop = line * lineHeightPx;
  viewModel.setScrollTop(targetScrollTop);
}

/**
 * Reveal line at center of viewport
 */
export function revealLineAtCenter(args: ScrollArgs & { line: number }): void {
  const { viewModel, line, viewportHeight, lineHeight } = args;
  const lineHeightPx = lineHeight || 21;
  const pageSize = viewportHeight || 600;
  const targetScrollTop = Math.max(0, line * lineHeightPx - pageSize / 2);
  viewModel.setScrollTop(targetScrollTop);
}

/**
 * Reveal line at bottom of viewport
 */
export function revealLineAtBottom(args: ScrollArgs & { line: number }): void {
  const { viewModel, line, viewportHeight, lineHeight } = args;
  const lineHeightPx = lineHeight || 21;
  const pageSize = viewportHeight || 600;
  const targetScrollTop = Math.max(0, line * lineHeightPx - pageSize + lineHeightPx);
  viewModel.setScrollTop(targetScrollTop);
}

// Register scroll commands
commandRegistry.registerCommand({
  command: {
    id: 'scrollLineUp',
    execute: (args: ScrollArgs) => {
      scrollLineUp(args);
    }
  },
  keybindings: [
    { key: 'Ctrl+Up', platform: 'windows' },
    { key: 'Ctrl+Up', platform: 'linux' },
    { key: 'Ctrl+PageUp', platform: 'mac' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'scrollLineDown',
    execute: (args: ScrollArgs) => {
      scrollLineDown(args);
    }
  },
  keybindings: [
    { key: 'Ctrl+Down', platform: 'windows' },
    { key: 'Ctrl+Down', platform: 'linux' },
    { key: 'Ctrl+PageDown', platform: 'mac' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'scrollPageUp',
    execute: (args: ScrollArgs) => {
      scrollPageUp(args);
    }
  },
  keybindings: [
    { key: 'Ctrl+PageUp', platform: 'windows' },
    { key: 'Alt+PageUp', platform: 'windows' },
    { key: 'Alt+PageUp', platform: 'linux' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'scrollPageDown',
    execute: (args: ScrollArgs) => {
      scrollPageDown(args);
    }
  },
  keybindings: [
    { key: 'Ctrl+PageDown', platform: 'windows' },
    { key: 'Alt+PageDown', platform: 'windows' },
    { key: 'Alt+PageDown', platform: 'linux' }
  ]
});

commandRegistry.registerCommand({
  command: {
    id: 'scrollEditorTop',
    execute: (args: ScrollArgs) => {
      scrollEditorTop(args);
    }
  },
  keybindings: []
});

commandRegistry.registerCommand({
  command: {
    id: 'scrollEditorBottom',
    execute: (args: ScrollArgs) => {
      scrollEditorBottom(args);
    }
  },
  keybindings: []
});

commandRegistry.registerCommand({
  command: {
    id: 'scrollLeft',
    execute: (args: ScrollArgs) => {
      scrollLeft(args);
    }
  },
  keybindings: []
});

commandRegistry.registerCommand({
  command: {
    id: 'scrollRight',
    execute: (args: ScrollArgs) => {
      scrollRight(args);
    }
  },
  keybindings: []
});
