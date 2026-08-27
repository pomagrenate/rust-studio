/**
 * quickFixHelpers.ts — Helper functions for applying quick fixes and calculating suggestions
 */

import { invoke } from "@tauri-apps/api/core";
import { lspCodeAction, pathToUri, uriToPath, CodeAction, WorkspaceEdit } from "../../../ipc/lsp";

export function resolveFilePath(path: string, workspaceRoot?: string): string {
  if (path.includes(":") || path.startsWith("/")) {
    return path;
  }
  if (!workspaceRoot) return path;
  const cleanRoot = workspaceRoot.replace(/[/\\]$/, "");
  const cleanRel = path.replace(/^[/\\]/, "");
  return `${cleanRoot}/${cleanRel}`;
}

export async function applySingleFindingFix(
  path: string,
  startLine: number,
  _checkId: string,
  fixType: string,
  findingKey: string,
  workspaceRoot?: string,
  onReloadFile?: (filePath: string) => void,
  onOpenFile?: (filePath: string) => void,
  setFixStatusMap?: React.Dispatch<React.SetStateAction<Record<string, string>>>
) {
  try {
    const fullPath = resolveFilePath(path, workspaceRoot);
    const content: string = await invoke("read_file", { path: fullPath });
    const lines = content.split("\n");
    const targetIdx = startLine - 1;

    if (targetIdx >= 0 && targetIdx < lines.length) {
      const lineText = lines[targetIdx];
      if (fixType === "unwrap-question") {
        lines[targetIdx] = lineText.replace(/\.unwrap\(\)/g, "?");
      } else if (fixType === "unwrap-expect") {
        lines[targetIdx] = lineText.replace(/\.unwrap\(\)/g, '.expect("valid invariant")');
      } else if (fixType === "unwrap-default") {
        lines[targetIdx] = lineText.replace(/\.unwrap\(\)/g, ".unwrap_or_default()");
      } else if (fixType === "todo-done") {
        lines[targetIdx] = lineText.replace(/TODO/g, "DONE");
      } else if (fixType === "todo-annotate") {
        lines[targetIdx] = lineText.replace(/TODO/g, "TODO(audit)");
      } else if (fixType === "safety-comment") {
        const indent = lineText.match(/^\s*/)?.[0] || "";
        lines.splice(targetIdx, 0, `${indent}// SAFETY: Audited memory invariants`);
      } else if (fixType === "secret-env") {
        lines[targetIdx] = lineText.replace(/"[^"]*secret[^"]*"/gi, 'std::env::var("SECRET_KEY").unwrap_or_default()');
      } else if (fixType === "secret-ignore") {
        lines[targetIdx] = `${lineText} // pomai:ignore-secret`;
      }

      const updatedContent = lines.join("\n");
      await invoke("save_file", { path: fullPath, content: updatedContent });

      onReloadFile?.(fullPath);
      onOpenFile?.(fullPath);

      setFixStatusMap?.((prev) => ({ ...prev, [findingKey]: "Applied fix to file successfully" }));
    }
  } catch (err: any) {
    setFixStatusMap?.((prev) => ({ ...prev, [findingKey]: `Error: ${err.message || String(err)}` }));
  }
}

export async function applyLspWorkspaceEdit(
  edit: WorkspaceEdit,
  rowKey: string,
  workspaceRoot?: string,
  onReloadFile?: (filePath: string) => void,
  onOpenFile?: (filePath: string) => void,
  setFixStatusMap?: React.Dispatch<React.SetStateAction<Record<string, string>>>
) {
  try {
    if (!edit.document_changes || edit.document_changes.length === 0) {
      setFixStatusMap?.((prev) => ({ ...prev, [rowKey]: "No changes provided by server." }));
      return;
    }

    for (const docChange of edit.document_changes) {
      const fullPath = resolveFilePath(uriToPath(docChange.uri), workspaceRoot);
      let content: string = await invoke("read_file", { path: fullPath });

      // Apply text edits in reverse order so range offsets stay valid
      const sortedEdits = [...docChange.edits].sort((a, b) => {
        if (a.range.start.line !== b.range.start.line) {
          return b.range.start.line - a.range.start.line;
        }
        return b.range.start.character - a.range.start.character;
      });

      const lines = content.split("\n");
      for (const editItem of sortedEdits) {
        const startLine = editItem.range.start.line;
        const endLine = editItem.range.end.line;
        const startCol = editItem.range.start.character;
        const endCol = editItem.range.end.character;

        if (startLine === endLine && startLine < lines.length) {
          const orig = lines[startLine];
          lines[startLine] = orig.slice(0, startCol) + editItem.new_text + orig.slice(endCol);
        } else if (startLine < lines.length) {
          const firstLine = lines[startLine].slice(0, startCol);
          const lastLine = lines[endLine] ? lines[endLine].slice(endCol) : "";
          const replacementLines = editItem.new_text.split("\n");
          replacementLines[0] = firstLine + replacementLines[0];
          replacementLines[replacementLines.length - 1] += lastLine;

          lines.splice(startLine, endLine - startLine + 1, ...replacementLines);
        }
      }

      const updatedContent = lines.join("\n");
      await invoke("save_file", { path: fullPath, content: updatedContent });

      onReloadFile?.(fullPath);
      onOpenFile?.(fullPath);
    }

    setFixStatusMap?.((prev) => ({ ...prev, [rowKey]: "Applied rust-analyzer Code Action successfully" }));
  } catch (err: any) {
    setFixStatusMap?.((prev) => ({ ...prev, [rowKey]: `Error: ${err.message || String(err)}` }));
  }
}

export async function fetchLspCodeActions(
  filePath: string,
  line: number,
  column: number,
  workspaceRoot?: string
): Promise<CodeAction[]> {
  try {
    const fullPath = resolveFilePath(filePath, workspaceRoot);
    const uri = pathToUri(fullPath);
    return await lspCodeAction(uri, line, column);
  } catch (e) {
    console.warn("Failed to fetch LSP code actions:", e);
    return [];
  }
}

export async function applyProjectErrorFix(
  filePath: string,
  line1Based: number,
  fixType: string,
  diagMessage: string,
  rowKey: string,
  workspaceRoot?: string,
  onReloadFile?: (filePath: string) => void,
  onOpenFile?: (filePath: string) => void,
  setFixStatusMap?: React.Dispatch<React.SetStateAction<Record<string, string>>>
) {
  try {
    const fullPath = resolveFilePath(filePath, workspaceRoot);
    const content: string = await invoke("read_file", { path: fullPath });
    const lines = content.split("\n");
    const targetIdx = line1Based - 1;

    if (targetIdx >= 0 && targetIdx < lines.length) {
      const lineText = lines[targetIdx];
      if (fixType === "prefix-underscore") {
        const varMatch = diagMessage.match(/`([^`]+)`/);
        const varName = varMatch ? varMatch[1] : null;
        if (varName && !varName.startsWith("_")) {
          const regex = new RegExp(`\\b${varName}\\b`, "g");
          lines[targetIdx] = lineText.replace(regex, `_${varName}`);
        } else {
          lines[targetIdx] = `_${lineText.trimStart()}`;
        }
      } else if (fixType === "allow-unused") {
        const indent = lineText.match(/^\s*/)?.[0] || "";
        lines.splice(targetIdx, 0, `${indent}#[allow(unused)]`);
      } else if (fixType === "allow-dead-code") {
        const indent = lineText.match(/^\s*/)?.[0] || "";
        lines.splice(targetIdx, 0, `${indent}#[allow(dead_code)]`);
      } else if (fixType === "to-string") {
        lines[targetIdx] = `${lineText}.to_string()`;
      } else if (fixType === "as-str") {
        lines[targetIdx] = `${lineText}.as_str()`;
      } else if (fixType === "clone-value") {
        lines[targetIdx] = `${lineText}.clone()`;
      } else if (fixType === "fill-match-arms") {
        const indent = lineText.match(/^\s*/)?.[0] || "";
        lines.splice(targetIdx + 1, 0, `${indent}    _ => todo!(),`);
      } else if (fixType === "implement-trait") {
        const indent = lineText.match(/^\s*/)?.[0] || "";
        lines.splice(targetIdx + 1, 0, `${indent}    // TODO: Implement required trait members`);
      } else if (fixType === "derive-trait") {
        const indent = lineText.match(/^\s*/)?.[0] || "";
        lines.splice(targetIdx, 0, `${indent}#[derive(Debug, Clone)]`);
      } else if (fixType === "remove-line") {
        lines.splice(targetIdx, 1);
      } else if (fixType.startsWith("replacement:")) {
        const replacement = fixType.replace("replacement:", "");
        lines[targetIdx] = replacement;
      }

      const updatedContent = lines.join("\n");
      await invoke("save_file", { path: fullPath, content: updatedContent });

      onReloadFile?.(fullPath);
      onOpenFile?.(fullPath);

      setFixStatusMap?.((prev) => ({ ...prev, [rowKey]: "Applied fix to file successfully" }));
    }
  } catch (err: any) {
    setFixStatusMap?.((prev) => ({ ...prev, [rowKey]: `Error: ${err.message || String(err)}` }));
  }
}

export function getProjectErrorQuickFixes(diag: any) {
  const code = (diag.code || "").toLowerCase();
  const msg = (diag.message || "").toLowerCase();
  const fixes: Array<{ title: string; type: string; lspAction?: CodeAction }> = [];

  if (diag.suggestions && Array.isArray(diag.suggestions) && diag.suggestions.length > 0) {
    diag.suggestions.forEach((s: any) => {
      fixes.push({
        title: s.text || `Replace with: ${s.replacement}`,
        type: `replacement:${s.replacement}`,
      });
    });
  }

  // 1. Unused / Dead code
  if (code.includes("unused") || msg.includes("unused")) {
    const varMatch = diag.message?.match(/`([^`]+)`/);
    const varName = varMatch ? varMatch[1] : "";
    if (varName && !varName.startsWith("_")) {
      fixes.push({
        title: `Prefix variable \`${varName}\` with underscore (\`_${varName}\`)`,
        type: "prefix-underscore",
      });
    }
    fixes.push({
      title: "Prepend #[allow(unused)] attribute",
      type: "allow-unused",
    });
    fixes.push({
      title: "Remove unused line",
      type: "remove-line",
    });
  } else if (code.includes("dead_code") || msg.includes("dead_code") || msg.includes("is never used")) {
    fixes.push({
      title: "Prepend #[allow(dead_code)] attribute",
      type: "allow-dead-code",
    });
  }
  // 2. Missing Match Arms (E0004 / non-exhaustive patterns)
  else if (code.includes("e0004") || msg.includes("non-exhaustive patterns") || msg.includes("match arms")) {
    fixes.push({
      title: "Fill missing match arms (_ => todo!())",
      type: "fill-match-arms",
    });
  }
  // 3. Missing Trait Implementations (E0046)
  else if (code.includes("e0046") || msg.includes("not all trait items implemented")) {
    fixes.push({
      title: "Implement missing trait members",
      type: "implement-trait",
    });
  }
  // 4. Mismatched Types (E0308)
  else if (msg.includes("mismatched types") || code.includes("e0308")) {
    if (msg.includes("expected `string`")) {
      fixes.push({
        title: "Convert expression to String using .to_string()",
        type: "to-string",
      });
    }
    if (msg.includes("expected `&str`")) {
      fixes.push({
        title: "Convert String to &str using .as_str()",
        type: "as-str",
      });
    }
    fixes.push({
      title: "Add #[allow(unused)] attribute to suppress diagnostic",
      type: "allow-unused",
    });
  }
  // 5. Ownership / Move / Borrow (E0382, E0502)
  else if (code.includes("e0382") || code.includes("e0502") || msg.includes("use of moved value") || msg.includes("borrowed")) {
    fixes.push({
      title: "Clone value (.clone()) to prevent move",
      type: "clone-value",
    });
  }
  // 6. Trait Not Satisfied (E0277)
  else if (code.includes("e0277") || msg.includes("the trait bound") || msg.includes("is not satisfied")) {
    fixes.push({
      title: "Add #[derive(Debug, Clone)] attribute to struct",
      type: "derive-trait",
    });
  }

  if (fixes.length === 0) {
    fixes.push({
      title: "Add #[allow(unused)] attribute to suppress diagnostic",
      type: "allow-unused",
    });
  }

  return fixes;
}
