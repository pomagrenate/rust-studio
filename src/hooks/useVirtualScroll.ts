/**
 * useVirtualScroll.ts — Viewport virtualization engine.
 *
 * Problem: A 100,000-line file cannot have 100,000 DOM nodes — that would
 * freeze the browser. We solve this identically to VS Code's "virtual scroll":
 *
 *   DOM nodes rendered = visibleLines + OVERSCAN_LINES (top + bottom buffer)
 *
 * Technique: CSS "spacer divs"
 *   ┌──────────────────────────┐
 *   │  top-spacer  (height px) │  ← pushes visible rows into position
 *   │  visible row 1           │
 *   │  visible row 2           │
 *   │  ...                     │
 *   │  visible row N           │
 *   │  bot-spacer  (height px) │  ← fills rest of scroll height
 *   └──────────────────────────┘
 *
 * The scroll container has `overflow-y: scroll` and a fixed height.
 * The inner div's total height = totalLines × lineHeightPx (creating the
 * correct scrollbar thumb size). We only render the slice in the viewport.
 *
 * This is O(visible_lines) DOM nodes regardless of document size.
 */

import { useState, useCallback, useRef, useEffect } from "react";

const OVERSCAN = 5; // extra lines rendered above & below viewport

export interface VirtualScrollState {
  startLine: number;       // first rendered line index
  endLine: number;         // last rendered line index (exclusive)
  offsetY: number;         // CSS top offset for the rendered slice
  totalHeight: number;     // scroll container inner height in px
  topSpacerPx: number;     // height of the invisible top spacer
  bottomSpacerPx: number;  // height of the invisible bottom spacer
}

export interface VirtualScrollOptions {
  totalLines: number;
  lineHeightPx: number;
  viewportHeightPx: number;
}

export function useVirtualScroll({
  totalLines,
  lineHeightPx,
  viewportHeightPx,
}: VirtualScrollOptions) {
  const scrollTopRef = useRef(0);
  const [state, setState] = useState<VirtualScrollState>(() =>
    compute(0, totalLines, lineHeightPx, viewportHeightPx)
  );

  const onScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const scrollTop = (e.currentTarget as HTMLDivElement).scrollTop;
      // Avoid re-renders for sub-pixel scroll changes.
      if (Math.abs(scrollTop - scrollTopRef.current) < 1) return;
      scrollTopRef.current = scrollTop;
      setState(compute(scrollTop, totalLines, lineHeightPx, viewportHeightPx));
    },
    [totalLines, lineHeightPx, viewportHeightPx]
  );

  // Update state when dimensions or file length changes
  useEffect(() => {
    setState(compute(scrollTopRef.current, totalLines, lineHeightPx, viewportHeightPx));
  }, [totalLines, lineHeightPx, viewportHeightPx]);

  return { ...state, onScroll };
}

function compute(
  scrollTop: number,
  totalLines: number,
  lineHeightPx: number,
  viewportHeightPx: number
): VirtualScrollState {
  const totalHeight = totalLines * lineHeightPx;

  const firstVisible = Math.floor(scrollTop / lineHeightPx);
  const visibleCount = Math.ceil(viewportHeightPx / lineHeightPx);

  const startLine = Math.max(0, firstVisible - OVERSCAN);
  const endLine = Math.min(totalLines, firstVisible + visibleCount + OVERSCAN);

  const topSpacerPx = startLine * lineHeightPx;
  const renderedLines = endLine - startLine;
  const bottomSpacerPx = totalHeight - topSpacerPx - renderedLines * lineHeightPx;

  return {
    startLine,
    endLine,
    offsetY: topSpacerPx,
    totalHeight,
    topSpacerPx,
    bottomSpacerPx: Math.max(0, bottomSpacerPx),
  };
}
