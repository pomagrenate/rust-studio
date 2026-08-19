import React, { useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { VscNewFile, VscNewFolder, VscPackage } from "react-icons/vsc";
import { FaRust } from "react-icons/fa";
import styles from "./AddDropdown.module.css";

interface AddDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceRoots: string[];
  onRustFile: () => void;
  onDirectory: () => void;
  onRustModule: () => void;
  onCargoCrate: () => void;
  onFile: () => void;
  onScratch: () => void;
  triggerRef: React.RefObject<HTMLDivElement | null>;
}

interface DropdownActionItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
  shortcut?: string;
  isDividerBefore?: boolean;
}

export function AddDropdown({
  isOpen,
  onClose,
  workspaceRoots,
  onRustFile,
  onDirectory,
  onRustModule,
  onCargoCrate,
  onFile,
  onScratch,
  triggerRef
}: AddDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const items: DropdownActionItem[] = useMemo(() => [
    {
      id: "rust_file",
      label: "Rust File",
      icon: <FaRust size={14} color="#ce4a1a" style={{ marginRight: 8, flexShrink: 0 }} />,
      action: onRustFile,
    },
    {
      id: "directory",
      label: "Directory",
      icon: <VscNewFolder size={14} color="#c7a800" style={{ marginRight: 8, flexShrink: 0 }} />,
      action: onDirectory,
    },
    {
      id: "rust_module",
      label: "Rust Module",
      icon: <FaRust size={14} color="#ce4a1a" style={{ marginRight: 8, flexShrink: 0, opacity: 0.7 }} />,
      action: onRustModule,
    },
    {
      id: "cargo_crate",
      label: "Cargo Crate",
      icon: <VscPackage size={14} style={{ marginRight: 8, flexShrink: 0 }} />,
      action: onCargoCrate,
    },
    {
      id: "file",
      label: "File",
      icon: <VscNewFile size={14} style={{ marginRight: 8, flexShrink: 0 }} />,
      action: onFile,
      isDividerBefore: true,
    },
    {
      id: "scratch",
      label: "Scratch File",
      icon: <VscNewFile size={14} style={{ marginRight: 8, flexShrink: 0, opacity: 0.6 }} />,
      action: onScratch,
      shortcut: "Ctrl+Alt+Shift+Insert",
    },
  ], [onRustFile, onDirectory, onRustModule, onCargoCrate, onFile, onScratch]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(item => item.label.toLowerCase().includes(q));
  }, [items, searchQuery]);

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: triggerRect.bottom + 4,
        left: triggerRect.left
      });
      setSearchQuery("");
      setSelectedIndex(0);
      setTimeout(() => searchInputRef.current?.focus(), 30);
    }
  }, [isOpen, triggerRef]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) && 
        triggerRef.current && 
        !triggerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose, triggerRef]);

  const handleExecute = (item: DropdownActionItem) => {
    onClose();
    if (workspaceRoots.length > 0) {
      item.action();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => (prev < filteredItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : filteredItems.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filteredItems[selectedIndex];
      if (target) {
        handleExecute(target);
      }
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={dropdownRef}
      className={styles.addDropdown}
      style={{
        position: "fixed",
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex: 9999
      }}
      onKeyDown={handleKeyDown}
      onClick={e => e.stopPropagation()}
    >
      <div className={styles.addDropdownSearch}>
        <VscNewFile size={12} style={{ opacity: 0.5, marginRight: 6, flexShrink: 0 }} />
        <input
          ref={searchInputRef}
          className={styles.addDropdownSearchInput}
          placeholder="Search file type"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSelectedIndex(0);
          }}
        />
      </div>

      <div className={styles.dropdownDivider} />

      {filteredItems.map((item, idx) => (
        <React.Fragment key={item.id}>
          {item.isDividerBefore && !searchQuery && (
            <div className={styles.dropdownDivider} />
          )}
          <div
            className={`${styles.addDropdownItem} ${idx === selectedIndex ? styles.addDropdownItemActive : ""}`}
            onMouseEnter={() => setSelectedIndex(idx)}
            onClick={() => handleExecute(item)}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.shortcut && (
              <span className={styles.addDropdownShortcut}>{item.shortcut}</span>
            )}
          </div>
        </React.Fragment>
      ))}

      {filteredItems.length === 0 && (
        <div style={{ padding: "8px 14px", fontSize: "12px", color: "var(--pm-fg-subtle, #6e7681)" }}>
          No matching types
        </div>
      )}
    </div>,
    document.body
  );
}

export default AddDropdown;