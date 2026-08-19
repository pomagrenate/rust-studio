import { useEffect, useRef, useState } from "react";
import { RUST_TEMPLATES, filterTemplates, type SurroundTemplate } from "../../utils/surroundWith";
import styles from "./SurroundWithWidget.module.css";

interface SurroundWithWidgetProps {
  position: { x: number; y: number };
  selectedText: string;
  onApply: (template: SurroundTemplate) => void;
  onClose: () => void;
}

export function SurroundWithWidget({
  position,
  selectedText: _selectedText,
  onApply,
  onClose,
}: SurroundWithWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filterText, setFilterText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredTemplates = filterTemplates(filterText);

  useEffect(() => {
    // Focus input when widget opens
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    // Reset selected index when filter changes
    setSelectedIndex(0);
  }, [filterText]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredTemplates.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filteredTemplates[selectedIndex]) {
          onApply(filteredTemplates[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
      case "1":
      case "2":
      case "3":
      case "4":
      case "5":
      case "6":
      case "7":
      case "8":
      case "9":
        e.preventDefault();
        const shortcut = parseInt(e.key);
        const template = RUST_TEMPLATES.find(t => t.shortcut === shortcut);
        if (template) {
          onApply(template);
        }
        break;
      case "0":
        e.preventDefault();
        const template10 = RUST_TEMPLATES.find(t => t.shortcut === 10);
        if (template10) {
          onApply(template10);
        }
        break;
    }
  };

  const handleClickOutside = (e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleTemplateClick = (template: SurroundTemplate) => {
    onApply(template);
  };

  return (
    <div
      ref={containerRef}
      className={styles.container}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.header}>
        <input
          ref={inputRef}
          type="text"
          className={styles.filterInput}
          placeholder="Filter templates..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
      </div>

      <div className={styles.templateList}>
        {filteredTemplates.length === 0 ? (
          <div className={styles.emptyState}>No templates found</div>
        ) : (
          filteredTemplates.map((template, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={template.id}
                className={`${styles.templateItem} ${isSelected ? styles.selected : ""}`}
                onClick={() => handleTemplateClick(template)}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div className={styles.templateShortcut}>{template.shortcut}</div>
                <div className={styles.templateContent}>
                  <div className={styles.templateLabel}>{template.label}</div>
                  <div className={styles.templateDescription}>{template.description}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className={styles.footer}>
        <span className={styles.footerHint}>
          ↑↓ Navigate • Enter Select • Esc Close • 1-0 Quick Select
        </span>
      </div>
    </div>
  );
}
