import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { 
  VscRefresh, 
  VscClearAll, 
  VscChevronDown, 
  VscChevronRight, 
  VscCollapseAll, 
  VscExpandAll, 
  VscReplaceAll, 
  VscReplace, 
  VscEllipsis,
  VscFile,
  VscCaseSensitive,
  VscWholeWord,
  VscRegex,
  VscPreserveCase,
  VscWarning
} from "react-icons/vsc";
import styles from "./SearchPane.module.css";

export interface SearchMatch {
  line_number: number;
  line_text: string;
  match_start: number;
  match_end: number;
}

export interface FileSearchResult {
  file_path: string;
  relative_path: string;
  file_name: string;
  matches: SearchMatch[];
}

export interface SearchResponse {
  results: FileSearchResult[];
  total_files: number;
  total_matches: number;
  duration_ms: number;
  limit_hit: boolean;
}

interface SearchPaneProps {
  workspaceRoots: string[];
  openFiles: string[];
  onOpenFileMatch: (filePath: string, lineNumber: number, colNumber: number) => void;
  onOpenFolder?: () => void;
}

interface SearchMatchRowProps {
  filePath: string;
  match: SearchMatch;
  isReplaceOpen: boolean;
  onOpenFileMatch: (filePath: string, lineNumber: number, colNumber: number) => void;
  onReplaceSingle?: (filePath: string, match: SearchMatch) => void;
}

const SearchMatchRow = React.memo(function SearchMatchRow({
  filePath,
  match,
  isReplaceOpen,
  onOpenFileMatch,
  onReplaceSingle,
}: SearchMatchRowProps) {
  const snippet = useMemo(() => {
    const text = match.line_text;
    const start = match.match_start;
    const end = match.match_end;

    if (start < 0 || end > text.length || start > end) {
      return <span>{text.slice(0, 150)}</span>;
    }

    const maxPrefix = 40;
    const maxSuffix = 80;
    const prefixStart = Math.max(0, start - maxPrefix);
    const suffixEnd = Math.min(text.length, end + maxSuffix);

    const prefixEllipsis = prefixStart > 0 ? "..." : "";
    const suffixEllipsis = suffixEnd < text.length ? "..." : "";

    const before = prefixEllipsis + text.slice(prefixStart, start);
    const matched = text.slice(start, end);
    const after = text.slice(end, suffixEnd) + suffixEllipsis;

    return (
      <span className={styles.lineText}>
        <span>{before}</span>
        <span className={styles.highlight}>{matched}</span>
        <span>{after}</span>
      </span>
    );
  }, [match]);

  return (
    <div
      className={styles.matchRow}
      onClick={() => onOpenFileMatch(filePath, match.line_number - 1, match.match_start)}
      title={`Line ${match.line_number}: ${match.line_text}`}
    >
      <div className={styles.matchContent}>
        <span className={styles.lineNumber}>{match.line_number}:</span>
        {snippet}
      </div>

      {isReplaceOpen && onReplaceSingle && (
        <div
          className={styles.matchActions}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className={styles.fileActionButton}
            title="Replace Match"
            onClick={() => onReplaceSingle(filePath, match)}
          >
            <VscReplace />
          </button>
        </div>
      )}
    </div>
  );
});

interface SearchFileResultItemProps {
  fileResult: FileSearchResult;
  isExpanded: boolean;
  isReplaceOpen: boolean;
  onToggleExpand: (filePath: string) => void;
  onOpenFileMatch: (filePath: string, lineNumber: number, colNumber: number) => void;
  onReplaceInFile?: (filePath: string, matches: SearchMatch[]) => void;
  onReplaceSingle?: (filePath: string, match: SearchMatch) => void;
}

const SearchFileResultItem = React.memo(function SearchFileResultItem({
  fileResult,
  isExpanded,
  isReplaceOpen,
  onToggleExpand,
  onOpenFileMatch,
  onReplaceInFile,
  onReplaceSingle,
}: SearchFileResultItemProps) {
  return (
    <div>
      <div
        className={styles.fileNode}
        onClick={() => onToggleExpand(fileResult.file_path)}
      >
        <div className={styles.fileNodeContent}>
          {isExpanded ? <VscChevronDown /> : <VscChevronRight />}
          <span className={styles.fileIcon}>
            <VscFile color="#dcb67a" />
          </span>
          <span className={styles.fileName}>{fileResult.file_name}</span>
          <span className={styles.filePath}>{fileResult.relative_path}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {isReplaceOpen && onReplaceInFile && (
            <div
              className={styles.fileActions}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className={styles.fileActionButton}
                title="Replace All in File"
                onClick={() => onReplaceInFile(fileResult.file_path, fileResult.matches)}
              >
                <VscReplaceAll />
              </button>
            </div>
          )}
          <span className={styles.fileCountBadge}>{fileResult.matches.length}</span>
        </div>
      </div>

      {isExpanded && (
        <div className={styles.matchList}>
          {fileResult.matches.map((match, idx) => (
            <SearchMatchRow
              key={`${match.line_number}-${match.match_start}-${idx}`}
              filePath={fileResult.file_path}
              match={match}
              isReplaceOpen={isReplaceOpen}
              onOpenFileMatch={onOpenFileMatch}
              onReplaceSingle={onReplaceSingle}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export const SearchPane = React.memo(function SearchPane({
  workspaceRoots,
  openFiles,
  onOpenFileMatch,
  onOpenFolder,
}: SearchPaneProps) {
  // Query state
  const [query, setQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const [isCaseSensitive, setIsCaseSensitive] = useState(false);
  const [isWholeWord, setIsWholeWord] = useState(false);
  const [isRegex, setIsRegex] = useState(false);
  const [preserveCase, setPreserveCase] = useState(false);

  // Filters state
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [includePattern, setIncludePattern] = useState("");
  const [excludePattern, setExcludePattern] = useState("");

  // Results state
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<FileSearchResult[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [limitHit, setLimitHit] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequestIdRef = useRef(0);

  // Execute file search with request cancellation token
  const performSearch = useCallback(async (searchQuery = query) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setResults([]);
      setTotalMatches(0);
      setTotalFiles(0);
      setLimitHit(false);
      setHasSearched(false);
      setIsSearching(false);
      return;
    }

    const currentRequestId = ++searchRequestIdRef.current;
    setIsSearching(true);
    setHasSearched(true);

    try {
      const roots = workspaceRoots.length > 0 ? workspaceRoots : openFiles.filter(f => f !== "Welcome");

      if (roots.length === 0) {
        if (currentRequestId === searchRequestIdRef.current) {
          setResults([]);
          setTotalMatches(0);
          setTotalFiles(0);
          setLimitHit(false);
          setIsSearching(false);
        }
        return;
      }

      if (window.__TAURI_INTERNALS__) {
        const res = await invoke<SearchResponse>("search_in_files", {
          options: {
            query: trimmed,
            roots,
            is_case_sensitive: isCaseSensitive,
            is_whole_word: isWholeWord,
            is_regex: isRegex,
            include_pattern: includePattern ? includePattern : null,
            exclude_pattern: excludePattern ? excludePattern : null,
            max_results: 1000,
          },
        });

        // Only commit state if this request is still the latest one
        if (currentRequestId === searchRequestIdRef.current) {
          setResults(res.results || []);
          setTotalMatches(res.total_matches || 0);
          setTotalFiles(res.total_files || 0);
          setDurationMs(res.duration_ms || 0);
          setLimitHit(res.limit_hit || false);

          if (res.results && res.results.length <= 5) {
            setExpandedFiles(new Set(res.results.map(r => r.file_path)));
          } else if (res.results && res.results.length > 5) {
            setExpandedFiles(new Set(res.results.slice(0, 2).map(r => r.file_path)));
          } else {
            setExpandedFiles(new Set());
          }
        }
      } else {
        if (currentRequestId === searchRequestIdRef.current) {
          setResults([]);
          setTotalMatches(0);
          setTotalFiles(0);
          setLimitHit(false);
        }
      }
    } catch (e) {
      if (currentRequestId === searchRequestIdRef.current) {
        console.error("Search failed:", e);
        setResults([]);
        setTotalMatches(0);
        setTotalFiles(0);
        setLimitHit(false);
      }
    } finally {
      if (currentRequestId === searchRequestIdRef.current) {
        setIsSearching(false);
      }
    }
  }, [query, workspaceRoots, openFiles, isCaseSensitive, isWholeWord, isRegex, includePattern, excludePattern]);

  // Debounced search on input change (400ms)
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (query.trim()) {
      debounceTimerRef.current = setTimeout(() => {
        performSearch(query);
      }, 400);
    } else {
      setResults([]);
      setTotalMatches(0);
      setTotalFiles(0);
      setLimitHit(false);
      setHasSearched(false);
      setIsSearching(false);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, isCaseSensitive, isWholeWord, isRegex, includePattern, excludePattern, performSearch]);

  // Expand / collapse all toggle
  const toggleCollapseAll = useCallback(() => {
    setExpandedFiles(prev => {
      if (prev.size > 0) return new Set();
      return new Set(results.map(r => r.file_path));
    });
  }, [results]);

  // Toggle single file expanded
  const toggleFileExpanded = useCallback((filePath: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }, []);

  // Replace single match
  const handleReplaceSingle = useCallback(async (filePath: string, match: SearchMatch) => {
    if (!window.__TAURI_INTERNALS__) return;
    try {
      await invoke("replace_in_files", {
        replacements: [
          {
            file_path: filePath,
            line_number: match.line_number,
            match_start: match.match_start,
            match_end: match.match_end,
            replacement: replaceQuery,
          },
        ],
      });
      performSearch(query);
    } catch (e) {
      console.error("Replace single failed:", e);
    }
  }, [replaceQuery, performSearch, query]);

  // Replace all in file
  const handleReplaceInFile = useCallback(async (filePath: string, fileMatches: SearchMatch[]) => {
    if (!window.__TAURI_INTERNALS__) return;
    try {
      const replacements = fileMatches.map(m => ({
        file_path: filePath,
        line_number: m.line_number,
        match_start: m.match_start,
        match_end: m.match_end,
        replacement: replaceQuery,
      }));
      await invoke("replace_in_files", { replacements });
      performSearch(query);
    } catch (e) {
      console.error("Replace in file failed:", e);
    }
  }, [replaceQuery, performSearch, query]);

  // Replace all matches in all files
  const handleReplaceAll = useCallback(async () => {
    if (!window.__TAURI_INTERNALS__ || results.length === 0) return;
    try {
      const replacements: any[] = [];
      for (const res of results) {
        for (const m of res.matches) {
          replacements.push({
            file_path: res.file_path,
            line_number: m.line_number,
            match_start: m.match_start,
            match_end: m.match_end,
            replacement: replaceQuery,
          });
        }
      }
      await invoke("replace_in_files", { replacements });
      performSearch(query);
    } catch (e) {
      console.error("Replace all failed:", e);
    }
  }, [results, replaceQuery, performSearch, query]);

  // Clear query and results
  const handleClear = useCallback(() => {
    searchRequestIdRef.current++;
    setQuery("");
    setReplaceQuery("");
    setResults([]);
    setTotalMatches(0);
    setTotalFiles(0);
    setLimitHit(false);
    setHasSearched(false);
    setIsSearching(false);
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  return (
    <div className={styles.searchPane} aria-label="Search">
      {/* Top Header */}
      <div className={styles.searchHeader}>
        <span className={styles.searchTitle}>SEARCH</span>
        <div className={styles.headerActions}>
          <button
            className={styles.headerButton}
            title="Refresh (Enter)"
            onClick={() => performSearch(query)}
          >
            <VscRefresh />
          </button>
          <button
            className={styles.headerButton}
            title="Clear Search"
            onClick={handleClear}
          >
            <VscClearAll />
          </button>
          <button
            className={styles.headerButton}
            title={expandedFiles.size > 0 ? "Collapse All" : "Expand All"}
            onClick={toggleCollapseAll}
          >
            {expandedFiles.size > 0 ? <VscCollapseAll /> : <VscExpandAll />}
          </button>
        </div>
      </div>

      {/* Inputs Section */}
      <div className={styles.inputsContainer}>
        {/* Search Input Row */}
        <div className={styles.inputRow}>
          <button
            className={styles.toggleReplaceBtn}
            onClick={() => setIsReplaceOpen(!isReplaceOpen)}
            title={isReplaceOpen ? "Hide Replace" : "Toggle Replace"}
          >
            {isReplaceOpen ? <VscChevronDown /> : <VscChevronRight />}
          </button>

          <div className={styles.inputWrapper}>
            <input
              ref={searchInputRef}
              className={styles.textInput}
              type="text"
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  performSearch(query);
                }
              }}
            />
            <div className={styles.inInputActions}>
              <button
                className={`${styles.inInputToggle} ${isCaseSensitive ? styles.toggleActive : ""}`}
                onClick={() => setIsCaseSensitive(!isCaseSensitive)}
                title="Match Case (Alt+C)"
              >
                <VscCaseSensitive />
              </button>
              <button
                className={`${styles.inInputToggle} ${isWholeWord ? styles.toggleActive : ""}`}
                onClick={() => setIsWholeWord(!isWholeWord)}
                title="Match Whole Word (Alt+W)"
              >
                <VscWholeWord />
              </button>
              <button
                className={`${styles.inInputToggle} ${isRegex ? styles.toggleActive : ""}`}
                onClick={() => setIsRegex(!isRegex)}
                title="Use Regular Expression (Alt+R)"
              >
                <VscRegex />
              </button>
            </div>
          </div>
        </div>

        {/* Replace Input Row (Collapsible) */}
        {isReplaceOpen && (
          <div className={styles.inputRow}>
            <div style={{ width: 16 }} />
            <div className={styles.inputWrapper}>
              <input
                className={styles.textInput}
                type="text"
                placeholder="Replace"
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.altKey)) {
                    handleReplaceAll();
                  }
                }}
              />
              <div className={styles.inInputActions}>
                <button
                  className={`${styles.inInputToggle} ${preserveCase ? styles.toggleActive : ""}`}
                  onClick={() => setPreserveCase(!preserveCase)}
                  title="Preserve Case (Alt+P)"
                >
                  <VscPreserveCase />
                </button>
              </div>
            </div>
            <button
              className={styles.replaceAllButton}
              title="Replace All (Ctrl+Alt+Enter)"
              onClick={handleReplaceAll}
              disabled={results.length === 0}
            >
              <VscReplaceAll />
            </button>
          </div>
        )}

        {/* Details Toggle (`...`) */}
        <div
          className={styles.detailsToggleRow}
          onClick={() => setIsDetailsOpen(!isDetailsOpen)}
          title="Toggle Search Details"
        >
          <VscEllipsis />
          <span>files to include / exclude</span>
        </div>

        {/* Details Filters */}
        {isDetailsOpen && (
          <div className={styles.detailsSection}>
            <div>
              <div className={styles.detailsLabel}>files to include</div>
              <input
                className={styles.detailsInput}
                type="text"
                placeholder="e.g. *.ts, src/**"
                value={includePattern}
                onChange={(e) => setIncludePattern(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") performSearch(query);
                }}
              />
            </div>
            <div>
              <div className={styles.detailsLabel}>files to exclude</div>
              <input
                className={styles.detailsInput}
                type="text"
                placeholder="e.g. node_modules, target"
                value={excludePattern}
                onChange={(e) => setExcludePattern(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") performSearch(query);
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {isSearching && (
        <div className={styles.progressBar}>
          <div className={styles.progressIndicator} />
        </div>
      )}

      {/* Limit Warning Notice */}
      {limitHit && !isSearching && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          fontSize: 11,
          backgroundColor: 'rgba(234, 179, 8, 0.1)',
          borderBottom: '1px solid rgba(234, 179, 8, 0.2)',
          color: 'var(--pm-fg-default)'
        }}>
          <VscWarning color="#eab308" />
          <span>Results capped at 1,000 matches. Narrow query for more specific results.</span>
        </div>
      )}

      {/* Message Area */}
      {hasSearched && !isSearching && (
        <div className={styles.messageArea}>
          {totalMatches > 0
            ? `${totalMatches} ${totalMatches === 1 ? "result" : "results"} in ${totalFiles} ${totalFiles === 1 ? "file" : "files"} (${durationMs}ms)`
            : "No results found."}
        </div>
      )}

      {/* Results Tree View */}
      <div className={styles.resultsArea}>
        {results.map((fileResult) => (
          <SearchFileResultItem
            key={fileResult.file_path}
            fileResult={fileResult}
            isExpanded={expandedFiles.has(fileResult.file_path)}
            isReplaceOpen={isReplaceOpen}
            onToggleExpand={toggleFileExpanded}
            onOpenFileMatch={onOpenFileMatch}
            onReplaceInFile={handleReplaceInFile}
            onReplaceSingle={handleReplaceSingle}
          />
        ))}

        {/* Empty workspace state */}
        {workspaceRoots.length === 0 && !hasSearched && (
          <div className={styles.emptyState}>
            You have not opened or specified a folder.
            {onOpenFolder && (
              <>
                <br />
                <span className={styles.openFolderLink} onClick={onOpenFolder}>
                  Open Folder
                </span>{" "}
                to search across all project files.
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default SearchPane;

