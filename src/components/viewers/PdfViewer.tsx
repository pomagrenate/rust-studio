/**
 * PdfViewer.tsx — In-editor PDF Preview
 *
 * Renders PDF files with:
 *  • Zoom in / out / fit controls
 *  • Page navigation (prev / next / jump-to)
 *  • Pan via drag
 *  • Tauri: uses convertFileSrc to serve local files as asset URLs
 *  • Browser: renders via <iframe> with native PDF viewer
 *  • Graceful fallback with "Open in System Viewer" button
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  VscZoomIn,
  VscZoomOut,
  VscDiscard,
  VscChevronLeft,
  VscChevronRight,
  VscLinkExternal,
} from "react-icons/vsc";
import styles from "./PdfViewer.module.css";

interface PdfViewerProps {
  filePath: string;
}

// A4 aspect ratio: 1 : 1.4142
const A4_W = 816;
const A4_H = Math.round(A4_W * 1.4142);

export function PdfViewer({ filePath }: PdfViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [pageInputVal, setPageInputVal] = useState("1");
  const [iframeError, setIframeError] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);

  const fileName = filePath.split(/[/\\]/).pop() || filePath;

  // Build the URL served to the <iframe>
  const pdfSrc = (() => {
    if (!filePath) return "";
    if (window.__TAURI_INTERNALS__) {
      return convertFileSrc(filePath) + `#page=${currentPage}`;
    }
    // Browser: use file directly (works in Chromium/Firefox)
    return filePath + `#page=${currentPage}`;
  })();

  // Reset on file change
  useEffect(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setCurrentPage(1);
    setPageInputVal("1");
    setTotalPages(null);
    setIframeError(false);
  }, [filePath]);

  // Sync page input with state
  useEffect(() => {
    setPageInputVal(String(currentPage));
  }, [currentPage]);

  // ── Zoom controls ──────────────────────────────────
  const zoomIn  = () => setZoom(z => Math.min(4, parseFloat((z + 0.25).toFixed(2))));
  const zoomOut = () => setZoom(z => Math.max(0.25, parseFloat((z - 0.25).toFixed(2))));
  const zoomReset = () => { setZoom(1); setPosition({ x: 0, y: 0 }); };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    }
  }, []);

  // ── Pan controls ───────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, px: position.x, py: position.y };
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: dragStart.current.px + e.clientX - dragStart.current.x,
      y: dragStart.current.py + e.clientY - dragStart.current.y,
    });
  }, [isDragging]);

  const handleMouseUp = () => setIsDragging(false);

  // ── Page navigation ────────────────────────────────
  const goToPrev = () => setCurrentPage(p => Math.max(1, p - 1));
  const goToNext = () => {
    if (totalPages) setCurrentPage(p => Math.min(totalPages, p + 1));
    else setCurrentPage(p => p + 1);
  };

  const commitPageInput = () => {
    const n = parseInt(pageInputVal, 10);
    if (!isNaN(n) && n >= 1) {
      if (totalPages) setCurrentPage(Math.min(n, totalPages));
      else setCurrentPage(n);
    } else {
      setPageInputVal(String(currentPage));
    }
  };

  // ── Open in system viewer ──────────────────────────
  const openInSystem = async () => {
    if (window.__TAURI_INTERNALS__) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("open_in_system", { path: filePath });
      } catch {
        // fallback: open as URL
        window.open(pdfSrc, "_blank");
      }
    } else {
      window.open(filePath, "_blank");
    }
  };

  const frameW = Math.round(A4_W * zoom);
  const frameH = Math.round(A4_H * zoom);

  return (
    <div className={styles.container}>
      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        {/* Page nav */}
        <button className={styles.toolbarBtn} onClick={goToPrev} disabled={currentPage <= 1} title="Previous page (←)">
          <VscChevronLeft />
        </button>
        <input
          className={styles.pageInput}
          value={pageInputVal}
          onChange={e => setPageInputVal(e.target.value)}
          onBlur={commitPageInput}
          onKeyDown={e => { if (e.key === "Enter") commitPageInput(); }}
          title="Current page"
        />
        {totalPages && (
          <span className={styles.pageLabel}>/ {totalPages}</span>
        )}
        <button className={styles.toolbarBtn} onClick={goToNext} disabled={!!totalPages && currentPage >= totalPages} title="Next page (→)">
          <VscChevronRight />
        </button>

        <div className={styles.divider} />

        {/* Zoom */}
        <button className={styles.toolbarBtn} onClick={zoomOut} title="Zoom Out (Ctrl+Wheel)">
          <VscZoomOut />
          <span>Out</span>
        </button>
        <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
        <button className={styles.toolbarBtn} onClick={zoomIn} title="Zoom In (Ctrl+Wheel)">
          <VscZoomIn />
          <span>In</span>
        </button>
        <button className={styles.toolbarBtn} onClick={zoomReset} title="Reset zoom">
          <VscDiscard />
          <span>1:1</span>
        </button>

        <div className={styles.divider} />

        {/* Open in system */}
        <button className={styles.toolbarBtn} onClick={openInSystem} title="Open in system PDF viewer">
          <VscLinkExternal />
          <span>Open</span>
        </button>

        <div className={styles.spacer} />

        <span className={styles.infoBadge}>{fileName}</span>
      </div>

      {/* ── PDF Viewport ── */}
      {iframeError ? (
        <Fallback fileName={fileName} pdfSrc={pdfSrc} onOpenSystem={openInSystem} />
      ) : (
        <div
          ref={viewportRef}
          className={styles.viewport}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: isDragging ? "grabbing" : "grab" }}
        >
          <div
            className={styles.pdfCard}
            style={{
              transform: `translate(${position.x}px, ${position.y}px)`,
              width: frameW,
              height: frameH,
            }}
          >
            <iframe
              key={filePath}
              src={pdfSrc}
              className={styles.pdfFrame}
              width={frameW}
              height={frameH}
              title={`PDF: ${fileName}`}
              onError={() => setIframeError(true)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Fallback card ─────────────────────────────────────
function Fallback({
  fileName,
  pdfSrc,
  onOpenSystem,
}: {
  fileName: string;
  pdfSrc: string;
  onOpenSystem: () => void;
}) {
  return (
    <div className={styles.fallback}>
      <div className={styles.fallbackIcon}>📄</div>
      <p className={styles.fallbackTitle}>{fileName}</p>
      <p className={styles.fallbackSub}>
        This PDF cannot be rendered inline. Open it in your system's default PDF viewer for full support.
      </p>
      <button className={styles.fallbackBtn} onClick={onOpenSystem}>
        <VscLinkExternal style={{ marginRight: 6, verticalAlign: "middle" }} />
        Open in System Viewer
      </button>
      {pdfSrc && (
        <a
          href={pdfSrc}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 12, color: "#555", marginTop: 8 }}
        >
          Open in browser tab
        </a>
      )}
    </div>
  );
}

export default PdfViewer;
