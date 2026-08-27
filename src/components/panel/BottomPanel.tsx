/**
 * BottomPanel.tsx — JetBrains RustRover Style Terminal Tool Window
 * Supports multiple tabs, split terminal panes (horizontal & vertical),
 * dynamic width/height drag resizing, profiles, and theme synchronization via useTheme.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { 
  VscAdd, 
  VscChevronDown, 
  VscClose, 
  VscEllipsis,
  VscChromeMinimize,
  VscTerminalPowershell,
  VscTerminalCmd,
  VscTerminalBash,
  VscTerminalLinux,
  VscTerminal,
  VscRemote,
  VscSplitHorizontal,
  VscSplitVertical,
  VscTrash,
  VscDiscard
} from 'react-icons/vsc';
import { useTheme, ThemeId } from '../../hooks/useTheme';
import { CargoDiagnostic } from '../../extensions/builtin/rust/CargoProvider';
import { getTerminalSuggestions, TerminalSuggestItem } from '../../extensions/builtin/terminal/CargoSuggestEngine';
import { TerminalSuggestWidget, QuickTerminalBar } from '../terminal/TerminalSuggestWidget';
import styles from './BottomPanel.module.css';

export interface TerminalProfileItem {
  id: string;
  name: string;
  icon: string;
}

export interface TerminalPane {
  id: string;
  profile: string;
  title: string;
}

export interface TerminalTabItem {
  id: string;
  title: string;
  panes: TerminalPane[];
  splitDirection: 'horizontal' | 'vertical';
  paneSizes: number[];
  activePaneId: string;
}

export type TabName = 'Terminal' | 'Problems' | 'Output';

interface BottomPanelProps {
  onClose?: () => void;
  cwd?: string;
  activeTab?: TabName;
  onTabChange?: (tab: TabName) => void;
  diagnostics?: CargoDiagnostic[];
  outputLogs?: string;
  onNavigateToProblem?: (filePath: string, line: number, col: number) => void;
}

let terminalCounter = 1;

function getProfileIcon(profile: string) {
  const p = profile.toLowerCase();
  if (p.includes('powershell') || p.includes('pwsh')) return <VscTerminalPowershell color="#0078d4" size={14} />;
  if (p.includes('cmd')) return <VscTerminalCmd color="#555555" size={14} />;
  if (p.includes('gitbash') || p.includes('bash')) return <VscTerminalBash color="#f05033" size={14} />;
  if (p.includes('wsl') || p.includes('ubuntu') || p.includes('linux')) return <VscTerminalLinux color="#e95420" size={14} />;
  return <VscTerminal color="#007acc" size={14} />;
}

// ── Single Active Terminal Canvas Component ──
interface TerminalSessionViewProps {
  pane: TerminalPane;
  cwd?: string;
  theme: ThemeId;
  onClearTerminalRef?: (clearFn: () => void) => void;
}

function TerminalSessionView({ pane, cwd, theme, onClearTerminalRef }: TerminalSessionViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const lastColsRef = useRef<number>(0);
  const lastRowsRef = useRef<number>(0);

  // ── Intelligent Autocompletion State ──
  const [suggestions, setSuggestions] = useState<TerminalSuggestItem[]>([]);
  const [suggestIdx, setSuggestIdx] = useState<number>(0);
  const inputBufferRef = useRef<string>("");
  const replacePrefixRef = useRef<string>("");

  const handleApplySuggestion = useCallback((item: TerminalSuggestItem) => {
    if (!xtermRef.current) return;
    const prefix = replacePrefixRef.current;
    let completionText = item.insertText;
    if (prefix && completionText.startsWith(prefix)) {
      completionText = completionText.slice(prefix.length);
    }
    // Write completion directly to PTY backend and local terminal
    if (window.__TAURI_INTERNALS__) {
      invoke('write_terminal', { id: pane.id, data: completionText }).catch(() => {});
    } else {
      xtermRef.current.write(completionText);
    }
    inputBufferRef.current += completionText;
    setSuggestions([]);
  }, [pane.id]);

  const handleExecuteQuickCommand = useCallback((cmd: string) => {
    if (!xtermRef.current) return;
    if (window.__TAURI_INTERNALS__) {
      invoke('write_terminal', { id: pane.id, data: cmd }).catch(() => {});
    } else {
      xtermRef.current.write(`\r\n${cmd}\r\n$ `);
    }
    inputBufferRef.current = "";
    setSuggestions([]);
  }, [pane.id]);

  // Mount terminal instance once
  useEffect(() => {
    let isMounted = true;
    if (!containerRef.current) return;

    const isDark = theme === 'dark';

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13.5,
      lineHeight: 1.2,
      fontFamily: "var(--pm-font-mono, 'JetBrains Mono', Consolas, monospace)",
      theme: {
        background: isDark ? '#1e1f22' : '#ffffff',
        foreground: isDark ? '#dfe1e5' : '#24292f',
        cursor: isDark ? '#ffffff' : '#000000',
        selectionBackground: isDark ? 'rgba(53, 116, 240, 0.4)' : 'rgba(0, 95, 184, 0.25)',
      },
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    if (onClearTerminalRef) {
      onClearTerminalRef(() => {
        terminal.clear();
      });
    }

    // Safe fit helper avoiding ResizeObserver loops
    const safeFit = () => {
      if (!fitAddonRef.current || !xtermRef.current || !containerRef.current) return;
      try {
        fitAddonRef.current.fit();
        const { cols, rows } = xtermRef.current;
        if (cols > 0 && rows > 0 && (cols !== lastColsRef.current || rows !== lastRowsRef.current)) {
          lastColsRef.current = cols;
          lastRowsRef.current = rows;
          if (window.__TAURI_INTERNALS__) {
            invoke('resize_terminal', { id: pane.id, cols, rows }).catch(() => {});
          }
        }
      } catch (e) {
        // ignore layout race
      }
    };

    safeFit();

    // Listen to key events for suggestion navigation
    terminal.attachCustomKeyEventHandler((domEvent) => {
      if (suggestions.length > 0) {
        if (domEvent.key === "ArrowDown" && domEvent.type === "keydown") {
          setSuggestIdx((idx) => (idx + 1) % suggestions.length);
          return false;
        }
        if (domEvent.key === "ArrowUp" && domEvent.type === "keydown") {
          setSuggestIdx((idx) => (idx - 1 + suggestions.length) % suggestions.length);
          return false;
        }
        if (domEvent.key === "Tab" && domEvent.type === "keydown") {
          handleApplySuggestion(suggestions[suggestIdx]);
          return false;
        }
        if (domEvent.key === "Escape" && domEvent.type === "keydown") {
          setSuggestions([]);
          return false;
        }
      }
      return true;
    });

    // Listen to data from frontend to backend & track buffer for completions
    const onDataDisposable = terminal.onData((data) => {
      if (window.__TAURI_INTERNALS__) {
        invoke('write_terminal', { id: pane.id, data }).catch(() => {});
      }

      if (data === '\r' || data === '\x03') {
        inputBufferRef.current = "";
        setSuggestions([]);
      } else if (data === '\x7f' || data === '\b') {
        inputBufferRef.current = inputBufferRef.current.slice(0, -1);
        const { suggestions: items, replacePrefix } = getTerminalSuggestions(inputBufferRef.current);
        setSuggestions(items);
        replacePrefixRef.current = replacePrefix;
        setSuggestIdx(0);
      } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
        inputBufferRef.current += data;
        const { suggestions: items, replacePrefix } = getTerminalSuggestions(inputBufferRef.current);
        setSuggestions(items);
        replacePrefixRef.current = replacePrefix;
        setSuggestIdx(0);
      }
    });

    // Initialize backend PTY
    const initPty = async () => {
      try {
        await invoke('spawn_terminal', {
          id: pane.id,
          profile: pane.profile,
          cwd: cwd || undefined,
        });

        if (!isMounted) return;

        const unlisten = await listen<{ id: string; data: string }>('pty-output', (event) => {
          if (event.payload.id === pane.id && xtermRef.current) {
            xtermRef.current.write(event.payload.data);
          }
        });
        unlistenRef.current = unlisten;

        requestAnimationFrame(safeFit);
      } catch (err) {
        console.error(`Failed to init PTY [${pane.id}]:`, err);
        terminal.write(`\r\n\x1b[31mFailed to start terminal: ${err}\x1b[0m\r\n`);
      }
    };

    if (window.__TAURI_INTERNALS__) {
      initPty();
    } else {
      terminal.write(`[Browser Preview] Terminal '${pane.title}' (${pane.profile}) active.\r\n$ `);
    }

    // Debounced ResizeObserver
    let resizeTimer: number | null = null;
    const ro = new ResizeObserver(() => {
      if (resizeTimer !== null) cancelAnimationFrame(resizeTimer);
      resizeTimer = requestAnimationFrame(() => {
        safeFit();
      });
    });

    if (containerRef.current) {
      ro.observe(containerRef.current);
    }

    return () => {
      isMounted = false;
      ro.disconnect();
      if (resizeTimer !== null) cancelAnimationFrame(resizeTimer);
      onDataDisposable.dispose();
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
      terminal.dispose();
      xtermRef.current = null;
      if (window.__TAURI_INTERNALS__) {
        invoke('kill_terminal', { id: pane.id }).catch(() => {});
      }
    };
  }, [pane.id, pane.profile, cwd, handleApplySuggestion, suggestions, suggestIdx]);

  // Synchronize terminal theme dynamically when theme changes
  useEffect(() => {
    if (xtermRef.current) {
      const isDark = theme === 'dark';
      xtermRef.current.options.theme = {
        background: isDark ? '#1e1f22' : '#ffffff',
        foreground: isDark ? '#dfe1e5' : '#24292f',
        cursor: isDark ? '#ffffff' : '#000000',
        selectionBackground: isDark ? 'rgba(53, 116, 240, 0.4)' : 'rgba(0, 95, 184, 0.25)',
      };
    }
  }, [theme]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', position: 'relative' }}>
      <div className={styles.terminalCanvas} ref={containerRef} style={{ flex: 1, minHeight: 0 }} />

      {/* Floating Terminal Suggestion Popup */}
      {suggestions.length > 0 && (
        <TerminalSuggestWidget
          suggestions={suggestions}
          selectedIndex={suggestIdx}
          onSelectSuggestion={handleApplySuggestion}
          onClose={() => setSuggestions([])}
        />
      )}

      {/* Quick Terminal Action Bar */}
      <QuickTerminalBar onExecuteCommand={handleExecuteQuickCommand} />
    </div>
  );
}

// ── Root JetBrains RustRover Terminal Tool Window ──
export const BottomPanel = React.memo(function BottomPanel({
  onClose,
  cwd,
}: BottomPanelProps) {
  const { theme } = useTheme();
  const [profiles, setProfiles] = useState<TerminalProfileItem[]>([]);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [resizingIndex, setResizingIndex] = useState<number | null>(null);

  const profileMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const clearFnsRef = useRef<Record<string, () => void>>({});

  const [tabs, setTabs] = useState<TerminalTabItem[]>(() => {
    const initialPaneId = `term-${terminalCounter++}`;
    return [
      {
        id: 'tab-1',
        title: 'Local',
        panes: [{ id: initialPaneId, profile: 'powershell', title: 'powershell' }],
        splitDirection: 'horizontal',
        paneSizes: [100],
        activePaneId: initialPaneId,
      },
    ];
  });
  const [activeTabId, setActiveTabId] = useState<string>('tab-1');

  // Fetch available terminal profiles from Rust
  useEffect(() => {
    if (window.__TAURI_INTERNALS__) {
      invoke<TerminalProfileItem[]>('list_terminal_profiles')
        .then((res) => {
          if (res && res.length > 0) setProfiles(res);
        })
        .catch(console.error);
    }
  }, []);

  // Close dropdown menus on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    }
    if (isProfileMenuOpen || isMoreMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileMenuOpen, isMoreMenuOpen]);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  // Tab creation
  const createTab = useCallback((profile = 'powershell') => {
    const newTabId = `tab-${Date.now()}`;
    const newPaneId = `term-${terminalCounter++}`;
    const count = tabs.length + 1;
    const title = count === 1 ? 'Local' : `Local (${count})`;
    const newTab: TerminalTabItem = {
      id: newTabId,
      title,
      panes: [{ id: newPaneId, profile, title: profile }],
      splitDirection: 'horizontal',
      paneSizes: [100],
      activePaneId: newPaneId,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTabId);
    setIsProfileMenuOpen(false);
  }, [tabs.length]);

  // Tab closing
  const closeTab = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    setTabs((prev) => {
      const filtered = prev.filter((t) => t.id !== tabId);
      if (filtered.length === 0) {
        onClose?.();
        return prev;
      }
      if (activeTabId === tabId) {
        setActiveTabId(filtered[filtered.length - 1].id);
      }
      return filtered;
    });
  }, [activeTabId, onClose]);

  // Split active tab horizontally or vertically
  const splitActiveTerminal = useCallback((direction: 'horizontal' | 'vertical', profile = 'powershell') => {
    if (!activeTab) return;
    const newPaneId = `term-${terminalCounter++}`;
    const newPane: TerminalPane = {
      id: newPaneId,
      profile,
      title: profile,
    };

    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== activeTab.id) return tab;
        const newCount = tab.panes.length + 1;
        const equalSize = 100 / newCount;
        const newSizes = new Array(newCount).fill(equalSize);
        return {
          ...tab,
          panes: [...tab.panes, newPane],
          splitDirection: direction,
          paneSizes: newSizes,
          activePaneId: newPaneId,
        };
      })
    );
    setIsMoreMenuOpen(false);
  }, [activeTab]);

  // Close specific split pane
  const closeSplitPane = useCallback((paneId: string) => {
    if (!activeTab) return;
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== activeTab.id) return tab;
        const filteredPanes = tab.panes.filter((p) => p.id !== paneId);
        if (filteredPanes.length === 0) return tab;
        const newSizes = new Array(filteredPanes.length).fill(100 / filteredPanes.length);
        const nextActiveId = filteredPanes.some((p) => p.id === tab.activePaneId)
          ? tab.activePaneId
          : filteredPanes[filteredPanes.length - 1].id;
        return {
          ...tab,
          panes: filteredPanes,
          paneSizes: newSizes,
          activePaneId: nextActiveId,
        };
      })
    );
    setIsMoreMenuOpen(false);
  }, [activeTab]);

  // Equalize sizes
  const equalizeSizes = useCallback(() => {
    if (!activeTab) return;
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== activeTab.id) return tab;
        const equalSize = 100 / tab.panes.length;
        return {
          ...tab,
          paneSizes: new Array(tab.panes.length).fill(equalSize),
        };
      })
    );
    setIsMoreMenuOpen(false);
  }, [activeTab]);

  // Toggle split orientation
  const toggleSplitOrientation = useCallback(() => {
    if (!activeTab) return;
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== activeTab.id) return tab;
        return {
          ...tab,
          splitDirection: tab.splitDirection === 'horizontal' ? 'vertical' : 'horizontal',
        };
      })
    );
    setIsMoreMenuOpen(false);
  }, [activeTab]);

  // Clear active pane terminal buffer
  const clearActiveTerminal = useCallback(() => {
    if (!activeTab) return;
    const clearFn = clearFnsRef.current[activeTab.activePaneId];
    if (clearFn) {
      clearFn();
    }
    setIsMoreMenuOpen(false);
  }, [activeTab]);

  // Resize drag handling between split panes
  const handleResizeStart = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    setResizingIndex(index);
    const isHorizontal = activeTab.splitDirection === 'horizontal';
    const container = splitContainerRef.current;
    if (!container) return;

    const startCoord = isHorizontal ? e.clientX : e.clientY;
    const containerSize = isHorizontal ? container.clientWidth : container.clientHeight;
    const startSizes = [...activeTab.paneSizes];

    const onMouseMove = (moveEvt: MouseEvent) => {
      const currentCoord = isHorizontal ? moveEvt.clientX : moveEvt.clientY;
      const deltaPx = currentCoord - startCoord;
      const deltaPct = (deltaPx / containerSize) * 100;

      const minPct = 15;
      const combined = startSizes[index] + startSizes[index + 1];
      const newFirst = Math.max(minPct, Math.min(combined - minPct, startSizes[index] + deltaPct));
      const newSecond = combined - newFirst;

      const nextSizes = [...startSizes];
      nextSizes[index] = newFirst;
      nextSizes[index + 1] = newSecond;

      setTabs((prev) =>
        prev.map((t) => (t.id === activeTab.id ? { ...t, paneSizes: nextSizes } : t))
      );
    };

    const onMouseUp = () => {
      setResizingIndex(null);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const defaultProfiles = [
    { id: 'powershell', name: 'Windows PowerShell', icon: 'powershell' },
    { id: 'cmd', name: 'Command Prompt', icon: 'cmd' },
    { id: 'gitbash', name: 'Git Bash', icon: 'gitbash' },
    { id: 'wsl:Ubuntu-24.04', name: 'Ubuntu-2404', icon: 'wsl' },
  ];

  const displayProfiles = profiles.length > 0 ? profiles : defaultProfiles;

  return (
    <div className={styles.panelContainer}>
      {/* ── Terminal Tool Window Header ── */}
      <div className={styles.panelHeader}>
        <div className={styles.headerLeft}>
          <span className={styles.titleBadge}>Terminal</span>

          {/* Tab Pills */}
          <div className={styles.tabList}>
            {tabs.map((t) => (
              <button
                key={t.id}
                className={`${styles.tabItem} ${activeTabId === t.id ? styles.tabItemActive : ''}`}
                onClick={() => setActiveTabId(t.id)}
                title={`Switch to ${t.title}`}
              >
                <span>{t.title}</span>
                <span
                  className={styles.tabCloseBtn}
                  onClick={(e) => closeTab(e, t.id)}
                  title="Close Terminal Tab"
                >
                  <VscClose />
                </span>
              </button>
            ))}
          </div>

          {/* Add Tab & Profile Dropdown */}
          <div className={styles.addControls} ref={profileMenuRef}>
            <button
              className={styles.tabAddBtn}
              title="New Terminal Tab"
              onClick={() => createTab('powershell')}
            >
              <VscAdd />
            </button>
            <button
              className={styles.tabDropdownBtn}
              title="Select Terminal Profile"
              onClick={() => setIsProfileMenuOpen((prev) => !prev)}
            >
              <VscChevronDown />
            </button>

            {isProfileMenuOpen && (
              <div className={styles.profileDropdown}>
                {displayProfiles.map((prof) => (
                  <button
                    key={prof.id}
                    className={styles.profileItem}
                    onClick={() => createTab(prof.id)}
                  >
                    {getProfileIcon(prof.id)}
                    <span>{prof.name}</span>
                  </button>
                ))}
                <div className={styles.profileSeparator} />
                <button
                  className={styles.profileItem}
                  onClick={() => {
                    createTab('powershell');
                    setIsProfileMenuOpen(false);
                  }}
                >
                  <VscRemote size={14} color="#0078d4" />
                  <span>New SSH Session...</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Header Right Actions */}
        <div className={styles.headerRight} ref={moreMenuRef}>
          <button
            className={`${styles.actionBtn} ${isMoreMenuOpen ? styles.actionBtnActive : ''}`}
            title="More Actions (Split, Resize, Clear)"
            onClick={() => setIsMoreMenuOpen((prev) => !prev)}
          >
            <VscEllipsis />
          </button>

          {isMoreMenuOpen && (
            <div className={styles.moreActionsDropdown}>
              <button
                className={styles.profileItem}
                onClick={() => splitActiveTerminal('horizontal')}
              >
                <VscSplitHorizontal size={14} color="#0078d4" />
                <span>Split Right (Horizontal)</span>
              </button>
              <button
                className={styles.profileItem}
                onClick={() => splitActiveTerminal('vertical')}
              >
                <VscSplitVertical size={14} color="#0078d4" />
                <span>Split Down (Vertical)</span>
              </button>

              {activeTab && activeTab.panes.length > 1 && (
                <>
                  <button
                    className={styles.profileItem}
                    onClick={toggleSplitOrientation}
                  >
                    <VscDiscard size={14} />
                    <span>
                      Switch to {activeTab.splitDirection === 'horizontal' ? 'Vertical' : 'Horizontal'}
                    </span>
                  </button>
                  <button
                    className={styles.profileItem}
                    onClick={equalizeSizes}
                  >
                    <VscSplitHorizontal size={14} />
                    <span>Equalize Width/Height</span>
                  </button>
                  <div className={styles.profileSeparator} />
                  <button
                    className={styles.profileItem}
                    onClick={() => closeSplitPane(activeTab.activePaneId)}
                  >
                    <VscClose size={14} color="#cf222e" />
                    <span>Close Active Split Pane</span>
                  </button>
                </>
              )}

              <div className={styles.profileSeparator} />
              <button
                className={styles.profileItem}
                onClick={clearActiveTerminal}
              >
                <VscTrash size={14} />
                <span>Clear Buffer</span>
              </button>
            </div>
          )}

          {onClose && (
            <button className={styles.actionBtn} onClick={onClose} title="Minimize Terminal">
              <VscChromeMinimize />
            </button>
          )}
        </div>
      </div>

      {/* ── Terminal Body (Multi-Pane Split Canvas) ── */}
      <div className={styles.panelBody}>
        {activeTab && (
          <div
            ref={splitContainerRef}
            className={`${styles.splitPanesContainer} ${
              activeTab.splitDirection === 'horizontal'
                ? styles.splitHorizontal
                : styles.splitVertical
            }`}
          >
            {activeTab.panes.map((pane, index) => {
              const paneSize = activeTab.paneSizes[index] || 100 / activeTab.panes.length;
              const isHorizontal = activeTab.splitDirection === 'horizontal';
              const sizeStyle = isHorizontal
                ? { width: `${paneSize}%`, height: '100%' }
                : { height: `${paneSize}%`, width: '100%' };

              return (
                <div key={pane.id} style={{ display: 'contents' }}>
                  <div
                    className={styles.paneWrapper}
                    style={sizeStyle}
                    onClick={() => {
                      setTabs((prev) =>
                        prev.map((t) => (t.id === activeTab.id ? { ...t, activePaneId: pane.id } : t))
                      );
                    }}
                  >
                    {/* Subtle Pane Header if multiple split panes exist */}
                    {activeTab.panes.length > 1 && (
                      <div
                        className={`${styles.paneHeader} ${
                          activeTab.activePaneId === pane.id ? styles.paneHeaderActive : ''
                        }`}
                      >
                        <div className={styles.paneTitle}>
                          {getProfileIcon(pane.profile)}
                          <span>{pane.title}</span>
                        </div>
                        <div className={styles.paneActions}>
                          <button
                            className={styles.paneActionBtn}
                            title="Close Pane"
                            onClick={(e) => {
                              e.stopPropagation();
                              closeSplitPane(pane.id);
                            }}
                          >
                            <VscClose />
                          </button>
                        </div>
                      </div>
                    )}

                    <TerminalSessionView
                      pane={pane}
                      cwd={cwd}
                      theme={theme}
                      onClearTerminalRef={(clearFn) => {
                        clearFnsRef.current[pane.id] = clearFn;
                      }}
                    />
                  </div>

                  {/* Resizer divider between split panes */}
                  {index < activeTab.panes.length - 1 && (
                    <div
                      className={`${
                        isHorizontal ? styles.resizerHorizontal : styles.resizerVertical
                      } ${resizingIndex === index ? styles.isResizing : ''}`}
                      onMouseDown={(e) => handleResizeStart(e, index)}
                      onDoubleClick={equalizeSizes}
                      title={`Drag to resize terminal ${isHorizontal ? 'width' : 'height'} (Double click to equalize)`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

export default BottomPanel;
