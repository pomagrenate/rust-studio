import { useState, useMemo } from "react";
import {
  VscCode,
  VscPreview,
  VscSplitHorizontal,
  VscInfo,
  VscLightbulb,
  VscWarning,
  VscError
} from "react-icons/vsc";
import { EditorView } from "../editor/EditorView";
import styles from "./MarkdownPreview.module.css";

interface MarkdownPreviewProps {
  filePath: string;
  lines: string[];
  onLinesChange?: (lines: string[], activeLine: number, activeCol: number) => void;
}

type ViewMode = "code" | "preview" | "split";

export function MarkdownPreview({ filePath: _filePath, lines, onLinesChange }: MarkdownPreviewProps) {
  const [mode, setMode] = useState<ViewMode>("split");

  const renderedContent = useMemo(() => {
    const raw = lines.join("\n");
    return parseMarkdown(raw);
  }, [lines]);

  return (
    <div className={styles.markdownContainer}>
      {/* Top Toggle Bar */}
      <div className={styles.toolbar}>
        <div className={styles.modeToggle}>
          <button
            className={`${styles.modeBtn} ${mode === "code" ? styles.modeBtnActive : ""}`}
            onClick={() => setMode("code")}
            title="Markdown Source Code"
          >
            <VscCode />
            <span>Code</span>
          </button>
          <button
            className={`${styles.modeBtn} ${mode === "preview" ? styles.modeBtnActive : ""}`}
            onClick={() => setMode("preview")}
            title="Rendered Markdown Preview"
          >
            <VscPreview />
            <span>Preview</span>
          </button>
          <button
            className={`${styles.modeBtn} ${mode === "split" ? styles.modeBtnActive : ""}`}
            onClick={() => setMode("split")}
            title="Side-by-Side Split View"
          >
            <VscSplitHorizontal />
            <span>Split</span>
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <div className={styles.viewArea}>
        {(mode === "code" || mode === "split") && (
          <div className={styles.editorPane}>
            <EditorView
              lines={lines}
              onLinesChange={onLinesChange}
              aria-label="Markdown editor"
            />
          </div>
        )}

        {(mode === "preview" || mode === "split") && (
          <div className={styles.previewPane}>
            {renderedContent}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Markdown Parser with Alerts, Mermaid, Math, and Tables ──

function parseMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    // Fenced Code Block (e.g. ```rust or ```mermaid)
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      index++;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index++;
      }
      index++; // skip closing ```

      const codeStr = codeLines.join("\n");

      if (lang === "mermaid") {
        elements.push(
          <div key={`mermaid-${index}`} className={styles.mermaidBox} title="Mermaid Diagram">
            <div style={{ fontWeight: 600, color: "#8250df", marginBottom: 6 }}>📊 Diagram</div>
            <pre style={{ margin: 0, textAlign: "left" }}>{codeStr}</pre>
          </div>
        );
      } else {
        elements.push(
          <pre key={`code-${index}`} className={styles.codeBlock}>
            <code>{codeStr}</code>
          </pre>
        );
      }
      continue;
    }

    // Display Math ($$...$$)
    if (line.trim().startsWith("$$")) {
      const mathLines: string[] = [];
      if (line.trim().endsWith("$$") && line.trim().length > 2) {
        mathLines.push(line.trim().slice(2, -2));
      } else {
        index++;
        while (index < lines.length && !lines[index].trim().startsWith("$$")) {
          mathLines.push(lines[index]);
          index++;
        }
      }
      index++;
      elements.push(
        <div key={`math-${index}`} className={styles.mathDisplay}>
          {mathLines.join("\n")}
        </div>
      );
      continue;
    }

    // GitHub Alerts (> [!NOTE], > [!TIP], > [!IMPORTANT], > [!WARNING], > [!CAUTION])
    if (line.startsWith("> [!")) {
      const match = line.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
      if (match) {
        const alertType = match[1].toUpperCase();
        const alertLines: string[] = [];
        index++;
        while (index < lines.length && lines[index].startsWith(">")) {
          alertLines.push(lines[index].replace(/^>\s?/, ""));
          index++;
        }

        const icon = alertType === "NOTE" ? <VscInfo /> :
                     alertType === "TIP" ? <VscLightbulb /> :
                     alertType === "IMPORTANT" ? <VscInfo /> :
                     alertType === "WARNING" ? <VscWarning /> : <VscError />;

        const alertStyle = alertType === "NOTE" ? styles.alertNote :
                           alertType === "TIP" ? styles.alertTip :
                           alertType === "IMPORTANT" ? styles.alertImportant :
                           alertType === "WARNING" ? styles.alertWarning : styles.alertCaution;

        elements.push(
          <div key={`alert-${index}`} className={`${styles.alertBox} ${alertStyle}`}>
            <div className={styles.alertTitle}>
              {icon} {alertType}
            </div>
            <div>{alertLines.join(" ")}</div>
          </div>
        );
        continue;
      }
    }

    // Markdown Table (| col1 | col2 |)
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      const tableLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith("|") && lines[index].trim().endsWith("|")) {
        tableLines.push(lines[index]);
        index++;
      }

      if (tableLines.length >= 2) {
        const headerCols = tableLines[0].split("|").slice(1, -1).map((s) => s.trim());
        const bodyRows = tableLines.slice(2).map((row) =>
          row.split("|").slice(1, -1).map((s) => s.trim())
        );

        elements.push(
          <div key={`table-${index}`} className={styles.tableWrapper}>
            <table className={styles.markdownTable}>
              <thead>
                <tr>
                  {headerCols.map((c, ci) => (
                    <th key={ci}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((cell, ci) => (
                      <td key={ci}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // Headings
    if (line.startsWith("# ")) {
      elements.push(<h1 key={`h1-${index}`}>{line.slice(2)}</h1>);
      index++;
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(<h2 key={`h2-${index}`}>{line.slice(3)}</h2>);
      index++;
      continue;
    }
    if (line.startsWith("### ")) {
      elements.push(<h3 key={`h3-${index}`}>{line.slice(4)}</h3>);
      index++;
      continue;
    }

    // Horizontal Rule
    if (line.trim() === "---" || line.trim() === "***" || line.trim() === "___") {
      elements.push(<hr key={`hr-${index}`} />);
      index++;
      continue;
    }

    // Task list / Bullet list
    if (line.trim().startsWith("- [x] ") || line.trim().startsWith("- [ ] ")) {
      const isChecked = line.trim().startsWith("- [x] ");
      const text = line.trim().slice(6);
      elements.push(
        <div key={`task-${index}`} style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0" }}>
          <input type="checkbox" checked={isChecked} readOnly />
          <span>{text}</span>
        </div>
      );
      index++;
      continue;
    }

    if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      elements.push(
        <li key={`li-${index}`} style={{ marginLeft: 20 }}>
          {line.trim().slice(2)}
        </li>
      );
      index++;
      continue;
    }

    // Regular paragraph
    if (line.trim()) {
      elements.push(<p key={`p-${index}`}>{line}</p>);
    }

    index++;
  }

  return elements;
}

export default MarkdownPreview;
