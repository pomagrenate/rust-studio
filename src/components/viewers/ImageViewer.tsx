import { useState, useRef, useEffect, useCallback } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  VscZoomIn,
  VscZoomOut,
  VscDiscard,
} from "react-icons/vsc";
import styles from "./ImageViewer.module.css";

interface ImageViewerProps {
  filePath: string;
}

export function ImageViewer({ filePath }: ImageViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const fileName = filePath.split(/[/\\]/).pop() || filePath;

  const imageSrc = window.__TAURI_INTERNALS__
    ? convertFileSrc(filePath)
    : filePath;

  // Reset zoom and pan on file change
  useEffect(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setImageDimensions(null);
  }, [filePath]);

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(5, Number((prev + 0.25).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(0.1, Number((prev - 0.25).toFixed(2))));
  };

  const handleZoomReset = () => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoom((prev) => Math.min(5, Number((prev + 0.15).toFixed(2))));
    } else {
      setZoom((prev) => Math.max(0.1, Number((prev - 0.15).toFixed(2))));
    }
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleImageLoaded = () => {
    if (imgRef.current) {
      setImageDimensions({
        width: imgRef.current.naturalWidth,
        height: imgRef.current.naturalHeight,
      });
    }
  };

  return (
    <div className={styles.imageViewerContainer}>
      {/* Top Toolbar */}
      <div className={styles.toolbar}>
        <button className={styles.toolbarBtn} onClick={handleZoomIn} title="Zoom In (Wheel Up)">
          <VscZoomIn />
          <span>In</span>
        </button>

        <button className={styles.toolbarBtn} onClick={handleZoomOut} title="Zoom Out (Wheel Down)">
          <VscZoomOut />
          <span>Out</span>
        </button>

        <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>

        <button className={styles.toolbarBtn} onClick={handleZoomReset} title="Reset to 100% (1:1)">
          <VscDiscard />
          <span>1:1</span>
        </button>

        <div className={styles.infoDivider} />

        <span className={styles.infoBadge}>
          {fileName}
          {imageDimensions && ` • ${imageDimensions.width} × ${imageDimensions.height} px`}
        </span>
      </div>

      {/* Interactive Canvas Viewport */}
      <div
        className={styles.canvasViewport}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className={styles.imageWrapper}
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
          }}
        >
          <img
            ref={imgRef}
            src={imageSrc}
            alt={fileName}
            className={styles.imageElement}
            onLoad={handleImageLoaded}
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}

export default ImageViewer;
