/**
 * symbolParser.ts — Fast, robust document symbol extractor for Outline view.
 * Supports TypeScript, JavaScript, TSX, JSX, Rust, Python, Markdown, CSS, JSON, and HTML.
 */

export type SymbolKind = 
  | 'class' 
  | 'interface' 
  | 'function' 
  | 'method' 
  | 'variable' 
  | 'property' 
  | 'enum' 
  | 'type' 
  | 'module' 
  | 'heading' 
  | 'key';

export interface OutlineSymbol {
  id: string;
  name: string;
  kind: SymbolKind;
  line: number; // 0-based
  col: number;
  detail?: string;
  children?: OutlineSymbol[];
}

export function parseDocumentSymbols(fileName: string, lines: string[]): OutlineSymbol[] {
  if (!fileName || fileName === "Welcome" || lines.length === 0) {
    return [];
  }

  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
      return parseJsTsSymbols(lines);
    case 'rs':
      return parseRustSymbols(lines);
    case 'py':
      return parsePythonSymbols(lines);
    case 'md':
    case 'markdown':
      return parseMarkdownSymbols(lines);
    case 'css':
    case 'scss':
    case 'less':
      return parseCssSymbols(lines);
    case 'json':
      return parseJsonSymbols(lines);
    default:
      // Try generic regex parser
      return parseJsTsSymbols(lines);
  }
}

/** JavaScript / TypeScript / React parser */
function parseJsTsSymbols(lines: string[]): OutlineSymbol[] {
  const symbols: OutlineSymbol[] = [];
  let idCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Skip comment lines
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      continue;
    }

    // Classes
    const classMatch = trimmed.match(/^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/);
    if (classMatch) {
      symbols.push({
        id: `sym-${++idCounter}`,
        name: classMatch[1],
        kind: 'class',
        line: i,
        col: rawLine.indexOf(classMatch[1]),
        detail: 'class',
      });
      continue;
    }

    // Interfaces
    const interfaceMatch = trimmed.match(/^(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/);
    if (interfaceMatch) {
      symbols.push({
        id: `sym-${++idCounter}`,
        name: interfaceMatch[1],
        kind: 'interface',
        line: i,
        col: rawLine.indexOf(interfaceMatch[1]),
        detail: 'interface',
      });
      continue;
    }

    // Types
    const typeMatch = trimmed.match(/^(?:export\s+)?type\s+([A-Za-z0-9_$]+)/);
    if (typeMatch) {
      symbols.push({
        id: `sym-${++idCounter}`,
        name: typeMatch[1],
        kind: 'type',
        line: i,
        col: rawLine.indexOf(typeMatch[1]),
        detail: 'type',
      });
      continue;
    }

    // Enums
    const enumMatch = trimmed.match(/^(?:export\s+)?enum\s+([A-Za-z0-9_$]+)/);
    if (enumMatch) {
      symbols.push({
        id: `sym-${++idCounter}`,
        name: enumMatch[1],
        kind: 'enum',
        line: i,
        col: rawLine.indexOf(enumMatch[1]),
        detail: 'enum',
      });
      continue;
    }

    // Functions: function foo(...) or export function foo(...)
    const fnMatch = trimmed.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/);
    if (fnMatch) {
      symbols.push({
        id: `sym-${++idCounter}`,
        name: fnMatch[1],
        kind: 'function',
        line: i,
        col: rawLine.indexOf(fnMatch[1]),
        detail: 'function',
      });
      continue;
    }

    // Arrow Functions / Constants: const foo = (...) => or export const foo = function
    const constFnMatch = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_$]+)?\s*=>/);
    if (constFnMatch) {
      symbols.push({
        id: `sym-${++idCounter}`,
        name: constFnMatch[1],
        kind: 'function',
        line: i,
        col: rawLine.indexOf(constFnMatch[1]),
        detail: 'function',
      });
      continue;
    }

    // Top-level / Exported Variables
    const varMatch = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*[:=]/);
    if (varMatch) {
      symbols.push({
        id: `sym-${++idCounter}`,
        name: varMatch[1],
        kind: 'variable',
        line: i,
        col: rawLine.indexOf(varMatch[1]),
        detail: 'variable',
      });
    }
  }

  return symbols;
}

/** Rust parser */
function parseRustSymbols(lines: string[]): OutlineSymbol[] {
  const symbols: OutlineSymbol[] = [];
  let idCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      continue;
    }

    // struct
    const structMatch = trimmed.match(/^(?:pub(?:\([^)]+\))?\s+)?struct\s+([A-Za-z0-9_]+)/);
    if (structMatch) {
      symbols.push({
        id: `sym-${++idCounter}`,
        name: structMatch[1],
        kind: 'class',
        line: i,
        col: rawLine.indexOf(structMatch[1]),
        detail: 'struct',
      });
      continue;
    }

    // enum
    const enumMatch = trimmed.match(/^(?:pub(?:\([^)]+\))?\s+)?enum\s+([A-Za-z0-9_]+)/);
    if (enumMatch) {
      symbols.push({
        id: `sym-${++idCounter}`,
        name: enumMatch[1],
        kind: 'enum',
        line: i,
        col: rawLine.indexOf(enumMatch[1]),
        detail: 'enum',
      });
      continue;
    }

    // trait
    const traitMatch = trimmed.match(/^(?:pub(?:\([^)]+\))?\s+)?trait\s+([A-Za-z0-9_]+)/);
    if (traitMatch) {
      symbols.push({
        id: `sym-${++idCounter}`,
        name: traitMatch[1],
        kind: 'interface',
        line: i,
        col: rawLine.indexOf(traitMatch[1]),
        detail: 'trait',
      });
      continue;
    }

    // impl
    const implMatch = trimmed.match(/^impl(?:<[^>]+>)?\s+([A-Za-z0-9_]+)/);
    if (implMatch) {
      symbols.push({
        id: `sym-${++idCounter}`,
        name: `impl ${implMatch[1]}`,
        kind: 'module',
        line: i,
        col: rawLine.indexOf(implMatch[1]),
        detail: 'impl',
      });
      continue;
    }

    // fn
    const fnMatch = trimmed.match(/^(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+([A-Za-z0-9_]+)/);
    if (fnMatch) {
      symbols.push({
        id: `sym-${++idCounter}`,
        name: fnMatch[1],
        kind: 'function',
        line: i,
        col: rawLine.indexOf(fnMatch[1]),
        detail: 'fn',
      });
    }
  }

  return symbols;
}

/** Python parser */
function parsePythonSymbols(lines: string[]): OutlineSymbol[] {
  const symbols: OutlineSymbol[] = [];
  let idCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (trimmed.startsWith('#')) continue;

    // class
    const classMatch = trimmed.match(/^class\s+([A-Za-z0-9_]+)/);
    if (classMatch) {
      symbols.push({
        id: `sym-${++idCounter}`,
        name: classMatch[1],
        kind: 'class',
        line: i,
        col: rawLine.indexOf(classMatch[1]),
        detail: 'class',
      });
      continue;
    }

    // def / async def
    const fnMatch = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z0-9_]+)/);
    if (fnMatch) {
      symbols.push({
        id: `sym-${++idCounter}`,
        name: fnMatch[1],
        kind: rawLine.startsWith(' ') || rawLine.startsWith('\t') ? 'method' : 'function',
        line: i,
        col: rawLine.indexOf(fnMatch[1]),
        detail: 'def',
      });
    }
  }

  return symbols;
}

/** Markdown Headings parser */
function parseMarkdownSymbols(lines: string[]): OutlineSymbol[] {
  const symbols: OutlineSymbol[] = [];
  let idCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const match = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      symbols.push({
        id: `sym-${++idCounter}`,
        name: match[2],
        kind: 'heading',
        line: i,
        col: 0,
        detail: `H${level}`,
      });
    }
  }

  return symbols;
}

/** CSS / SCSS Selectors parser */
function parseCssSymbols(lines: string[]): OutlineSymbol[] {
  const symbols: OutlineSymbol[] = [];
  let idCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.endsWith('{') && !trimmed.startsWith('@import')) {
      const selector = trimmed.replace(/\s*\{$/, '');
      if (selector) {
        symbols.push({
          id: `sym-${++idCounter}`,
          name: selector,
          kind: 'property',
          line: i,
          col: 0,
          detail: 'rule',
        });
      }
    }
  }

  return symbols;
}

/** JSON Keys parser */
function parseJsonSymbols(lines: string[]): OutlineSymbol[] {
  const symbols: OutlineSymbol[] = [];
  let idCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const match = trimmed.match(/^"([^"]+)"\s*:/);
    if (match) {
      symbols.push({
        id: `sym-${++idCounter}`,
        name: match[1],
        kind: 'key',
        line: i,
        col: lines[i].indexOf(match[1]),
        detail: 'key',
      });
    }
  }

  return symbols;
}
