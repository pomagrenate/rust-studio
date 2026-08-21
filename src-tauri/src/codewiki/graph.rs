use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;
use parking_lot::RwLock;
use crate::codewiki::types::{
    SymbolNode, SymbolEdge, WikiPage, DependencyInfo, BlastRadiusReport, GraphData, CodeWikiStats
};

#[derive(Debug, Default)]
pub struct CodeGraph {
    nodes: HashMap<String, SymbolNode>,
    outgoing: HashMap<String, Vec<SymbolEdge>>,
    incoming: HashMap<String, Vec<SymbolEdge>>,
}

impl CodeGraph {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn clear(&mut self) {
        self.nodes.clear();
        self.outgoing.clear();
        self.incoming.clear();
    }

    pub fn add_node(&mut self, node: SymbolNode) {
        self.nodes.insert(node.id.clone(), node);
    }

    pub fn add_edge(&mut self, edge: SymbolEdge) {
        self.outgoing
            .entry(edge.source_id.clone())
            .or_default()
            .push(edge.clone());

        self.incoming
            .entry(edge.target_id.clone())
            .or_default()
            .push(edge);
    }

    pub fn resolve_edges(&mut self) {
        let mut name_to_id: HashMap<String, String> = HashMap::new();
        for (id, node) in &self.nodes {
            name_to_id.insert(node.name.clone(), id.clone());
        }

        let old_outgoing = std::mem::take(&mut self.outgoing);
        self.incoming.clear();

        for (_src_id, edges) in old_outgoing {
            for mut edge in edges {
                if edge.target_id.starts_with("target_fn::") || edge.target_id.starts_with("import::") {
                    let raw_name = edge.target_id.split("::").last().unwrap_or("");
                    if let Some(real_id) = name_to_id.get(raw_name) {
                        edge.target_id = real_id.clone();
                    }
                }

                self.outgoing.entry(edge.source_id.clone()).or_default().push(edge.clone());
                self.incoming.entry(edge.target_id.clone()).or_default().push(edge);
            }
        }
    }

    pub fn get_node(&self, id: &str) -> Option<&SymbolNode> {
        self.nodes.get(id)
    }

    pub fn search_symbols(&self, query: &str) -> Vec<SymbolNode> {
        let q = query.to_lowercase();
        self.nodes
            .values()
            .filter(|n| n.name.to_lowercase().contains(&q) || n.signature.to_lowercase().contains(&q))
            .cloned()
            .collect()
    }

    pub fn get_graph_data(&self) -> GraphData {
        let nodes = self.nodes.values().cloned().collect();
        let mut edges = Vec::new();
        for edge_list in self.outgoing.values() {
            edges.extend(edge_list.clone());
        }
        GraphData { nodes, edges }
    }

    pub fn compute_blast_radius(&self, root_id: &str) -> BlastRadiusReport {
        let mut direct_dependents = Vec::new();
        let mut transitive_dependents = Vec::new();
        let mut affected_files = HashSet::new();

        let mut visited = HashSet::new();
        let mut queue = VecDeque::new();

        visited.insert(root_id.to_string());

        // Direct dependents (distance == 1)
        if let Some(incoming_edges) = self.incoming.get(root_id) {
            for edge in incoming_edges {
                if let Some(dep_node) = self.nodes.get(&edge.source_id) {
                    if visited.insert(edge.source_id.clone()) {
                        direct_dependents.push(dep_node.clone());
                        affected_files.insert(dep_node.file_path.clone());
                        queue.push_back(edge.source_id.clone());
                    }
                }
            }
        }

        // Transitive dependents (distance >= 2)
        while let Some(current_id) = queue.pop_front() {
            if let Some(incoming_edges) = self.incoming.get(&current_id) {
                for edge in incoming_edges {
                    if let Some(dep_node) = self.nodes.get(&edge.source_id) {
                        if visited.insert(edge.source_id.clone()) {
                            transitive_dependents.push(dep_node.clone());
                            affected_files.insert(dep_node.file_path.clone());
                            queue.push_back(edge.source_id.clone());
                        }
                    }
                }
            }
        }

        let total_impact_score = direct_dependents.len() * 2 + transitive_dependents.len();

        BlastRadiusReport {
            direct_dependents,
            transitive_dependents,
            affected_files: affected_files.into_iter().collect(),
            total_impact_score,
        }
    }

    pub fn get_wiki_page(&self, symbol_id: &str) -> Option<WikiPage> {
        let symbol = self.nodes.get(symbol_id)?.clone();

        // Dependencies (outgoing edges)
        let mut dependencies = Vec::new();
        if let Some(outgoing_edges) = self.outgoing.get(symbol_id) {
            for edge in outgoing_edges {
                let target_symbol = self.nodes.get(&edge.target_id).cloned().unwrap_or_else(|| {
                    SymbolNode {
                        id: edge.target_id.clone(),
                        name: edge.target_id.split("::").last().unwrap_or(&edge.target_id).to_string(),
                        kind: crate::codewiki::types::SymbolKind::Function,
                        file_path: symbol.file_path.clone(),
                        start_line: 0,
                        start_column: 0,
                        end_line: 0,
                        end_column: 0,
                        signature: edge.target_id.clone(),
                        docstring: None,
                        parent_id: None,
                    }
                });
                dependencies.push(DependencyInfo {
                    symbol: target_symbol,
                    edge_kind: edge.kind.clone(),
                });
            }
        }

        // Dependents (incoming edges)
        let mut dependents = Vec::new();
        if let Some(incoming_edges) = self.incoming.get(symbol_id) {
            for edge in incoming_edges {
                if let Some(source_symbol) = self.nodes.get(&edge.source_id) {
                    dependents.push(DependencyInfo {
                        symbol: source_symbol.clone(),
                        edge_kind: edge.kind.clone(),
                    });
                }
            }
        }

        // Child symbols (members)
        let child_symbols = self.nodes
            .values()
            .filter(|n| n.parent_id.as_deref() == Some(symbol_id))
            .cloned()
            .collect();

        // Breadcrumbs (Module/File path hierarchy)
        let mut breadcrumbs = vec![symbol.file_path.clone()];
        if let Some(ref pid) = symbol.parent_id {
            if let Some(parent) = self.nodes.get(pid) {
                breadcrumbs.push(parent.name.clone());
            }
        }
        breadcrumbs.push(symbol.name.clone());

        let blast_radius = self.compute_blast_radius(symbol_id);

        Some(WikiPage {
            symbol: symbol.clone(),
            breadcrumbs,
            signature: symbol.signature.clone(),
            docstring: symbol.docstring.clone(),
            dependencies,
            dependents,
            blast_radius,
            child_symbols,
        })
    }

    pub fn stats(&self, duration_ms: u128) -> CodeWikiStats {
        let total_symbols = self.nodes.len();
        let total_files = self.nodes.values().filter(|n| n.kind == crate::codewiki::types::SymbolKind::File).count();
        let total_edges = self.outgoing.values().map(|v| v.len()).sum();

        CodeWikiStats {
            total_symbols,
            total_files,
            total_edges,
            index_duration_ms: duration_ms,
        }
    }
}

pub type CodeGraphState = Arc<RwLock<CodeGraph>>;
