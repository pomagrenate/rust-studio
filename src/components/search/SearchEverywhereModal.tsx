import { useState, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  VscSearch,
  VscFile,
  VscFileCode,
  VscJson,
  VscMarkdown,
  VscSymbolClass,
  VscSymbolMethod,
  VscPlay,
  VscFilter,
  VscSplitHorizontal,
  VscClose
} from "react-icons/vsc";
import { FaRust } from "react-icons/fa";
import styles from "./SearchEverywhereModal.module.css";

export type SearchCategory = "all" | "types" | "files" | "symbols" | "actions" | "text";

export interface SearchItem {
  id: string;
  category: "file" | "type" | "symbol" | "action" | "text";
  title: string;
  subtitle: string;
  path?: string;
  line?: number;
  action?: () => void;
  iconType?: "rust" | "file" | "code" | "json" | "markdown" | "action" | "type" | "symbol";
}

interface SearchEverywhereModalProps {
  isOpen: boolean;
  isDocked?: boolean;
  onToggleDock?: () => void;
  workspaceRoot?: string;
  openFiles?: string[];
  onClose: () => void;
  onOpenFile: (path: string) => void;
  onExecuteAction?: (actionName: string) => void;
}

export function SearchEverywhereModal({
  isOpen,
  isDocked = false,
  onToggleDock,
  workspaceRoot,
  openFiles = [],
  onClose,
  onOpenFile,
  onExecuteAction,
}: SearchEverywhereModalProps) {
  const [activeCategory, setActiveCategory] = useState<SearchCategory>("all");
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [includeNonProject, setIncludeNonProject] = useState(false);
  const [workspaceFiles, setWorkspaceFiles] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !workspaceRoot) return;

    const scanDir = async (dir: string, depth = 0): Promise<string[]> => {
      if (depth > 4) return [];
      try {
        if (window.__TAURI_INTERNALS__) {
          const res = await invoke<{ name: string; path: string; kind: string }[]>("list_dir", { path: dir });
          let files: string[] = [];
          for (const item of res) {
            if (item.kind === "file") {
              files.push(item.path);
            } else if (item.kind === "directory" && !["target", "node_modules", ".git"].includes(item.name)) {
              const sub = await scanDir(item.path, depth + 1);
              files.push(...sub);
            }
          }
          return files;
        }
        return [
          `${workspaceRoot}/Cargo.toml`,
          `${workspaceRoot}/src/main.rs`,
          `${workspaceRoot}/src/lib.rs`,
          `${workspaceRoot}/README.md`,
        ];
      } catch {
        return [];
      }
    };

    scanDir(workspaceRoot).then((res) => {
      const merged = Array.from(new Set([...res, ...openFiles.filter(f => f !== "Welcome")]));
      setWorkspaceFiles(merged);
    });
  }, [isOpen, workspaceRoot, openFiles]);

  const standardActions: SearchItem[] = useMemo(() => [
    {
      id: "act-new-project",
      category: "action",
      title: "New Project...",
      subtitle: "Wizard / Scaffold new Rust crate",
      action: () => onExecuteAction?.("new_project"),
      iconType: "action",
    },
    {
      id: "act-open-folder",
      category: "action",
      title: "Open Folder...",
      subtitle: "Open project directory",
      action: () => onExecuteAction?.("open_folder"),
      iconType: "action",
    },
    {
      id: "act-cargo-check",
      category: "action",
      title: "Cargo Check",
      subtitle: "Analyze and detect compile errors/warnings",
      action: () => onExecuteAction?.("cargo_check"),
      iconType: "action",
    },
    {
      id: "act-cargo-build",
      category: "action",
      title: "Cargo Build (dev)",
      subtitle: "Compile development binary",
      action: () => onExecuteAction?.("cargo_build"),
      iconType: "action",
    },
    {
      id: "act-cargo-run",
      category: "action",
      title: "Cargo Run",
      subtitle: "Run the executable binary target",
      action: () => onExecuteAction?.("cargo_run"),
      iconType: "action",
    },
    {
      id: "act-cargo-test",
      category: "action",
      title: "Cargo Test",
      subtitle: "Execute test suite discovery and tests",
      action: () => onExecuteAction?.("cargo_test"),
      iconType: "action",
    },
    {
      id: "act-git-clone",
      category: "action",
      title: "Clone Repository from VCS...",
      subtitle: "Clone Git repo",
      action: () => onExecuteAction?.("git_clone"),
      iconType: "action",
    },
    {
      id: "act-terminal",
      category: "action",
      title: "Toggle Integrated Terminal",
      subtitle: "View PowerShell / bash terminal",
      action: () => onExecuteAction?.("toggle_terminal"),
      iconType: "action",
    },
  ], [onExecuteAction]);

  const rustSymbols: SearchItem[] = useMemo(() => [
    {
      id: "sym-main",
      category: "symbol",
      title: "fn main()",
      subtitle: "src/main.rs",
      path: workspaceFiles.find((p) => p.endsWith("main.rs")),
      line: 1,
      iconType: "symbol",
    },
    {
      id: "type-app-state",
      category: "type",
      title: "struct AppState",
      subtitle: "src/main.rs",
      path: workspaceFiles.find((p) => p.endsWith("main.rs")),
      line: 5,
      iconType: "type",
    },
    {
      id: "type-config",
      category: "type",
      title: "struct Config",
      subtitle: "src/lib.rs",
      path: workspaceFiles.find((p) => p.endsWith("lib.rs")),
      line: 10,
      iconType: "type",
    },
  ], [workspaceFiles]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items: SearchItem[] = [];

    if (["all", "files"].includes(activeCategory)) {
      for (const f of workspaceFiles) {
        const name = f.split(/[/\\]/).pop() || f;
        const parent = f.split(/[/\\]/).slice(0, -1).pop() || ".";
        const ext = name.split(".").pop()?.toLowerCase();
        let iconType: SearchItem["iconType"] = "file";
        if (ext === "rs") iconType = "rust";
        else if (ext === "toml") iconType = "code";
        else if (ext === "json") iconType = "json";
        else if (ext === "md") iconType = "markdown";

        if (!q || name.toLowerCase().includes(q) || f.toLowerCase().includes(q)) {
          items.push({
            id: `file-${f}`,
            category: "file",
            title: name,
            subtitle: parent,
            path: f,
            iconType,
          });
        }
      }
    }

    if (["all", "types"].includes(activeCategory)) {
      for (const t of rustSymbols.filter((s) => s.category === "type")) {
        if (!q || t.title.toLowerCase().includes(q) || t.subtitle.toLowerCase().includes(q)) {
          items.push(t);
        }
      }
    }

    if (["all", "symbols"].includes(activeCategory)) {
      for (const s of rustSymbols.filter((s) => s.category === "symbol")) {
        if (!q || s.title.toLowerCase().includes(q) || s.subtitle.toLowerCase().includes(q)) {
          items.push(s);
        }
      }
    }

    if (["all", "actions"].includes(activeCategory) || q.startsWith("/")) {
      const cleanQ = q.startsWith("/") ? q.slice(1).trim() : q;
      for (const a of standardActions) {
        if (!cleanQ || a.title.toLowerCase().includes(cleanQ) || a.subtitle.toLowerCase().includes(cleanQ)) {
          items.push(a);
        }
      }
    }

    return items;
  }, [activeCategory, query, workspaceFiles, standardActions, rustSymbols]);

  const handleSelectItem = (item: SearchItem) => {
    if (item.category === "action" && item.action) {
      item.action();
      if (!isDocked) onClose();
    } else if (item.path) {
      onOpenFile(item.path);
      if (!isDocked) onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filteredItems.length - 1 ? prev + 1 : 0));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredItems.length - 1));
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const selected = filteredItems[selectedIndex];
      if (selected) {
        handleSelectItem(selected);
      }
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const tabs: SearchCategory[] = ["all", "types", "files", "symbols", "actions", "text"];
      const currentIdx = tabs.indexOf(activeCategory);
      const nextTab = tabs[(currentIdx + 1) % tabs.length];
      setActiveCategory(nextTab);
      setSelectedIndex(0);
    }
  };

  const selectedItem = filteredItems[selectedIndex];

  if (!isOpen && !isDocked) return null;

  const content = (
    <div 
      className={isDocked ? styles.dockedCard : styles.modalCard} 
      onClick={(e) => e.stopPropagation()}
    >
      <div className={styles.tabHeader}>
        <div className={styles.tabList}>
          {(
            [
              { key: "all", label: "All" },
              { key: "types", label: "Types" },
              { key: "files", label: "Files" },
              { key: "symbols", label: "Symbols" },
              { key: "actions", label: "Actions" },
              { key: "text", label: "Text" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              className={`${styles.tabBtn} ${activeCategory === tab.key ? styles.tabBtnActive : ""}`}
              onClick={() => {
                setActiveCategory(tab.key);
                setSelectedIndex(0);
                inputRef.current?.focus();
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={styles.headerRight}>
          {!isDocked && (
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={includeNonProject}
                onChange={(e) => setIncludeNonProject(e.target.checked)}
              />
              <span>Include non-project items</span>
            </label>
          )}

          <div className={styles.headerActions}>
            <button className={styles.iconBtn} title="Filter">
              <VscFilter />
            </button>
            <button 
              className={`${styles.iconBtn} ${isDocked ? styles.iconBtnActive : ""}`} 
              title={isDocked ? "Restore to Modal View" : "Dock to Right Sidebar"}
              onClick={onToggleDock}
            >
              <VscSplitHorizontal />
            </button>
            {isDocked && (
              <button className={styles.iconBtn} title="Close Panel" onClick={onClose}>
                <VscClose />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className={styles.searchInputWrapper}>
        <VscSearch className={styles.searchIcon} />
        <input
          ref={inputRef}
          type="text"
          className={styles.searchInput}
          placeholder="Type / to see commands"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleKeyDown}
        />
        <span className={styles.inputHint}>Tab to switch</span>
      </div>

      <div className={styles.resultsList} ref={resultsContainerRef}>
        {filteredItems.length > 0 ? (
          filteredItems.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={item.id}
                className={`${styles.resultItem} ${isSelected ? styles.resultItemSelected : ""}`}
                onClick={() => handleSelectItem(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div className={styles.resultLeft}>
                  <div className={styles.resultIcon}>
                    {item.iconType === "rust" && <FaRust color="#dea584" />}
                    {item.iconType === "code" && <VscFileCode color="#f85149" />}
                    {item.iconType === "json" && <VscJson color="#cbcb41" />}
                    {item.iconType === "markdown" && <VscMarkdown color="#61afef" />}
                    {item.iconType === "type" && <VscSymbolClass color="#e5c07b" />}
                    {item.iconType === "symbol" && <VscSymbolMethod color="#61afef" />}
                    {item.iconType === "action" && <VscPlay color="#98c379" />}
                    {item.iconType === "file" && <VscFile color="#9da0a8" />}
                  </div>
                  <span className={styles.resultTitle}>{item.title}</span>
                  {item.subtitle && (
                    <span className={styles.resultSubtitle}>{item.subtitle}</span>
                  )}
                </div>

                <div className={styles.resultRight}>
                  {item.category === "action" ? "Action" : item.category === "file" ? "File" : item.category}
                </div>
              </div>
            );
          })
        ) : (
          <div className={styles.emptyState}>
            <VscSearch size={28} color="#6c707e" />
            <span>No matching items found</span>
          </div>
        )}
      </div>

      <div className={styles.modalFooter}>
        <div className={styles.pathPreview} title={selectedItem?.path || selectedItem?.title}>
          {selectedItem?.path || (selectedItem?.action ? "IDE Action" : "")}
        </div>

        <div className={styles.footerAction} onClick={onToggleDock}>
          {isDocked ? "Floating View ↵" : "Dock Right ↵"}
        </div>
      </div>
    </div>
  );

  if (isDocked) {
    return content;
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      {content}
    </div>
  );
}

export default SearchEverywhereModal;