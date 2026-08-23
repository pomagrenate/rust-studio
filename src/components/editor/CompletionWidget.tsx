/**
 * CompletionWidget.tsx — Production-grade LSP completion widget
 * Features: fuzzy matching, VS Code icons, side-docked documentation, virtual scrolling
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  VscSymbolMethod,
  VscSymbolStructure,
  VscSymbolEnum,
  VscSymbolVariable,
  VscSymbolField,
  VscSymbolNamespace,
  VscSymbolInterface,
  VscSymbolConstant,
  VscSymbolProperty,
  VscSymbolOperator,
  VscSymbolSnippet,
  VscSymbolFile,
  VscSymbolNumeric,
  VscSymbolKey,
  VscSymbolEvent,
  VscSymbolParameter,
  VscSymbolKeyword,
  VscSymbolColor,
  VscSymbolClass,
} from "react-icons/vsc";
import styles from "./CompletionWidget.module.css";

export interface CompletionItem {
  label: string;
  kind?: string | null;
  detail?: string | null;
  documentation?: string | null;
  sortText?: string | null;
  filterText?: string | null;
  insertText?: string | null;
}

export interface CompletionWidgetProps {
  x: number;
  y: number;
  items: CompletionItem[];
  selectedIndex: number;
  filterText: string;
  onSelect: (item: CompletionItem) => void;
  onClose: () => void;
  onNavigate: (direction: "up" | "down") => void;
}

interface FuzzyMatchResult {
  score: number;
  indices: number[];
}

// Fuzzy matching algorithm (IntelliJ-style)
function fuzzyMatch(query: string, target: string): FuzzyMatchResult | null {
  if (!query) return { score: 1, indices: [] };
  
  const queryLower = query.toLowerCase();
  const targetLower = target.toLowerCase();
  
  let queryIdx = 0;
  let targetIdx = 0;
  let score = 0;
  const indices: number[] = [];
  
  while (queryIdx < queryLower.length && targetIdx < targetLower.length) {
    if (queryLower[queryIdx] === targetLower[targetIdx]) {
      indices.push(targetIdx);
      score += 1;
      queryIdx++;
    }
    targetIdx++;
  }
  
  if (queryIdx < queryLower.length) return null;
  
  // Bonus for consecutive matches
  let consecutiveBonus = 0;
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === indices[i - 1] + 1) {
      consecutiveBonus += 2;
    }
  }
  score += consecutiveBonus;
  
  // Bonus for match at word boundary
  if (indices[0] === 0) score += 3;
  
  return { score, indices };
}

// Highlight matched characters in label
function renderHighlightedLabel(label: string, indices: number[]): React.ReactNode {
  if (!indices || indices.length === 0) return label;
  
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  
  indices.forEach((idx) => {
    if (idx > lastIdx) {
      parts.push(label.slice(lastIdx, idx));
    }
    parts.push(<span key={idx} className={styles.highlight}>{label[idx]}</span>);
    lastIdx = idx + 1;
  });
  
  if (lastIdx < label.length) {
    parts.push(label.slice(lastIdx));
  }
  
  return parts;
}

// Inline Markdown formatter: [`code`], `code`, [text][link], [text](link), **bold**, *italic*
function formatInlineMarkdown(text: string): React.ReactNode {
  if (!text) return null;
  const tokenRegex = /(\[`[^`]+`\]|`[^`]+`|\[[^\]]+\](?:\([^)]+\)|\[[^\]]*\])?|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, i) => {
    if (!part) return null;

    // [`code`] or `code`
    if ((part.startsWith("[`") && part.endsWith("`]")) || (part.startsWith("`") && part.endsWith("`"))) {
      const codeText = part.replace(/^\[?`|`\]?$/g, "");
      return <code key={i} className={styles.docCodeInline}>{codeText}</code>;
    }

    // [text](url) or [text][ref] or [text]
    if (part.startsWith("[")) {
      const linkMatch = part.match(/^\[([^\]]+)\](?:\(([^)]+)\)|\[([^\]]*)\])?$/);
      if (linkMatch) {
        const linkText = linkMatch[1];
        return <span key={i} className={styles.docLink}>{linkText}</span>;
      }
    }

    // **bold**
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }

    // *italic*
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }

    return part;
  });
}

// Render LSP Markdown Documentation into styled HTML elements
function renderMarkdownDoc(content: string): React.ReactNode {
  if (!content) return null;

  const lines = content.split(/\r?\n/);
  const elements: React.ReactNode[] = [];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<div key={idx} className={styles.docSpacer} />);
      return;
    }

    // Headers: # Heading, ## Heading
    const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headerMatch) {
      const level = Math.min(headerMatch[1].length, 3);
      const titleNode = formatInlineMarkdown(headerMatch[2]);
      elements.push(
        <div key={idx} className={`${styles.docHeader} ${styles[`docHeader${level}`]}`}>
          {titleNode}
        </div>
      );
      return;
    }

    // Bullet items: - item, * item
    const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      elements.push(
        <div key={idx} className={styles.docBullet}>
          <span className={styles.bulletDot}>•</span>
          <span>{formatInlineMarkdown(bulletMatch[1])}</span>
        </div>
      );
      return;
    }

    // Normal paragraph
    elements.push(
      <p key={idx} className={styles.docParagraph}>
        {formatInlineMarkdown(line)}
      </p>
    );
  });

  return elements;
}

export function CompletionWidget({
  x,
  y,
  items,
  selectedIndex,
  filterText,
  onSelect,
  onClose,
  onNavigate: _onNavigate,
}: CompletionWidgetProps) {
  const widgetRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  const [docPanePosition, setDocPanePosition] = useState<"right" | "left">("right");
  const VISIBLE_ITEM_COUNT = 7;
  const ITEM_HEIGHT = 24;

  // Filter and sort items with fuzzy matching
  const filteredItems = useMemo(() => {
    if (!filterText) return items;
    
    const scored = items.map((item) => {
      const match = fuzzyMatch(filterText, item.label);
      return { item, match };
    });
    
    return scored
      .filter((result) => result.match !== null)
      .sort((a, b) => (b.match?.score || 0) - (a.match?.score || 0))
      .map((result) => ({ ...result.item, matchIndices: result.match?.indices || [] }));
  }, [items, filterText]);

  // Virtual scrolling
  const { startIdx, endIdx } = useMemo(() => {
    const start = Math.max(0, selectedIndex - Math.floor(VISIBLE_ITEM_COUNT / 2));
    const end = Math.min(filteredItems.length, start + VISIBLE_ITEM_COUNT);
    return { startIdx: start, endIdx: end };
  }, [selectedIndex, filteredItems.length]);

  // Adjust position to prevent viewport overflow
  useEffect(() => {
    if (!widgetRef.current) return;

    const rect = widgetRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y + LINE_HEIGHT; // Offset below cursor

    // Prevent overflow on right edge
    if (adjustedX + rect.width > viewportWidth - 20) {
      adjustedX = viewportWidth - rect.width - 20;
    }

    // Prevent overflow on bottom edge
    if (adjustedY + rect.height > viewportHeight - 20) {
      adjustedY = y - rect.height - 10;
    }

    // Determine doc pane position
    const docPaneWidth = 300;
    if (adjustedX + rect.width + docPaneWidth > viewportWidth - 20) {
      setDocPanePosition("left");
    } else {
      setDocPanePosition("right");
    }

    setPosition({ x: adjustedX, y: adjustedY });
  }, [x, y, filteredItems]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const itemTop = selectedIndex * ITEM_HEIGHT;
      const itemBottom = itemTop + ITEM_HEIGHT;
      const scrollTop = listRef.current.scrollTop;
      const scrollHeight = listRef.current.clientHeight;
      
      if (itemTop < scrollTop) {
        listRef.current.scrollTop = itemTop;
      } else if (itemBottom > scrollTop + scrollHeight) {
        listRef.current.scrollTop = itemBottom - scrollHeight;
      }
    }
  }, [selectedIndex]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (widgetRef.current && !widgetRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  if (filteredItems.length === 0) return null;

  const selectedItem = filteredItems[selectedIndex];
  const hasDocumentation = selectedItem?.documentation || selectedItem?.detail;

  // Icon mapping for Rust-idiomatic LSP completion kinds
  const getKindIcon = useCallback((kind?: string | null) => {
    const kindNum = kind ? parseInt(kind, 10) : undefined;
    const labelLower = (selectedItem?.label || "").toLowerCase();
    
    // Special handling for macros (ending with !)
    if (labelLower.endsWith("!")) {
      return <VscSymbolColor size={16} />;
    }
    
    switch (kindNum) {
      case 1: return <VscSymbolSnippet size={16} />; // Text
      case 2: return <VscSymbolMethod size={16} />; // Method
      case 3: return <VscSymbolMethod size={16} />; // Function
      case 4: return <VscSymbolClass size={16} />; // Constructor
      case 5: return <VscSymbolField size={16} />; // Field
      case 6: return <VscSymbolVariable size={16} />; // Variable
      case 7: return <VscSymbolStructure size={16} />; // Class (Struct)
      case 8: return <VscSymbolInterface size={16} />; // Interface (Trait)
      case 9: return <VscSymbolNamespace size={16} />; // Module
      case 10: return <VscSymbolProperty size={16} />; // Property
      case 11: return <VscSymbolNumeric size={16} />; // Unit
      case 12: return <VscSymbolVariable size={16} />; // Value
      case 13: return <VscSymbolEnum size={16} />; // Enum
      case 14: return <VscSymbolKeyword size={16} />; // Keyword
      case 15: return <VscSymbolSnippet size={16} />; // Snippet
      case 16: return <VscSymbolColor size={16} />; // Color
      case 17: return <VscSymbolFile size={16} />; // File
      case 18: return <VscSymbolKey size={16} />; // Reference
      case 19: return <VscSymbolNamespace size={16} />; // Folder
      case 20: return <VscSymbolVariable size={16} />; // EnumMember
      case 21: return <VscSymbolConstant size={16} />; // Constant
      case 22: return <VscSymbolStructure size={16} />; // Struct
      case 23: return <VscSymbolEvent size={16} />; // Event
      case 24: return <VscSymbolOperator size={16} />; // Operator
      case 25: return <VscSymbolParameter size={16} />; // TypeParameter
      default: return <VscSymbolVariable size={16} />;
    }
  }, [selectedItem]);

  const visibleItems = filteredItems.slice(startIdx, endIdx);

  return (
    <div
      ref={widgetRef}
      className={styles.completionWidget}
      style={{ left: position.x, top: position.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={styles.completionContainer}>
        <div 
          ref={listRef}
          className={styles.completionList}
          style={{ height: `${Math.min(filteredItems.length * ITEM_HEIGHT, VISIBLE_ITEM_COUNT * ITEM_HEIGHT)}px` }}
        >
          <div style={{ height: `${startIdx * ITEM_HEIGHT}px` }} />
          {visibleItems.map((item, index) => {
            const actualIndex = startIdx + index;
            return (
              <div
                key={actualIndex}
                className={`${styles.completionItem} ${actualIndex === selectedIndex ? styles.completionItemSelected : ""}`}
                style={{ height: `${ITEM_HEIGHT}px` }}
                onClick={() => onSelect(item)}
              >
                <span className={styles.completionIcon}>{getKindIcon(item.kind)}</span>
                <span className={styles.completionLabel}>
                  {renderHighlightedLabel(item.label, (item as any).matchIndices)}
                </span>
                {item.detail && (
                  <span className={styles.completionDetail}>
                    {item.detail.includes('fn') || item.detail.includes('struct') || item.detail.includes('enum') 
                      ? item.detail.split(' ').slice(0, 3).join(' ') 
                      : item.detail}
                  </span>
                )}
              </div>
            );
          })}
          <div style={{ height: `${(filteredItems.length - endIdx) * ITEM_HEIGHT}px` }} />
        </div>
        
        {hasDocumentation && (
          <div className={`${styles.docPane} ${styles[docPanePosition]}`}>
            {/* Visibility badge */}
            {selectedItem?.detail && (selectedItem.detail.includes('pub') || selectedItem.detail.includes('fn')) && (
              <div className={styles.visibilityBadge}>
                {selectedItem.detail.includes('pub(crate)') ? 'pub(crate)' : selectedItem.detail.includes('pub') ? 'pub' : ''}
              </div>
            )}
            
            {selectedItem?.detail && (
              <div className={styles.docDetail}>{selectedItem.detail}</div>
            )}
            
            {selectedItem?.documentation && (
              <div className={styles.docDocumentation}>
                {renderMarkdownDoc(selectedItem.documentation)}
              </div>
            )}
            
            {/* Rust signature display */}
            {selectedItem?.detail && selectedItem.detail.includes('fn') && (
              <div className={styles.rustSignature}>{selectedItem.detail}</div>
            )}
            
            {/* Crate/module origin */}
            {selectedItem?.detail && selectedItem.detail.includes('::') && (
              <div className={styles.crateOrigin}>
                (use {selectedItem.detail.split('::')[0]}::{selectedItem.detail.split('::')[1]?.split(' ')[0]})
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const LINE_HEIGHT = 21;

export default CompletionWidget;
