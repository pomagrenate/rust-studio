import React, { useMemo } from "react";
import { 
  VscCircleFilled, 
  VscPlay, 
  VscError, 
  VscWarning, 
  VscInfo,
  VscChevronRight,
  VscChevronDown,
} from "react-icons/vsc";
import { TokenMetadata } from "../../../src/editor/tokenization/TokenMetadata";
import { TokenKind } from "../../../src/types/contracts";
import styles from "./EditorLine.module.css";

export interface LineDiagnosticRange {
  startCol: number;
  endCol: number;
  severity: string;
  message: string;
}

export interface EditorLineProps {
  lineIndex: number;
  content: string;
  isActive?: boolean;
  isExecutionLine?: boolean;
  hasBreakpoint?: boolean;
  inlineValue?: string;
  tokens?: number[];
  onToggleBreakpoint?: (lineIndex: number) => void;
  diagnosticSeverity?: string;
  lineDiagnostics?: LineDiagnosticRange[];
  /** Text selection highlight range */
  selectionRange?: { startCol: number; endCol: number } | null;
  /** Word-occurrence highlight ranges (all occurrences of word under cursor) */
  wordHighlightRanges?: { startCol: number; endCol: number }[];
  /** Bracket match highlight (just on this line) */
  bracketMatchRange?: { startCol: number; endCol: number } | null;
  /** Ghost text shown after the cursor (inline completion preview) */
  ghostText?: string;
  ghostTextCol?: number;
  /** Folding support */
  isFoldable?: boolean;
  isFolded?: boolean;
  onToggleFold?: (lineIndex: number) => void;
}

const TokenClassMap: Record<number, string> = {
  [TokenKind.Plain]: styles.tok_plain,
  [TokenKind.Keyword]: styles.tok_keyword,
  [TokenKind.String]: styles.tok_string,
  [TokenKind.Number]: styles.tok_number,
  [TokenKind.Comment]: styles.tok_comment,
  [TokenKind.Function]: styles.tok_fn,
  [TokenKind.Type]: styles.tok_type,
  [TokenKind.Variable]: styles.tok_variable,
  [TokenKind.Operator]: styles.tok_operator,
  [TokenKind.Punctuation]: styles.tok_punctuation,
};

const CHAR_WIDTH_PX = 8.4;
const CONTENT_PADDING_LEFT = 16; // px

const EditorLine = React.memo(function EditorLine({
  lineIndex,
  content,
  isActive = false,
  isExecutionLine = false,
  hasBreakpoint = false,
  inlineValue,
  tokens = [],
  onToggleBreakpoint,
  diagnosticSeverity,
  lineDiagnostics = [],
  selectionRange,
  wordHighlightRanges = [],
  bracketMatchRange,
  ghostText,
  ghostTextCol,
  isFoldable = false,
  isFolded = false,
  onToggleFold,
}: EditorLineProps) {
  const spans = useMemo(() => {
    if (!content) {
      return [<span key="empty"> </span>];
    }

    const segments: Array<{
      start: number;
      end: number;
      text: string;
      tokenKind: number;
    }> = [];

    const isValidTokens = Array.isArray(tokens) && tokens.length > 0 && tokens[0] < content.length;

    if (!isValidTokens) {
      segments.push({
        start: 0,
        end: content.length,
        text: content,
        tokenKind: TokenKind.Plain,
      });
    } else {
      if (tokens[0] > 0) {
        segments.push({
          start: 0,
          end: tokens[0],
          text: content.slice(0, tokens[0]),
          tokenKind: TokenKind.Plain,
        });
      }

      for (let i = 0; i < tokens.length; i += 2) {
        const start = tokens[i];
        const rawMetadata = tokens[i + 1];
        const tokenKind = TokenMetadata.getForeground(rawMetadata);
        const nextStart = i + 2 < tokens.length ? tokens[i + 2] : content.length;
        const text = content.slice(start, nextStart);

        if (text) {
          segments.push({ start, end: nextStart, text, tokenKind });
        }
      }
    }

    return segments.map((seg, idx) => {
      let diagClass = "";
      let diagTooltip = "";

      for (const diag of lineDiagnostics) {
        const start = diag.startCol;
        const end = Math.max(diag.endCol, start + 1);

        if (seg.start < end && seg.end > start) {
          const sev = (diag.severity || "").toLowerCase();
          if (sev === "error") {
            diagClass = styles.diagError;
          } else if ((sev === "warning" || sev === "warn") && diagClass !== styles.diagError) {
            diagClass = styles.diagWarning;
          } else if ((sev === "information" || sev === "info") && !diagClass) {
            diagClass = styles.diagInformation;
          } else if (sev === "hint" && !diagClass) {
            diagClass = styles.diagHint;
          }
          diagTooltip = diag.message;
        }
      }

      const tokenClass = TokenClassMap[seg.tokenKind] || styles.tok_plain;

      return (
        <span
          key={idx}
          className={`${tokenClass} ${diagClass}`}
          title={diagTooltip || undefined}
        >
          {seg.text}
        </span>
      );
    });
  }, [content, tokens, lineDiagnostics]);

  const normGutterSev = (diagnosticSeverity || "").toLowerCase();

  return (
    <div
      className={`${styles.line} ${isActive ? styles.lineActive : ""} ${isExecutionLine ? styles.lineExecuting : ""}`}
      data-line-index={lineIndex}
      aria-label={`Line ${lineIndex + 1}`}
    >
      <span
        className={styles.lineNumber}
        aria-hidden="true"
        onClick={(e) => {
          e.stopPropagation();
          onToggleBreakpoint?.(lineIndex);
        }}
        title={hasBreakpoint ? "Remove Breakpoint (Ctrl+F8)" : "Toggle Breakpoint (Ctrl+F8)"}
      >
        {normGutterSev === "error" && (
          <span className={styles.gutterError} title="Error">
            <VscError size={11} />
          </span>
        )}
        {(normGutterSev === "warning" || normGutterSev === "warn") && (
          <span className={styles.gutterWarning} title="Warning">
            <VscWarning size={11} />
          </span>
        )}
        {(normGutterSev === "information" || normGutterSev === "info") && (
          <span className={styles.gutterInfo} title="Information">
            <VscInfo size={11} />
          </span>
        )}
        {normGutterSev === "hint" && (
          <span className={styles.gutterHint} title="Hint">
            <VscCircleFilled size={6} />
          </span>
        )}
        {hasBreakpoint && <span className={styles.gutterBreakpoint} />}
        {isExecutionLine && (
          <span className={styles.gutterExecutionArrow}>
            <VscPlay size={10} />
          </span>
        )}
        <span>{lineIndex + 1}</span>
      </span>

      {/* Fold toggle icon */}
      {isFoldable && (
        <span
          className={styles.foldToggle}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFold?.(lineIndex);
          }}
          title={isFolded ? "Expand" : "Collapse"}
          aria-label={isFolded ? "Expand fold" : "Collapse fold"}
        >
          {isFolded ? <VscChevronRight size={10} /> : <VscChevronDown size={10} />}
        </span>
      )}

      <span className={styles.lineContent}>
        {/* Selection highlight */}
        {selectionRange && selectionRange.startCol < selectionRange.endCol && (
          <span
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `calc(${CONTENT_PADDING_LEFT}px + ${selectionRange.startCol * CHAR_WIDTH_PX}px)`,
              width: `${Math.max(4, (selectionRange.endCol - selectionRange.startCol) * CHAR_WIDTH_PX)}px`,
              backgroundColor: "rgba(38, 79, 120, 0.45)",
              borderRadius: "2px",
              pointerEvents: "none",
              zIndex: 0,
            }}
          />
        )}

        {/* Word occurrence highlights */}
        {wordHighlightRanges.map((range, i) => (
          <span
            key={`wh-${i}`}
            style={{
              position: "absolute",
              top: 1,
              bottom: 1,
              left: `calc(${CONTENT_PADDING_LEFT}px + ${range.startCol * CHAR_WIDTH_PX}px)`,
              width: `${(range.endCol - range.startCol) * CHAR_WIDTH_PX}px`,
              backgroundColor: "rgba(180, 180, 60, 0.18)",
              border: "1px solid rgba(180, 180, 60, 0.35)",
              borderRadius: "2px",
              pointerEvents: "none",
              zIndex: 0,
            }}
          />
        ))}

        {/* Bracket match highlight */}
        {bracketMatchRange && (
          <span
            style={{
              position: "absolute",
              top: 1,
              bottom: 1,
              left: `calc(${CONTENT_PADDING_LEFT}px + ${bracketMatchRange.startCol * CHAR_WIDTH_PX}px)`,
              width: `${(bracketMatchRange.endCol - bracketMatchRange.startCol) * CHAR_WIDTH_PX}px`,
              backgroundColor: "rgba(80, 200, 120, 0.2)",
              border: "1px solid rgba(80, 200, 120, 0.5)",
              borderRadius: "2px",
              pointerEvents: "none",
              zIndex: 1,
            }}
          />
        )}

        {spans}

        {/* Ghost text (inline completion preview) */}
        {ghostText && ghostTextCol !== undefined && (
          <span
            style={{
              position: "absolute",
              left: `calc(${CONTENT_PADDING_LEFT}px + ${ghostTextCol * CHAR_WIDTH_PX}px)`,
              top: 0,
              lineHeight: "21px",
              opacity: 0.4,
              fontStyle: "italic",
              color: "inherit",
              pointerEvents: "none",
              userSelect: "none",
              zIndex: 2,
              whiteSpace: "pre",
            }}
          >
            {ghostText}
          </span>
        )}

        {/* Folded indicator */}
        {isFolded && (
          <span className={styles.foldedPlaceholder} title="Folded lines">
            {" ···"}
          </span>
        )}

        {inlineValue && (
          <span className={styles.inlineDebugValue} title="Evaluated variable values">
            // {inlineValue}
          </span>
        )}
      </span>
    </div>
  );
});

export default EditorLine;