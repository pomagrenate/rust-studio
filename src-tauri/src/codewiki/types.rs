use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum SymbolKind {
    File,
    Module,
    Struct,
    Class,
    Function,
    Method,
    Trait,
    Interface,
    Enum,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum EdgeKind {
    Imports,
    Calls,
    Implements,
    Defines,
    InheritsFrom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SymbolNode {
    pub id: String,                // Unique identifier, e.g. "struct::src/codewiki/graph.rs::CodeGraph"
    pub name: String,              // e.g. "CodeGraph"
    pub kind: SymbolKind,
    pub file_path: String,
    pub start_line: usize,
    pub start_column: usize,
    pub end_line: usize,
    pub end_column: usize,
    pub signature: String,         // Code declaration
    pub docstring: Option<String>,   // Doc comments /// or /** */
    pub parent_id: Option<String>, // Parent container symbol ID (File or Struct)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SymbolEdge {
    pub source_id: String,
    pub target_id: String,
    pub kind: EdgeKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyInfo {
    pub symbol: SymbolNode,
    pub edge_kind: EdgeKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlastRadiusReport {
    pub direct_dependents: Vec<SymbolNode>,
    pub transitive_dependents: Vec<SymbolNode>,
    pub affected_files: Vec<String>,
    pub total_impact_score: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WikiPage {
    pub symbol: SymbolNode,
    pub breadcrumbs: Vec<String>,
    pub signature: String,
    pub docstring: Option<String>,
    pub dependencies: Vec<DependencyInfo>, // Outgoing calls/imports/implements
    pub dependents: Vec<DependencyInfo>,   // Incoming callers/implementors
    pub blast_radius: BlastRadiusReport,   // Static impact analysis
    pub child_symbols: Vec<SymbolNode>,    // Methods, fields, or child modules
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphData {
    pub nodes: Vec<SymbolNode>,
    pub edges: Vec<SymbolEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeWikiStats {
    pub total_symbols: usize,
    pub total_files: usize,
    pub total_edges: usize,
    pub index_duration_ms: u128,
}
