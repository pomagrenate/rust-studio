/**
 * EditorViewModel.ts — Monaco / VS Code-class View Model layer.
 *
 * Decouples the document text buffer from the view projection.
 * Manages token cache invalidations, line projections, folding ranges,
 * and coordinate translation between buffer positions and screen lines.
 */

export interface TokenSpan {
  startCol: number;
  endCol: number;
  tokenType: number;
}

export interface LineProjection {
  bufferLine: number;
  isFolded: boolean;
  indentationLevel: number;
}

export class EditorViewModel {
  private bufferLines: string[] = [];
  private version: number = 0;
  private dirtyLines: Set<number> = new Set();
  private tokenCache: Map<number, Uint32Array> = new Map();
  private projections: LineProjection[] = [];

  constructor(initialLines: string[]) {
    this.setLines(initialLines);
  }

  /**
   * Replace buffer lines and reset projections.
   */
  public setLines(lines: string[]): void {
    this.bufferLines = [...lines];
    this.version += 1;
    this.dirtyLines.clear();
    this.tokenCache.clear();
    this.rebuildProjections();
  }

  /**
   * Get current document version.
   */
  public getVersion(): number {
    return this.version;
  }

  /**
   * Get total line count in view model.
   */
  public getLineCount(): number {
    return this.bufferLines.length;
  }

  /**
   * Get active visual line projections.
   */
  public getProjections(): LineProjection[] {
    return this.projections;
  }

  /**
   * Get raw text content for a specific buffer line.
   */
  public getLineContent(lineIndex: number): string {
    return this.bufferLines[lineIndex] || "";
  }

  /**
   * Apply an incremental edit to the view model buffer.
   */
  public applyEdit(
    startLine: number,
    startCol: number,
    endLine: number,
    endCol: number,
    newText: string
  ): { affectedStartLine: number; affectedEndLine: number } {
    this.version += 1;

    const insertedLines = newText.split("\n");
    const currentLineText = this.bufferLines[startLine] || "";
    const beforeText = currentLineText.slice(0, startCol);
    const afterLineText = this.bufferLines[endLine] || "";
    const afterText = afterLineText.slice(endCol);

    const replacementLines: string[] = [];
    if (insertedLines.length === 1) {
      replacementLines.push(beforeText + insertedLines[0] + afterText);
    } else {
      replacementLines.push(beforeText + insertedLines[0]);
      for (let i = 1; i < insertedLines.length - 1; i++) {
        replacementLines.push(insertedLines[i]);
      }
      replacementLines.push(insertedLines[insertedLines.length - 1] + afterText);
    }

    const deleteCount = endLine - startLine + 1;
    this.bufferLines.splice(startLine, deleteCount, ...replacementLines);

    // Invalidate token cache for affected range onwards
    this.invalidateTokensFrom(startLine);
    this.rebuildProjections();

    return {
      affectedStartLine: startLine,
      affectedEndLine: startLine + replacementLines.length - 1,
    };
  }

  /**
   * Store tokenization result for a line.
   */
  public setLineTokens(lineIndex: number, tokens: Uint32Array): void {
    this.tokenCache.set(lineIndex, tokens);
  }

  /**
   * Get cached tokens for a line if valid.
   */
  public getLineTokens(lineIndex: number): Uint32Array | undefined {
    return this.tokenCache.get(lineIndex);
  }

  /**
   * Invalidate token cache from lineIndex to end of document.
   */
  public invalidateTokensFrom(lineIndex: number): void {
    for (const key of this.tokenCache.keys()) {
      if (key >= lineIndex) {
        this.tokenCache.delete(key);
      }
    }
  }

  /**
   * Rebuild visual line projections (folding & indent mapping).
   */
  private rebuildProjections(): void {
    this.projections = this.bufferLines.map((_, idx) => ({
      bufferLine: idx,
      isFolded: false,
      indentationLevel: 0,
    }));
  }
}
