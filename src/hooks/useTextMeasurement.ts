/**
 * useTextMeasurement.ts — Cached text measurement for cursor positioning.
 *
 * Problem: Creating a canvas and measuring text on every cursor move is expensive.
 * Solution: Cache character widths per font/size combination and reuse them.
 *
 * This eliminates canvas creation overhead and provides O(1) cursor position calculation.
 */

import { useMemo, useRef } from "react";

interface TextMeasurementCache {
  [char: string]: number;
}

interface TextMeasurementOptions {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  charWidth: number; // Fallback monospace width
}

const DEFAULT_OPTIONS: TextMeasurementOptions = {
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, Consolas, monospace",
  fontSize: 14,
  fontWeight: 600,
  charWidth: 8.4,
};

/**
 * Measure and cache character widths for a given font configuration.
 */
class TextMeasurer {
  private cache: TextMeasurementCache = {};
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private options: TextMeasurementOptions;

  constructor(options: TextMeasurementOptions = DEFAULT_OPTIONS) {
    this.options = options;
  }

  private ensureContext() {
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.context = this.canvas.getContext("2d");
      if (this.context) {
        this.context.font = `${this.options.fontWeight} ${this.options.fontSize}px ${this.options.fontFamily}`;
      }
    }
  }

  /**
   * Get the width of a character, using cache if available.
   */
  getCharWidth(char: string): number {
    if (this.cache[char] !== undefined) {
      return this.cache[char];
    }

    this.ensureContext();
    
    if (this.context) {
      const metrics = this.context.measureText(char);
      const width = metrics.width;
      this.cache[char] = width;
      return width;
    }

    // Fallback to monospace assumption
    return this.options.charWidth;
  }

  /**
   * Measure the total width of a string, using cached character widths.
   */
  measureText(text: string): number {
    let totalWidth = 0;
    for (const char of text) {
      totalWidth += this.getCharWidth(char);
    }
    return totalWidth;
  }

  /**
   * Pre-cache common characters for better performance.
   */
  warmupCache() {
    // ASCII printable characters
    for (let i = 32; i <= 126; i++) {
      const char = String.fromCharCode(i);
      this.getCharWidth(char);
    }
    // Common whitespace
    this.getCharWidth(' ');
    this.getCharWidth('\t');
  }

  /**
   * Clear the cache (e.g., when font changes).
   */
  clearCache() {
    this.cache = {};
  }
}

/**
 * Hook for text measurement with caching.
 */
export function useTextMeasurement(options: TextMeasurementOptions = DEFAULT_OPTIONS) {
  const measurerRef = useRef<TextMeasurer | null>(null);

  if (!measurerRef.current) {
    measurerRef.current = new TextMeasurer(options);
    measurerRef.current.warmupCache();
  }

  const measurer = measurerRef.current;

  const measureText = useMemo(() => {
    return (text: string) => measurer.measureText(text);
  }, [measurer]);

  const getCharWidth = useMemo(() => {
    return (char: string) => measurer.getCharWidth(char);
  }, [measurer]);

  return { measureText, getCharWidth };
}

export default useTextMeasurement;
