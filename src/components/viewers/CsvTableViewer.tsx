import { useState, useMemo } from "react";
import {
  VscSearch,
  VscTable,
  VscCode,
} from "react-icons/vsc";
import { EditorView } from "../editor/EditorView";
import styles from "./CsvTableViewer.module.css";

interface CsvTableViewerProps {
  filePath: string;
  lines: string[];
  onLinesChange?: (lines: string[], activeLine: number, activeCol: number) => void;
}

export function CsvTableViewer({ filePath, lines, onLinesChange }: CsvTableViewerProps) {
  const [filterText, setFilterText] = useState("");
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [isRawView, setIsRawView] = useState(false);

  const delimiter = filePath.endsWith(".tsv") ? "\t" : ",";

  const { headers, rows } = useMemo(() => {
    if (lines.length === 0) {
      return { headers: [], rows: [] };
    }

    const parsedHeaders = parseCsvLine(lines[0], delimiter);
    const parsedRows = lines.slice(1).filter((l) => l.trim()).map((l) => parseCsvLine(l, delimiter));

    return { headers: parsedHeaders, rows: parsedRows };
  }, [lines, delimiter]);

  // Filter & Sort
  const processedRows = useMemo(() => {
    let result = [...rows];

    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      result = result.filter((row) => row.some((cell) => cell.toLowerCase().includes(q)));
    }

    if (sortCol !== null) {
      result.sort((a, b) => {
        const valA = a[sortCol] || "";
        const valB = b[sortCol] || "";
        const numA = Number(valA);
        const numB = Number(valB);

        if (!isNaN(numA) && !isNaN(numB)) {
          return sortAsc ? numA - numB : numB - numA;
        }
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
    }

    return result;
  }, [rows, filterText, sortCol, sortAsc]);

  const handleHeaderClick = (index: number) => {
    if (sortCol === index) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(index);
      setSortAsc(true);
    }
  };

  if (isRawView) {
    return (
      <div className={styles.csvContainer}>
        <div className={styles.toolbar}>
          <button
            className={styles.toolbarBtn}
            onClick={() => setIsRawView(false)}
            title="Switch to Table Grid"
          >
            <VscTable />
            <span>Table Grid</span>
          </button>
        </div>
        <EditorView lines={lines} onLinesChange={onLinesChange} />
      </div>
    );
  }

  return (
    <div className={styles.csvContainer}>
      {/* Top Search & Filter Bar */}
      <div className={styles.toolbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <VscSearch color="#888888" />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search data..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
        </div>

        <button
          style={{
            background: "transparent",
            border: "1px solid var(--pm-border-default)",
            borderRadius: 3,
            padding: "2px 8px",
            fontSize: 11,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
          onClick={() => setIsRawView(true)}
          title="Switch to Raw Text Editor"
        >
          <VscCode />
          <span>Raw Text</span>
        </button>

        <span className={styles.statsText}>
          {processedRows.length} of {rows.length} rows • {headers.length} columns
        </span>
      </div>

      {/* Table Grid */}
      <div className={styles.tableWrapper}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th className={styles.rowIndexCol}>#</th>
              {headers.map((h, i) => (
                <th key={i} onClick={() => handleHeaderClick(i)}>
                  {h} {sortCol === i ? (sortAsc ? "▲" : "▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {processedRows.map((row, ri) => (
              <tr key={ri}>
                <td className={styles.rowIndexCol}>{ri + 1}</td>
                {headers.map((_, ci) => (
                  <td key={ci}>{row[ci] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export default CsvTableViewer;
