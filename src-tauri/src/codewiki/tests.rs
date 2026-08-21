#[cfg(test)]
mod tests {
    use crate::codewiki::graph::CodeGraph;
    use crate::codewiki::parser::LanguageParser;
    use crate::codewiki::types::{SymbolKind, EdgeKind, SymbolNode, SymbolEdge};

    #[test]
    fn test_rust_ast_symbol_extraction() {
        let rust_code = r#"
/// High-performance RopeBuffer structure.
pub struct RopeBuffer {
    len: usize,
}

impl RopeBuffer {
    /// Inserts text into the buffer.
    pub fn insert(&mut self, text: &str) {
        self.len += text.len();
    }
}
"#;
        let (symbols, edges) = LanguageParser::parse_rust_file("src/buffer/rope_buffer.rs", rust_code);

        assert!(symbols.iter().any(|s| s.name == "RopeBuffer" && s.kind == SymbolKind::Struct));
        assert!(symbols.iter().any(|s| s.name == "insert" && s.kind == SymbolKind::Function));

        let struct_symbol = symbols.iter().find(|s| s.name == "RopeBuffer").unwrap();
        assert_eq!(struct_symbol.docstring.as_deref(), Some("High-performance RopeBuffer structure."));

        assert!(!edges.is_empty());
    }

    #[test]
    fn test_code_graph_and_blast_radius() {
        let mut graph = CodeGraph::new();

        let node_a = SymbolNode {
            id: "fn::a".to_string(),
            name: "fn_a".to_string(),
            kind: SymbolKind::Function,
            file_path: "file_a.rs".to_string(),
            start_line: 1,
            start_column: 1,
            end_line: 5,
            end_column: 1,
            signature: "fn fn_a()".to_string(),
            docstring: None,
            parent_id: None,
        };

        let node_b = SymbolNode {
            id: "fn::b".to_string(),
            name: "fn_b".to_string(),
            kind: SymbolKind::Function,
            file_path: "file_b.rs".to_string(),
            start_line: 1,
            start_column: 1,
            end_line: 5,
            end_column: 1,
            signature: "fn fn_b()".to_string(),
            docstring: None,
            parent_id: None,
        };

        let node_c = SymbolNode {
            id: "fn::c".to_string(),
            name: "fn_c".to_string(),
            kind: SymbolKind::Function,
            file_path: "file_c.rs".to_string(),
            start_line: 1,
            start_column: 1,
            end_line: 5,
            end_column: 1,
            signature: "fn fn_c()".to_string(),
            docstring: None,
            parent_id: None,
        };

        graph.add_node(node_a);
        graph.add_node(node_b);
        graph.add_node(node_c);

        // B calls A
        graph.add_edge(SymbolEdge {
            source_id: "fn::b".to_string(),
            target_id: "fn::a".to_string(),
            kind: EdgeKind::Calls,
        });

        // C calls B
        graph.add_edge(SymbolEdge {
            source_id: "fn::c".to_string(),
            target_id: "fn::b".to_string(),
            kind: EdgeKind::Calls,
        });

        let blast = graph.compute_blast_radius("fn::a");
        assert_eq!(blast.direct_dependents.len(), 1);
        assert_eq!(blast.direct_dependents[0].name, "fn_b");

        assert_eq!(blast.transitive_dependents.len(), 1);
        assert_eq!(blast.transitive_dependents[0].name, "fn_c");

        assert_eq!(blast.total_impact_score, 3); // 1 direct * 2 + 1 transitive = 3
    }
}
