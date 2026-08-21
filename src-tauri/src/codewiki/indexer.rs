use std::fs;
use std::path::Path;
use std::time::Instant;
use walkdir::WalkDir;

use crate::codewiki::graph::CodeGraph;
use crate::codewiki::parser::LanguageParser;
use crate::codewiki::types::CodeWikiStats;

pub struct CodeWikiIndexer;

impl CodeWikiIndexer {
    pub fn index_workspace(graph: &mut CodeGraph, workspace_path: &str) -> Result<CodeWikiStats, String> {
        let start_time = Instant::now();
        graph.clear();

        let root = Path::new(workspace_path);
        if !root.exists() {
            return Err("Workspace path does not exist".to_string());
        }

        for entry in WalkDir::new(root)
            .into_iter()
            .filter_entry(|e| {
                let name = e.file_name().to_string_lossy();
                name != "node_modules" && name != "target" && name != ".git" && name != "dist"
            })
            .filter_map(|e| e.ok())
        {
            if entry.file_type().is_file() {
                let path = entry.path();
                let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");

                if matches!(ext, "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "go" | "cpp" | "h") {
                    if let Ok(code) = fs::read_to_string(path) {
                        let path_str = path.to_string_lossy().to_string();
                        let (symbols, edges) = LanguageParser::parse_file(&path_str, &code);

                        for symbol in symbols {
                            graph.add_node(symbol);
                        }
                        for edge in edges {
                            graph.add_edge(edge);
                        }
                    }
                }
            }
        }

        graph.resolve_edges();

        let elapsed = start_time.elapsed().as_millis();
        Ok(graph.stats(elapsed))
    }
}
