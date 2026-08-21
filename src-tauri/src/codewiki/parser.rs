use tree_sitter::{Parser, Node};
use tree_sitter_rust;
use crate::codewiki::types::{SymbolNode, SymbolEdge, SymbolKind, EdgeKind};

pub struct LanguageParser;

impl LanguageParser {
    pub fn parse_file(file_path: &str, code: &str) -> (Vec<SymbolNode>, Vec<SymbolEdge>) {
        if file_path.ends_with(".rs") {
            Self::parse_rust_file(file_path, code)
        } else if file_path.ends_with(".ts") || file_path.ends_with(".tsx") || file_path.ends_with(".js") || file_path.ends_with(".jsx") {
            Self::parse_ts_file(file_path, code)
        } else {
            Self::parse_fallback_file(file_path, code)
        }
    }

    pub fn parse_rust_file(file_path: &str, code: &str) -> (Vec<SymbolNode>, Vec<SymbolEdge>) {
        let mut parser = Parser::new();
        if parser.set_language(&tree_sitter_rust::LANGUAGE.into()).is_err() {
            return Self::parse_fallback_file(file_path, code);
        }

        let tree = match parser.parse(code, None) {
            Some(t) => t,
            None => return Self::parse_fallback_file(file_path, code),
        };

        let mut symbols = Vec::new();
        let mut edges = Vec::new();
        let root_node = tree.root_node();

        let file_symbol_id = format!("file::{}", file_path);
        let file_name = file_path.split(|c| c == '/' || c == '\\').last().unwrap_or(file_path).to_string();

        symbols.push(SymbolNode {
            id: file_symbol_id.clone(),
            name: file_name,
            kind: SymbolKind::File,
            file_path: file_path.to_string(),
            start_line: 0,
            start_column: 0,
            end_line: code.lines().count(),
            end_column: 0,
            signature: format!("file {}", file_path),
            docstring: None,
            parent_id: None,
        });

        Self::traverse_rust_node(root_node, code, file_path, &file_symbol_id, &mut symbols, &mut edges);

        (symbols, edges)
    }

    fn traverse_rust_node(
        node: Node,
        code: &str,
        file_path: &str,
        parent_id: &str,
        symbols: &mut Vec<SymbolNode>,
        edges: &mut Vec<SymbolEdge>,
    ) {
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            match child.kind() {
                "struct_item" => {
                    if let Some(name_node) = child.child_by_field_name("name") {
                        let name = Self::get_node_text(name_node, code);
                        let symbol_id = format!("struct::{}::{}", file_path, name);
                        let doc = Self::extract_rust_docstring(child, code);
                        let signature = Self::get_first_line(child, code);

                        symbols.push(SymbolNode {
                            id: symbol_id.clone(),
                            name: name.to_string(),
                            kind: SymbolKind::Struct,
                            file_path: file_path.to_string(),
                            start_line: child.start_position().row + 1,
                            start_column: child.start_position().column + 1,
                            end_line: child.end_position().row + 1,
                            end_column: child.end_position().column + 1,
                            signature,
                            docstring: doc,
                            parent_id: Some(parent_id.to_string()),
                        });

                        edges.push(SymbolEdge {
                            source_id: parent_id.to_string(),
                            target_id: symbol_id,
                            kind: EdgeKind::Defines,
                        });
                    }
                }
                "enum_item" => {
                    if let Some(name_node) = child.child_by_field_name("name") {
                        let name = Self::get_node_text(name_node, code);
                        let symbol_id = format!("enum::{}::{}", file_path, name);
                        let doc = Self::extract_rust_docstring(child, code);
                        let signature = Self::get_first_line(child, code);

                        symbols.push(SymbolNode {
                            id: symbol_id.clone(),
                            name: name.to_string(),
                            kind: SymbolKind::Enum,
                            file_path: file_path.to_string(),
                            start_line: child.start_position().row + 1,
                            start_column: child.start_position().column + 1,
                            end_line: child.end_position().row + 1,
                            end_column: child.end_position().column + 1,
                            signature,
                            docstring: doc,
                            parent_id: Some(parent_id.to_string()),
                        });

                        edges.push(SymbolEdge {
                            source_id: parent_id.to_string(),
                            target_id: symbol_id,
                            kind: EdgeKind::Defines,
                        });
                    }
                }
                "trait_item" => {
                    if let Some(name_node) = child.child_by_field_name("name") {
                        let name = Self::get_node_text(name_node, code);
                        let symbol_id = format!("trait::{}::{}", file_path, name);
                        let doc = Self::extract_rust_docstring(child, code);
                        let signature = Self::get_first_line(child, code);

                        symbols.push(SymbolNode {
                            id: symbol_id.clone(),
                            name: name.to_string(),
                            kind: SymbolKind::Trait,
                            file_path: file_path.to_string(),
                            start_line: child.start_position().row + 1,
                            start_column: child.start_position().column + 1,
                            end_line: child.end_position().row + 1,
                            end_column: child.end_position().column + 1,
                            signature,
                            docstring: doc,
                            parent_id: Some(parent_id.to_string()),
                        });

                        edges.push(SymbolEdge {
                            source_id: parent_id.to_string(),
                            target_id: symbol_id,
                            kind: EdgeKind::Defines,
                        });
                    }
                }
                "function_item" => {
                    if let Some(name_node) = child.child_by_field_name("name") {
                        let name = Self::get_node_text(name_node, code);
                        let symbol_id = format!("fn::{}::{}", file_path, name);
                        let doc = Self::extract_rust_docstring(child, code);
                        let signature = Self::get_first_line(child, code);

                        symbols.push(SymbolNode {
                            id: symbol_id.clone(),
                            name: name.to_string(),
                            kind: SymbolKind::Function,
                            file_path: file_path.to_string(),
                            start_line: child.start_position().row + 1,
                            start_column: child.start_position().column + 1,
                            end_line: child.end_position().row + 1,
                            end_column: child.end_position().column + 1,
                            signature,
                            docstring: doc,
                            parent_id: Some(parent_id.to_string()),
                        });

                        edges.push(SymbolEdge {
                            source_id: parent_id.to_string(),
                            target_id: symbol_id.clone(),
                            kind: EdgeKind::Defines,
                        });

                        // Extract call expressions inside function body
                        Self::extract_call_expressions(child, code, &symbol_id, edges);
                    }
                }
                "use_declaration" => {
                    let text = Self::get_node_text(child, code);
                    edges.push(SymbolEdge {
                        source_id: parent_id.to_string(),
                        target_id: format!("import::{}", text),
                        kind: EdgeKind::Imports,
                    });
                }
                "mod_item" => {
                    if let Some(name_node) = child.child_by_field_name("name") {
                        let name = Self::get_node_text(name_node, code);
                        let symbol_id = format!("mod::{}::{}", file_path, name);

                        symbols.push(SymbolNode {
                            id: symbol_id.clone(),
                            name: name.to_string(),
                            kind: SymbolKind::Module,
                            file_path: file_path.to_string(),
                            start_line: child.start_position().row + 1,
                            start_column: child.start_position().column + 1,
                            end_line: child.end_position().row + 1,
                            end_column: child.end_position().column + 1,
                            signature: format!("mod {}", name),
                            docstring: None,
                            parent_id: Some(parent_id.to_string()),
                        });

                        edges.push(SymbolEdge {
                            source_id: parent_id.to_string(),
                            target_id: symbol_id.clone(),
                            kind: EdgeKind::Defines,
                        });

                        Self::traverse_rust_node(child, code, file_path, &symbol_id, symbols, edges);
                    }
                }
                _ => Self::traverse_rust_node(child, code, file_path, parent_id, symbols, edges),
            }
        }
    }

    fn extract_call_expressions(node: Node, code: &str, caller_id: &str, edges: &mut Vec<SymbolEdge>) {
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            if child.kind() == "call_expression" {
                if let Some(function_node) = child.child_by_field_name("function") {
                    let callee_name = Self::get_node_text(function_node, code);
                    edges.push(SymbolEdge {
                        source_id: caller_id.to_string(),
                        target_id: format!("target_fn::{}", callee_name),
                        kind: EdgeKind::Calls,
                    });
                }
            }
            Self::extract_call_expressions(child, code, caller_id, edges);
        }
    }

    fn extract_rust_docstring(node: Node, code: &str) -> Option<String> {
        let mut docs = Vec::new();
        let mut prev = node.prev_sibling();
        while let Some(p) = prev {
            if p.kind() == "line_comment" {
                let text = Self::get_node_text(p, code);
                if text.starts_with("///") || text.starts_with("//!") {
                    let clean = text.trim_start_matches("///").trim_start_matches("//!").trim();
                    docs.insert(0, clean);
                }
                prev = p.prev_sibling();
            } else {
                break;
            }
        }
        if docs.is_empty() { None } else { Some(docs.join("\n")) }
    }

    pub fn parse_ts_file(file_path: &str, code: &str) -> (Vec<SymbolNode>, Vec<SymbolEdge>) {
        let mut symbols = Vec::new();
        let mut edges = Vec::new();

        let file_symbol_id = format!("file::{}", file_path);
        let file_name = file_path.split(|c| c == '/' || c == '\\').last().unwrap_or(file_path).to_string();

        symbols.push(SymbolNode {
            id: file_symbol_id.clone(),
            name: file_name,
            kind: SymbolKind::File,
            file_path: file_path.to_string(),
            start_line: 0,
            start_column: 0,
            end_line: code.lines().count(),
            end_column: 0,
            signature: format!("file {}", file_path),
            docstring: None,
            parent_id: None,
        });

        // Fast regex extraction for TS/JS files
        let function_re = regex::Regex::new(r"(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(").unwrap();
        let class_re = regex::Regex::new(r"(?:export\s+)?class\s+([A-Za-z0-9_]+)").unwrap();
        let interface_re = regex::Regex::new(r"(?:export\s+)?interface\s+([A-Za-z0-9_]+)").unwrap();

        for (idx, line) in code.lines().enumerate() {
            let line_num = idx + 1;
            let trimmed = line.trim();

            if let Some(cap) = function_re.captures(trimmed) {
                let name = &cap[1];
                let symbol_id = format!("fn::{}::{}", file_path, name);
                symbols.push(SymbolNode {
                    id: symbol_id.clone(),
                    name: name.to_string(),
                    kind: SymbolKind::Function,
                    file_path: file_path.to_string(),
                    start_line: line_num,
                    start_column: 1,
                    end_line: line_num,
                    end_column: line.len(),
                    signature: trimmed.to_string(),
                    docstring: None,
                    parent_id: Some(file_symbol_id.clone()),
                });
                edges.push(SymbolEdge {
                    source_id: file_symbol_id.clone(),
                    target_id: symbol_id,
                    kind: EdgeKind::Defines,
                });
            } else if let Some(cap) = class_re.captures(trimmed) {
                let name = &cap[1];
                let symbol_id = format!("class::{}::{}", file_path, name);
                symbols.push(SymbolNode {
                    id: symbol_id.clone(),
                    name: name.to_string(),
                    kind: SymbolKind::Class,
                    file_path: file_path.to_string(),
                    start_line: line_num,
                    start_column: 1,
                    end_line: line_num,
                    end_column: line.len(),
                    signature: trimmed.to_string(),
                    docstring: None,
                    parent_id: Some(file_symbol_id.clone()),
                });
                edges.push(SymbolEdge {
                    source_id: file_symbol_id.clone(),
                    target_id: symbol_id,
                    kind: EdgeKind::Defines,
                });
            } else if let Some(cap) = interface_re.captures(trimmed) {
                let name = &cap[1];
                let symbol_id = format!("interface::{}::{}", file_path, name);
                symbols.push(SymbolNode {
                    id: symbol_id.clone(),
                    name: name.to_string(),
                    kind: SymbolKind::Interface,
                    file_path: file_path.to_string(),
                    start_line: line_num,
                    start_column: 1,
                    end_line: line_num,
                    end_column: line.len(),
                    signature: trimmed.to_string(),
                    docstring: None,
                    parent_id: Some(file_symbol_id.clone()),
                });
                edges.push(SymbolEdge {
                    source_id: file_symbol_id.clone(),
                    target_id: symbol_id,
                    kind: EdgeKind::Defines,
                });
            }
        }

        (symbols, edges)
    }

    fn parse_fallback_file(file_path: &str, code: &str) -> (Vec<SymbolNode>, Vec<SymbolEdge>) {
        let file_symbol_id = format!("file::{}", file_path);
        let file_name = file_path.split(|c| c == '/' || c == '\\').last().unwrap_or(file_path).to_string();

        let symbol = SymbolNode {
            id: file_symbol_id,
            name: file_name,
            kind: SymbolKind::File,
            file_path: file_path.to_string(),
            start_line: 0,
            start_column: 0,
            end_line: code.lines().count(),
            end_column: 0,
            signature: format!("file {}", file_path),
            docstring: None,
            parent_id: None,
        };

        (vec![symbol], vec![])
    }

    fn get_node_text<'a>(node: Node, code: &'a str) -> &'a str {
        let start = node.start_byte();
        let end = node.end_byte();
        if start <= end && end <= code.len() {
            &code[start..end]
        } else {
            ""
        }
    }

    fn get_first_line(node: Node, code: &str) -> String {
        let text = Self::get_node_text(node, code);
        text.lines().next().unwrap_or("").to_string()
    }
}
