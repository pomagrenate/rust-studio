/**
 * surroundWith.ts — Rust-specific "Surround With" templates and indentation logic
 *
 * Provides deterministic templates for wrapping selected code in common Rust constructs,
 * with proper indentation handling and cursor positioning.
 */

export interface SurroundTemplate {
  id: string;
  label: string;
  shortcut: number;
  description: string;
  template: string;
  cursorPlaceholder: string; // Where to place cursor after wrapping
  isExpression?: boolean; // For single-line expression wrapping
}

// Standard indent unit (4 spaces for Rust)
const INDENT_UNIT = "    ";

/**
 * Rust-specific surround templates
 */
export const RUST_TEMPLATES: SurroundTemplate[] = [
  {
    id: "if",
    label: "if { ... }",
    shortcut: 1,
    description: "Wrap in if block",
    template: `if /* condition */ {\n${INDENT_UNIT}$SELECTED_TEXT\n}`,
    cursorPlaceholder: "/* condition */",
  },
  {
    id: "if_let",
    label: "if let Some(...) = ... { ... }",
    shortcut: 2,
    description: "Wrap in if let block",
    template: `if let Some(/* var */) = /* expr */ {\n${INDENT_UNIT}$SELECTED_TEXT\n}`,
    cursorPlaceholder: "/* var */",
  },
  {
    id: "loop",
    label: "loop { ... }",
    shortcut: 3,
    description: "Wrap in loop block",
    template: `loop {\n${INDENT_UNIT}$SELECTED_TEXT\n}`,
    cursorPlaceholder: "",
  },
  {
    id: "while",
    label: "while { ... }",
    shortcut: 4,
    description: "Wrap in while loop",
    template: `while /* condition */ {\n${INDENT_UNIT}$SELECTED_TEXT\n}`,
    cursorPlaceholder: "/* condition */",
  },
  {
    id: "unsafe",
    label: "unsafe { ... }",
    shortcut: 5,
    description: "Wrap in unsafe block with SAFETY comment",
    template: `// SAFETY: <reason>\nunsafe {\n${INDENT_UNIT}$SELECTED_TEXT\n}`,
    cursorPlaceholder: "<reason>",
  },
  {
    id: "match",
    label: "match { ... }",
    shortcut: 6,
    description: "Wrap in match block",
    template: `match /* expr */ {\n${INDENT_UNIT}/* pat */ => {\n${INDENT_UNIT}${INDENT_UNIT}$SELECTED_TEXT\n${INDENT_UNIT}}\n}`,
    cursorPlaceholder: "/* expr */",
  },
  {
    id: "tokio_spawn",
    label: "tokio::spawn(async move { ... })",
    shortcut: 7,
    description: "Wrap in tokio async spawn",
    template: `tokio::spawn(async move {\n${INDENT_UNIT}$SELECTED_TEXT\n});`,
    cursorPlaceholder: "",
  },
  {
    id: "thread_spawn",
    label: "std::thread::spawn(move || { ... })",
    shortcut: 8,
    description: "Wrap in thread spawn",
    template: `std::thread::spawn(move || {\n${INDENT_UNIT}$SELECTED_TEXT\n});`,
    cursorPlaceholder: "",
  },
  {
    id: "ok",
    label: "Ok(...)",
    shortcut: 9,
    description: "Wrap in Ok()",
    template: `Ok($SELECTED_TEXT)`,
    cursorPlaceholder: "",
    isExpression: true,
  },
  {
    id: "some",
    label: "Some(...)",
    shortcut: 10,
    description: "Wrap in Some()",
    template: `Some($SELECTED_TEXT)`,
    cursorPlaceholder: "",
    isExpression: true,
  },
];

/**
 * Extract the leading whitespace (indentation) from a line
 */
export function getIndentation(line: string): string {
  const match = line.match(/^[\s\t]*/);
  return match ? match[0] : "";
}

/**
 * Detect the base indentation from the first selected line
 */
export function detectBaseIndentation(selectedLines: string[]): string {
  if (selectedLines.length === 0) return "";
  return getIndentation(selectedLines[0]);
}

/**
 * Indent a line by adding the indent unit
 */
export function indentLine(line: string, indent: string = INDENT_UNIT): string {
  return indent + line;
}

/**
 * Indent multiple lines by adding the indent unit to each
 */
export function indentLines(lines: string[], indent: string = INDENT_UNIT): string[] {
  return lines.map(line => indentLine(line, indent));
}

/**
 * Apply a surround template to selected text
 */
export interface SurroundResult {
  newText: string;
  cursorOffset: number; // Offset from start of new text where cursor should be placed
  selectionStart?: number; // Optional selection start for placeholder
  selectionEnd?: number; // Optional selection end for placeholder
}

export function applySurroundTemplate(
  template: SurroundTemplate,
  selectedText: string,
  _baseIndentation: string = ""
): SurroundResult {
  let result = template.template.replace("$SELECTED_TEXT", selectedText);
  
  // For multi-line templates, adjust inner indentation
  if (!template.isExpression && selectedText.includes("\n")) {
    const lines = selectedText.split("\n");
    const indentedLines = indentLines(lines, INDENT_UNIT);
    result = template.template.replace("$SELECTED_TEXT", indentedLines.join("\n"));
  }
  
  // For expression templates, preserve inline flow
  if (template.isExpression) {
    result = template.template.replace("$SELECTED_TEXT", selectedText.trim());
  }
  
  // Find cursor placeholder position
  const placeholderIndex = result.indexOf(template.cursorPlaceholder);
  let cursorOffset = result.length; // Default to end if no placeholder
  
  let selectionStart: number | undefined;
  let selectionEnd: number | undefined;
  
  if (placeholderIndex !== -1) {
    cursorOffset = placeholderIndex;
    // Select the placeholder for easy replacement
    selectionStart = placeholderIndex;
    selectionEnd = placeholderIndex + template.cursorPlaceholder.length;
  }
  
  return {
    newText: result,
    cursorOffset,
    selectionStart,
    selectionEnd,
  };
}

/**
 * Get the template by shortcut number (1-10)
 */
export function getTemplateByShortcut(shortcut: number): SurroundTemplate | undefined {
  return RUST_TEMPLATES.find(t => t.shortcut === shortcut);
}

/**
 * Filter templates by search query
 */
export function filterTemplates(query: string): SurroundTemplate[] {
  if (!query) return RUST_TEMPLATES;
  
  const lowerQuery = query.toLowerCase();
  return RUST_TEMPLATES.filter(t =>
    t.label.toLowerCase().includes(lowerQuery) ||
    t.description.toLowerCase().includes(lowerQuery) ||
    t.id.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Auto-closing pair configuration
 */
export interface AutoClosingPair {
  open: string;
  close: string;
  shouldCloseAfter?: (before: string, after: string) => boolean;
  wrapSelection?: boolean;
}

export const AUTO_CLOSING_PAIRS: AutoClosingPair[] = [
  {
    open: "{",
    close: "}",
    wrapSelection: true,
  },
  {
    open: "(",
    close: ")",
    wrapSelection: true,
  },
  {
    open: "[",
    close: "]",
    wrapSelection: true,
  },
  {
    open: '"',
    close: '"',
    wrapSelection: true,
  },
  {
    open: "'",
    close: "'",
    shouldCloseAfter: (_before, after) => {
      // Only auto-close for character literals, not lifetime annotations
      // Lifetimes start with ' and are followed by letters/numbers
      // Character literals are typically single characters
      const isLifetime = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(after) || /^[a-zA-Z_]/.test(after);
      return !isLifetime;
    },
    wrapSelection: true,
  },
  {
    open: "<",
    close: ">",
    shouldCloseAfter: (before, _after) => {
      // Smart auto-closing for generic type bounds
      // Close after identifiers like Vec<, Option<, HashMap<, etc.
      const genericKeywords = ["Vec", "Option", "Result", "HashMap", "BTreeMap", "HashSet", "BTreeSet", "Box", "Rc", "Arc", "VecDeque", "LinkedList", "BinaryHeap"];
      return genericKeywords.some(keyword => before.endsWith(keyword));
    },
    wrapSelection: false,
  },
];

/**
 * Check if a character should auto-close based on context
 */
export function shouldAutoClose(
  char: string,
  beforeText: string,
  afterText: string
): boolean {
  const pair = AUTO_CLOSING_PAIRS.find(p => p.open === char);
  if (!pair) return false;
  
  if (pair.shouldCloseAfter) {
    return pair.shouldCloseAfter(beforeText, afterText);
  }
  
  return true;
}

/**
 * Get the closing character for an opening character
 */
export function getClosingChar(openChar: string): string | null {
  const pair = AUTO_CLOSING_PAIRS.find(p => p.open === openChar);
  return pair ? pair.close : null;
}

/**
 * Check if a character should wrap selection instead of replacing it
 */
export function shouldWrapSelection(char: string): boolean {
  const pair = AUTO_CLOSING_PAIRS.find(p => p.open === char);
  return pair ? !!pair.wrapSelection : false;
}
