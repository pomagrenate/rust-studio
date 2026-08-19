import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { 
  VscChevronRight, 
  VscChevronDown, 
  VscCollapseAll, 
  VscEllipsis, 
  VscCheck,
  VscSymbolClass,
  VscSymbolInterface,
  VscSymbolMethod,
  VscSymbolVariable,
  VscSymbolProperty,
  VscSymbolEnum,
  VscSymbolStructure,
  VscListTree,
  VscSymbolKey,
  VscSymbolMisc
} from "react-icons/vsc";
import { extensionRegistry } from "../../extensions/extensionRegistry";
import { IDocumentSymbol, SymbolKind } from "../../extensions/types";
import styles from "./OutlinePane.module.css";

export type OutlineSortBy = "position" | "name" | "category";

interface OutlinePaneProps {
  activeFile?: string;
  fileLines?: string[];
  onNavigateToSymbol?: (line: number, col: number) => void;
}

function getSymbolIcon(kind: SymbolKind) {
  switch (kind) {
    case "class":
      return <VscSymbolClass color="#e58e26" />;
    case "interface":
      return <VscSymbolInterface color="#38ada9" />;
    case "function":
    case "method":
      return <VscSymbolMethod color="#9c88ff" />;
    case "variable":
      return <VscSymbolVariable color="#4a69bd" />;
    case "property":
      return <VscSymbolProperty color="#38ada9" />;
    case "enum":
      return <VscSymbolEnum color="#f6b93b" />;
    case "type":
    case "struct":
      return <VscSymbolStructure color="#079992" />;
    case "header":
      return <VscListTree color="#78e08f" />;
    case "constant":
      return <VscSymbolKey color="#6a89cc" />;
    default:
      return <VscSymbolMisc color="#b8e994" />;
  }
}

export function OutlinePane({ activeFile, fileLines = [], onNavigateToSymbol }: OutlinePaneProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [followCursor, setFollowCursor] = useState(true);
  const [filterOnType, setFilterOnType] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [sortBy, setSortBy] = useState<OutlineSortBy>("position");
  const [rawSymbols, setRawSymbols] = useState<IDocumentSymbol[]>([]);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isMenuOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const menuHeight = 220;
      const spaceBelow = window.innerHeight - rect.bottom;
      
      const top = spaceBelow < menuHeight 
        ? Math.max(8, rect.top - menuHeight - 4) 
        : rect.bottom + 4;
      const left = Math.max(8, rect.right - 180);

      setDropdownPos({ top, left });
    }
  }, [isMenuOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current && 
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && 
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    let isCurrent = true;
    if (!activeFile || fileLines.length === 0) {
      setRawSymbols([]);
      return;
    }

    extensionRegistry.getDocumentSymbols(activeFile, fileLines).then((symbols) => {
      if (isCurrent) {
        setRawSymbols(symbols);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [activeFile, fileLines]);

  const processedSymbols = useMemo(() => {
    let result = [...rawSymbols];

    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      result = result.filter(s => s.name.toLowerCase().includes(q));
    }

    if (sortBy === "name") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "category") {
      result.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
    } else {
      result.sort((a, b) => a.line - b.line);
    }

    return result;
  }, [rawSymbols, filterText, sortBy]);

  const renderSymbolItem = (sym: IDocumentSymbol, depth = 0) => {
    return (
      <div key={`${sym.name}-${sym.line}-${sym.col}`} className={styles.symbolTreeBranch}>
        <div 
          className={styles.symbolRow}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => onNavigateToSymbol?.(sym.line, sym.col)}
          title={`${sym.kind} ${sym.name} (Line ${sym.line + 1})`}
        >
          <span className={styles.symbolIcon}>
            {getSymbolIcon(sym.kind)}
          </span>
          <span className={styles.symbolName}>{sym.name}</span>
          <span className={styles.symbolLine}>{sym.line + 1}</span>
        </div>
        {sym.children && sym.children.map(child => renderSymbolItem(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className={`${styles.outlineSection} ${!isExpanded ? styles.outlineSectionCollapsed : ""}`}>
      <div className={styles.header} onClick={() => setIsExpanded(!isExpanded)}>
        <div className={styles.headerTitle}>
          {isExpanded ? <VscChevronDown /> : <VscChevronRight />}
          <span>Outline</span>
        </div>

        <div className={`${styles.headerActions} ${isMenuOpen ? styles.headerActionsOpen : ""}`} onClick={(e) => e.stopPropagation()}>
          <button 
            className={styles.actionBtn} 
            title="Collapse All"
            onClick={() => setIsExpanded(false)}
          >
            <VscCollapseAll />
          </button>
          
          <button 
            ref={triggerRef}
            className={styles.actionBtn} 
            title="More Actions..."
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <VscEllipsis />
          </button>

          {isMenuOpen && typeof document !== "undefined" && createPortal(
            <div 
              ref={menuRef} 
              className={styles.menuDropdown} 
              style={{
                position: "fixed",
                top: `${dropdownPos.top}px`,
                left: `${dropdownPos.left}px`,
                zIndex: 9999
              }}
            >
              <div className={styles.menuGroup}>
                <div className={styles.menuGroupTitle}>Sort By</div>
                <button 
                  className={styles.menuItem} 
                  onClick={() => { setSortBy("position"); setIsMenuOpen(false); }}
                >
                  <span className={styles.menuCheck}>{sortBy === "position" && <VscCheck />}</span>
                  <span>Sort By Position</span>
                </button>
                <button 
                  className={styles.menuItem} 
                  onClick={() => { setSortBy("name"); setIsMenuOpen(false); }}
                >
                  <span className={styles.menuCheck}>{sortBy === "name" && <VscCheck />}</span>
                  <span>Sort By Name</span>
                </button>
                <button 
                  className={styles.menuItem} 
                  onClick={() => { setSortBy("category"); setIsMenuOpen(false); }}
                >
                  <span className={styles.menuCheck}>{sortBy === "category" && <VscCheck />}</span>
                  <span>Sort By Type</span>
                </button>
              </div>

              <div className={styles.menuDivider} />

              <button 
                className={styles.menuItem} 
                onClick={() => setFollowCursor(!followCursor)}
              >
                <span className={styles.menuCheck}>{followCursor && <VscCheck />}</span>
                <span>Follow Cursor</span>
              </button>
              <button 
                className={styles.menuItem} 
                onClick={() => setFilterOnType(!filterOnType)}
              >
                <span className={styles.menuCheck}>{filterOnType && <VscCheck />}</span>
                <span>Filter on Type</span>
              </button>
            </div>,
            document.body
          )}
        </div>
      </div>

      {isExpanded && (
        <div className={styles.body}>
          {filterOnType && (
            <div className={styles.filterBar}>
              <input 
                type="text"
                className={styles.filterInput}
                placeholder="Filter symbols..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                autoFocus
              />
            </div>
          )}

          {processedSymbols.length > 0 ? (
            <div className={styles.symbolList}>
              {processedSymbols.map(sym => renderSymbolItem(sym))}
            </div>
          ) : (
            <div className={styles.empty}>
              The active editor cannot provide outline information.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default OutlinePane;