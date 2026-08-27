/**
 * Sidebar.tsx — File explorer panel.
 * Uses a recursive tree structure and React Icons.
 */

import React, { useState, Fragment } from "react";
import { VscChevronRight, VscChevronDown, VscFolder, VscFolderOpened, VscFile } from "react-icons/vsc";
import { SiTypescript, SiCss, SiJson } from "react-icons/si";
import styles from "./Sidebar.module.css";

export interface FileNode {
  name: string;
  isDir: boolean;
  children?: FileNode[];
}

interface SidebarProps {
  tree?: FileNode[];
  activeFile?: string;
  onFileClick?: (name: string) => void;
}

const MOCK_TREE: FileNode[] = [
  {
    name: "src-tauri",
    isDir: true,
    children: [
      { name: "Cargo.toml", isDir: false }
    ]
  },
  {
    name: "src",
    isDir: true,
    children: [
      { name: "main.tsx", isDir: false },
      { name: "App.tsx", isDir: false },
      {
        name: "components",
        isDir: true,
        children: [
          { name: "editor", isDir: true, children: [{ name: "EditorView.tsx", isDir: false }] },
          { name: "sidebar", isDir: true, children: [{ name: "Sidebar.tsx", isDir: false }] }
        ]
      },
      { name: "styles", isDir: true, children: [{ name: "globals.css", isDir: false }] }
    ]
  },
  { name: "package.json", isDir: false },
  { name: "vite.config.ts", isDir: false },
];

function getFileIcon(filename: string) {
  if (filename.endsWith(".tsx") || filename.endsWith(".ts")) return <SiTypescript color="#3178c6" />;
  if (filename.endsWith(".css")) return <SiCss color="#264de4" />;
  if (filename.endsWith(".json")) return <SiJson color="#cb3837" />;
  return <VscFile />;
}

export const Sidebar = React.memo(function Sidebar({
  tree = MOCK_TREE,
  activeFile,
  onFileClick,
}: SidebarProps) {
  // Track expanded directories by their path (for mock, we just use name to keep it simple, 
  // but path is better for real files)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["src", "src/components"]));

  const toggleExpand = (path: string) => {
    const next = new Set(expanded);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setExpanded(next);
  };

  const renderNode = (node: FileNode, path: string, depth: number) => {
    const fullPath = path ? `${path}/${node.name}` : node.name;
    const isExpanded = expanded.has(fullPath);
    const isSelected = activeFile === fullPath;

    return (
      <Fragment key={fullPath}>
        <div
          role="treeitem"
          aria-expanded={node.isDir ? isExpanded : undefined}
          aria-selected={isSelected}
          className={`${styles.treeItem} ${isSelected ? styles.treeItemActive : ""}`}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={() => {
            if (node.isDir) {
              toggleExpand(fullPath);
            } else {
              onFileClick?.(fullPath);
            }
          }}
        >
          {/* Chevron for dirs */}
          <span className={styles.chevronIcon}>
            {node.isDir ? (isExpanded ? <VscChevronDown /> : <VscChevronRight />) : null}
          </span>
          
          {/* File/Folder icon */}
          <span className={styles.typeIcon}>
            {node.isDir ? (
              isExpanded ? <VscFolderOpened color="#dcb67a" /> : <VscFolder color="#dcb67a" />
            ) : (
              getFileIcon(node.name)
            )}
          </span>

          <span className={`${styles.treeName} ${node.isDir ? styles.treeDir : styles.treeFile}`}>
            {node.name}
          </span>
        </div>

        {/* Render children if expanded */}
        {node.isDir && isExpanded && node.children && (
          <div role="group">
            {node.children.map(child => renderNode(child, fullPath, depth + 1))}
          </div>
        )}
      </Fragment>
    );
  };

  return (
    <aside className={styles.sidebar} aria-label="File explorer">
      <nav className={styles.sidebarTree} role="tree">
        {tree.map((node) => renderNode(node, "", 0))}
      </nav>
    </aside>
  );
});

export default Sidebar;
