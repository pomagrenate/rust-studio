/**
 * ContextMenu.tsx - Main context menu component
 * Portal-based rendering with keyboard navigation and submenu support
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { VscChevronRight } from "react-icons/vsc";
import styles from "./ContextMenu.module.css";
import type { MenuItem, ContextMenuProps } from "./types";

export function ContextMenu({
  isOpen,
  position,
  onClose,
  items,
  onSelect,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const [submenuPosition, setSubmenuPosition] = useState({ x: 0, y: 0 });
  const submenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter visible items
  const visibleItems = items.filter(item => item.visible);

  // Calculate menu position with viewport boundary detection
  const calculatePosition = useCallback(() => {
    if (!menuRef.current) return { x: position.x, y: position.y };

    const menuRect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = position.x;
    let y = position.y;

    // Flip horizontally if too close to right edge
    if (x + menuRect.width > viewportWidth - 10) {
      x = position.x - menuRect.width;
    }

    // Flip vertically if too close to bottom edge
    if (y + menuRect.height > viewportHeight - 10) {
      y = position.y - menuRect.height;
    }

    return { x, y };
  }, [position.x, position.y]);

  const [calculatedPosition, setCalculatedPosition] = useState(calculatePosition());

  useEffect(() => {
    setCalculatedPosition(calculatePosition());
  }, [calculatePosition]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex(prev => (prev + 1) % visibleItems.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex(prev => (prev - 1 + visibleItems.length) % visibleItems.length);
          break;
        case "Enter":
          e.preventDefault();
          if (visibleItems[activeIndex]?.enabled) {
            onSelect(visibleItems[activeIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        case "ArrowRight":
          e.preventDefault();
          const activeItem = visibleItems[activeIndex];
          if (activeItem?.submenu && activeItem.enabled) {
            setOpenSubmenu(activeItem.id);
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (openSubmenu) {
            setOpenSubmenu(null);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, visibleItems, activeIndex, onSelect, onClose, openSubmenu]);

  // Handle click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (submenuTimeoutRef.current) {
        clearTimeout(submenuTimeoutRef.current);
      }
    };
  }, []);

  // Handle submenu hover with delay
  const handleParentItemMouseEnter = useCallback((item: MenuItem, event: React.MouseEvent) => {
    setActiveIndex(visibleItems.indexOf(item));
    if (item.submenu && item.enabled) {
      // Clear any pending close timeout
      if (submenuTimeoutRef.current) {
        clearTimeout(submenuTimeoutRef.current);
        submenuTimeoutRef.current = null;
      }
      
      const menuRect = menuRef.current?.getBoundingClientRect();
      if (!menuRect) return;

      const submenuX = menuRect.right;
      const submenuY = event.clientY;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let finalX = submenuX;
      let finalY = submenuY;

      if (submenuX + 220 > viewportWidth - 10) {
        finalX = menuRect.left - 220;
      }

      if (submenuY + 200 > viewportHeight - 10) {
        finalY = viewportHeight - 210;
      }

      setSubmenuPosition({ x: finalX, y: finalY });
      setOpenSubmenu(item.id);
    }
  }, [visibleItems]);

  const handleParentItemMouseLeave = useCallback(() => {
    // Delay closing to allow mouse to move to submenu
    submenuTimeoutRef.current = setTimeout(() => {
      setOpenSubmenu(null);
    }, 200);
  }, []);

  const handleSubmenuMouseEnter = useCallback(() => {
    // Clear any pending close timeout when entering submenu
    if (submenuTimeoutRef.current) {
      clearTimeout(submenuTimeoutRef.current);
      submenuTimeoutRef.current = null;
    }
  }, []);

  const handleSubmenuMouseLeave = useCallback(() => {
    // Delay closing to allow mouse to move back to parent
    submenuTimeoutRef.current = setTimeout(() => {
      setOpenSubmenu(null);
    }, 200);
  }, []);

  const handleItemClick = (item: MenuItem) => {
    if (item.enabled) {
      if (item.submenu) {
        setOpenSubmenu(item.id);
      } else {
        onSelect(item);
      }
    }
  };

  if (!isOpen) return null;

  const menuContent = (
    <div
      ref={menuRef}
      className={styles.contextMenu}
      style={{
        left: `${calculatedPosition.x}px`,
        top: `${calculatedPosition.y}px`,
      }}
      role="menu"
      tabIndex={-1}
    >
      {visibleItems.map((item, index) => {
        const isActive = index === activeIndex;
        const hasSubmenu = item.submenu && item.submenu.length > 0;

        return (
          <React.Fragment key={item.id}>
            <div
              className={`${styles.menuItem} ${!item.enabled ? styles.disabled : ""} ${isActive ? styles.active : ""}`}
              onClick={() => handleItemClick(item)}
              onMouseEnter={(e) => handleParentItemMouseEnter(item, e)}
              onMouseLeave={handleParentItemMouseLeave}
              role="menuitem"
              aria-disabled={!item.enabled}
            >
              <div className={styles.menuItemContent}>
                {item.icon && <span className={styles.menuItemIcon}>{item.icon}</span>}
                <span className={styles.menuItemLabel}>{item.label}</span>
                {item.shortcut && <span className={styles.menuItemShortcut}>{item.shortcut}</span>}
                {hasSubmenu && <VscChevronRight className={styles.submenuIndicator} />}
              </div>
            </div>
            {item.separatorAfter && <div className={styles.separator} />}
          </React.Fragment>
        );
      })}

      {/* Submenu rendering */}
      {openSubmenu && (() => {
        const parentItem = visibleItems.find(item => item.id === openSubmenu);
        if (!parentItem?.submenu) return null;

        return (
          <div
            className={styles.submenu}
            style={{
              left: `${submenuPosition.x}px`,
              top: `${submenuPosition.y}px`,
            }}
            role="menu"
            onMouseEnter={handleSubmenuMouseEnter}
            onMouseLeave={handleSubmenuMouseLeave}
          >
            {parentItem.submenu.map((subItem) => (
              <React.Fragment key={subItem.id}>
                <div
                  className={`${styles.menuItem} ${!subItem.enabled ? styles.disabled : ""}`}
                  onClick={() => subItem.enabled && onSelect(subItem)}
                  role="menuitem"
                  aria-disabled={!subItem.enabled}
                >
                  <div className={styles.menuItemContent}>
                    {subItem.icon && <span className={styles.menuItemIcon}>{subItem.icon}</span>}
                    <span className={styles.menuItemLabel}>{subItem.label}</span>
                    {subItem.shortcut && <span className={styles.menuItemShortcut}>{subItem.shortcut}</span>}
                  </div>
                </div>
                {subItem.separatorAfter && <div className={styles.separator} />}
              </React.Fragment>
            ))}
          </div>
        );
      })()}
    </div>
  );

  return createPortal(menuContent, document.body);
}
