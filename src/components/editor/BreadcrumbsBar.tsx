/**
 * BreadcrumbsBar.tsx — JetBrains RustRover Style Editor Breadcrumbs Bar
 * Displays live navigation trail: Workspace > Folder > File > Enclosing Struct > Enclosing Fn
 * With interactive fast-jump dropdown menu.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import {
  VscFolder,
  VscFileCode,
  VscChevronRight,
  VscSymbolStructure,
  VscSymbolInterface,
  VscSymbolMethod,
  VscSymbolClass,
  VscSymbolEnum,
  VscSymbolProperty
} from "react-icons/vsc";
import { parseDocumentSymbols, OutlineSymbol } from "../outline/symbolParser";
import styles from "./BreadcrumbsBar.module.css";

interface BreadcrumbsBarProps {
  filePath?: string;
  activeLine?: number;
  fileLines?: string[];
  onNavigateToSymbol?: (line: number, col: number) => void;
}

function getSymbolKindIcon(kind: string) {
  switch (kind) {
    case "class":
      return <VscSymbolClass color="#e58e26" />;
    case "interface":
      return <VscSymbolInterface color="#38ada9" />;
    case "function":
    case "method":
      return <VscSymbolMethod color="#9c88ff" />;
    case "property":
    case "variable":
      return <VscSymbolProperty color="#38ada9" />;
    case "enum":
      return <VscSymbolEnum color="#f6b93b" />;
    case "type":
    case "struct":
      return <VscSymbolStructure color="#079992" />;
    default:
      return <VscSymbolMethod color="#005fb8" />;
  }
}

export function BreadcrumbsBar({
  filePath,
  activeLine = 0,
  fileLines = [],
  onNavigateToSymbol,
}: BreadcrumbsBarProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Extract symbols for active file
  const symbols: OutlineSymbol[] = useMemo(() => {
    if (!filePath || filePath === "Welcome" || !fileLines || fileLines.length === 0) return [];
    return parseDocumentSymbols(filePath, fileLines);
  }, [filePath, fileLines]);

  // Compute active enclosing symbol trail based on cursor activeLine
  const enclosingSymbols: OutlineSymbol[] = useMemo(() => {
    if (symbols.length === 0) return [];

    const trail: OutlineSymbol[] = [];
    let bestMatch: OutlineSymbol | null = null;

    // Find deepest symbol that starts before or on activeLine
    for (const sym of symbols) {
      if (sym.line <= activeLine) {
        bestMatch = sym;
      }
    }

    if (bestMatch) {
      trail.push(bestMatch);
    }

    return trail;
  }, [symbols, activeLine]);

  if (!filePath || filePath === "Welcome") return null;

  // Split path into directory segments and filename
  const normalizedPath = filePath.replace(/\\/g, "/");
  const pathSegments = normalizedPath.split("/").filter(Boolean);
  const fileName = pathSegments.pop() || filePath;
  const folders = pathSegments.slice(-3); // Show last up to 3 folders

  return (
    <div className={styles.breadcrumbsContainer}>
      {/* Folder Segments */}
      {folders.map((folder, idx) => (
        <div key={idx} style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
          <div className={styles.breadcrumbSegment}>
            <span className={styles.segmentIcon}>
              <VscFolder color="#dcb67a" />
            </span>
            <span className={styles.segmentText}>{folder}</span>
          </div>
          <span className={styles.separator}>
            <VscChevronRight />
          </span>
        </div>
      ))}

      {/* File Segment */}
      <div
        className={styles.breadcrumbSegment}
        onClick={() => setIsDropdownOpen((prev) => !prev)}
        title="Click to view all symbols in file"
      >
        <span className={styles.segmentIcon}>
          <VscFileCode color="#388a34" />
        </span>
        <span className={styles.segmentText}>{fileName}</span>
      </div>

      {/* Enclosing Symbol Segment (if any) */}
      {enclosingSymbols.map((sym, idx) => (
        <div key={idx} style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
          <span className={styles.separator}>
            <VscChevronRight />
          </span>
          <div
            className={`${styles.breadcrumbSegment} ${styles.symbolHighlight}`}
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            title={`Symbol: ${sym.name} (Line ${sym.line + 1})`}
          >
            <span className={styles.segmentIcon}>{getSymbolKindIcon(sym.kind)}</span>
            <span>{sym.name}</span>
          </div>
        </div>
      ))}

      {/* Fast Symbol Jump Dropdown */}
      {isDropdownOpen && symbols.length > 0 && (
        <div className={styles.dropdownPopover} ref={dropdownRef}>
          <div className={styles.dropdownHeader}>Symbols in {fileName}</div>
          <div className={styles.dropdownList}>
            {symbols.map((sym) => {
              const isActive = enclosingSymbols.some((es) => es.name === sym.name);

              return (
                <div
                  key={sym.id}
                  className={`${styles.dropdownItem} ${isActive ? styles.dropdownItemActive : ""}`}
                  onClick={() => {
                    onNavigateToSymbol?.(sym.line, sym.col);
                    setIsDropdownOpen(false);
                  }}
                >
                  <span className={styles.segmentIcon}>{getSymbolKindIcon(sym.kind)}</span>
                  <span className={styles.dropdownItemText}>{sym.name}</span>
                  <span className={styles.dropdownItemLine}>:{sym.line + 1}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default BreadcrumbsBar;
