import { useEffect, useRef, useCallback } from 'react';
import styles from './Minimap.module.css';

interface MinimapProps {
  lines: string[];
  totalLines: number;
  startLine: number;
  endLine: number;
  activeLine: number;
  viewportHeight: number;
  onJumpToLine: (line: number) => void;
}

const PX_PER_LINE = 2; // Each line = 2px height in minimap
const CHAR_WIDTH = 1;
const TEXT_COLOR = 'rgba(36, 41, 47, 0.6)';

export function Minimap({
  lines,
  totalLines,
  startLine,
  endLine,
  activeLine,
  viewportHeight,
  onJumpToLine,
}: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const container = containerRef.current;
    if (!container) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = Math.max(totalLines * PX_PER_LINE, viewportHeight);

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Render each line as a row of colored pixels
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const y = i * PX_PER_LINE;

      // Render line content as tiny horizontal dots
      const maxChars = Math.floor(width / CHAR_WIDTH);
      ctx.fillStyle = TEXT_COLOR;

      for (let c = 0; c < Math.min(line.length, maxChars); c++) {
        const ch = line[c];
        if (ch !== ' ' && ch !== '\t') {
          ctx.fillRect(c * CHAR_WIDTH, y, CHAR_WIDTH, Math.max(1, PX_PER_LINE - 0.5));
        }
      }

      // Highlight current line
      if (i === activeLine) {
        ctx.fillStyle = 'rgba(247, 76, 0, 0.15)';
        ctx.fillRect(0, y, width, PX_PER_LINE);
      }
    }
  }, [lines, totalLines, activeLine, viewportHeight]);

  useEffect(() => {
    render();
  }, [render]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const line = Math.floor(y / PX_PER_LINE);
      onJumpToLine(Math.max(0, Math.min(line, totalLines - 1)));
    },
    [totalLines, onJumpToLine]
  );

  const viewportTop = startLine * PX_PER_LINE;
  const viewportH = (endLine - startLine) * PX_PER_LINE;

  return (
    <div
      ref={containerRef}
      className={styles.container}
      onClick={handleClick}
      role="scrollbar"
      aria-orientation="vertical"
      aria-valuenow={startLine}
      aria-valuemin={0}
      aria-valuemax={totalLines}
    >
      <canvas ref={canvasRef} className={styles.canvas} />
      <div
        className={styles.viewport}
        style={{
          top: `${viewportTop}px`,
          height: `${Math.max(viewportH, 16)}px`,
        }}
      />
    </div>
  );
}
