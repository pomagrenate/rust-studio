/**
 * HoverTooltip.tsx — LSP hover tooltip component
 * Displays type information, documentation, and other hover information from the LSP
 */

import { useRef, useEffect, useState } from "react";
import styles from "./HoverTooltip.module.css";

export interface HoverTooltipProps {
  x: number;
  y: number;
  content: {
    range?: { start: { line: number; character: number }; end: { line: number; character: number } };
    contents?: Array<string | { language: string; value: string }>;
  } | null;
  onClose: () => void;
}

export function HoverTooltip({ x, y, content, onClose }: HoverTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  useEffect(() => {
    if (!tooltipRef.current) return;

    const rect = tooltipRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y + 20; // Offset below cursor

    // Prevent overflow on right edge
    if (adjustedX + rect.width > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 10;
    }

    // Prevent overflow on bottom edge
    if (adjustedY + rect.height > viewportHeight) {
      adjustedY = y - rect.height - 10;
    }

    setPosition({ x: adjustedX, y: adjustedY });
  }, [x, y, content]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  if (!content) return null;

  const renderContent = () => {
    if (!content.contents || content.contents.length === 0) {
      return <div className={styles.tooltipText}>No information available</div>;
    }

    return content.contents.map((item, index) => {
      if (typeof item === "string") {
        return (
          <div key={index} className={styles.tooltipText}>
            {item}
          </div>
        );
      } else {
        return (
          <div key={index} className={styles.tooltipCodeBlock}>
            <div className={styles.tooltipCodeLanguage}>{item.language}</div>
            <pre className={styles.tooltipCodeValue}>{item.value}</pre>
          </div>
        );
      }
    });
  };

  return (
    <div
      ref={tooltipRef}
      className={styles.tooltip}
      style={{ left: position.x, top: position.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {renderContent()}
    </div>
  );
}

export default HoverTooltip;
