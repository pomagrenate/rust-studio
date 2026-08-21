use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use std::time::Instant;
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;
use regex::RegexBuilder;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SearchMatch {
    pub line_number: usize,
    pub line_text: String,
    pub match_start: usize,
    pub match_end: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FileSearchResult {
    pub file_path: String,
    pub relative_path: String,
    pub file_name: String,
    pub matches: Vec<SearchMatch>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SearchResponse {
    pub results: Vec<FileSearchResult>,
    pub total_files: usize,
    pub total_matches: usize,
    pub duration_ms: u128,
    pub limit_hit: bool,
}

#[derive(Deserialize, Debug, Clone)]
pub struct SearchOptions {
    pub query: String,
    pub roots: Vec<String>,
    pub is_case_sensitive: bool,
    pub is_whole_word: bool,
    pub is_regex: bool,
    pub include_pattern: Option<String>,
    pub exclude_pattern: Option<String>,
    pub max_results: Option<usize>,
}

#[derive(Deserialize, Debug)]
pub struct FileReplacement {
    pub file_path: String,
    pub line_number: usize,
    pub match_start: usize,
    pub match_end: usize,
    pub replacement: String,
}

fn is_binary_file(file: &mut File) -> bool {
    use std::io::{Seek, SeekFrom};
    let mut buffer = [0u8; 512];
    let is_bin = match file.read(&mut buffer) {
        Ok(n) => buffer[..n].contains(&0),
        Err(_) => true,
    };
    let _ = file.seek(SeekFrom::Start(0));
    is_bin
}

fn matches_filter(path_str: &str, file_name: &str, patterns: &[String]) -> bool {
    for pat in patterns {
        let p = pat.trim();
        if p.is_empty() {
            continue;
        }

        // Extension check: e.g. *.ts or .ts
        if let Some(ext) = p.strip_prefix("*.") {
            if file_name.ends_with(&format!(".{}", ext)) {
                return true;
            }
            continue;
        } else if let Some(ext) = p.strip_prefix('.') {
            if file_name.ends_with(&format!(".{}", ext)) {
                return true;
            }
            continue;
        }

        // Substring / glob match
        let clean_p = p.trim_matches('*');
        if !clean_p.is_empty() && (path_str.contains(clean_p) || file_name.contains(clean_p)) {
            return true;
        }
    }
    false
}

#[tauri::command]
pub async fn search_in_files(options: SearchOptions) -> Result<SearchResponse, String> {
    tokio::task::spawn_blocking(move || {
        let start_time = Instant::now();
        let query_str = options.query.trim();

        if query_str.is_empty() || options.roots.is_empty() {
            return Ok(SearchResponse {
                results: Vec::new(),
                total_files: 0,
                total_matches: 0,
                duration_ms: start_time.elapsed().as_millis(),
                limit_hit: false,
            });
        }

        // Build regex pattern
        let pattern_str = if options.is_regex {
            if options.is_whole_word {
                format!(r"\b(?:{})\b", query_str)
            } else {
                query_str.to_string()
            }
        } else {
            let escaped = regex::escape(query_str);
            if options.is_whole_word {
                format!(r"\b{}\b", escaped)
            } else {
                escaped
            }
        };

        let regex = RegexBuilder::new(&pattern_str)
            .case_insensitive(!options.is_case_sensitive)
            .multi_line(false)
            .build()
            .map_err(|e| format!("Invalid regex pattern: {}", e))?;

        let max_total_matches = options.max_results.unwrap_or(1000);
        let max_files = 200;
        let max_matches_per_file = 100;
        let max_file_size = 2 * 1024 * 1024; // 2 MB

        // Parse include / exclude filters
        let include_patterns: Vec<String> = options
            .include_pattern
            .unwrap_or_default()
            .split([',', ';'])
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty())
            .collect();

        let mut exclude_patterns: Vec<String> = options
            .exclude_pattern
            .unwrap_or_default()
            .split([',', ';'])
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty())
            .collect();

        // Add default ignore directories & huge bundle files
        let default_excludes = [
            "node_modules", ".git", "target", "dist", "build", ".vscode", ".idea", 
            ".system_generated", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", 
            "cargo.lock", ".min.js", ".min.css", ".map"
        ];
        for exc in default_excludes {
            if !exclude_patterns.iter().any(|e| e == exc) {
                exclude_patterns.push(exc.to_string());
            }
        }

        let mut results: Vec<FileSearchResult> = Vec::new();
        let mut total_matches = 0;
        let mut limit_hit = false;

        'outer: for root_path_str in &options.roots {
            let root_path = Path::new(root_path_str);
            if !root_path.exists() {
                continue;
            }

            let walker = WalkDir::new(root_path)
                .follow_links(false)
                .into_iter()
                .filter_entry(|entry| {
                    let name = entry.file_name().to_string_lossy().to_lowercase();
                    // Exclude ignored directories
                    if entry.file_type().is_dir() {
                        for exc in &exclude_patterns {
                            if name == *exc || name.contains(exc) {
                                return false;
                            }
                        }
                    }
                    true
                });

            for entry in walker.filter_map(|e| e.ok()) {
                if !entry.file_type().is_file() {
                    continue;
                }

                let path = entry.path();
                let file_name = entry.file_name().to_string_lossy();
                let lower_name = file_name.to_lowercase();
                let rel_path = path.strip_prefix(root_path).unwrap_or(path).to_string_lossy().to_lowercase();

                // Exclude check
                if matches_filter(&rel_path, &lower_name, &exclude_patterns) {
                    continue;
                }

                // Include check (if specified)
                if !include_patterns.is_empty() && !matches_filter(&rel_path, &lower_name, &include_patterns) {
                    continue;
                }

                // File size check: skip files larger than 2MB
                if let Ok(metadata) = entry.metadata() {
                    if metadata.len() > max_file_size {
                        continue;
                    }
                }

                // Open file with BufReader for streaming line parsing
                let mut file = match File::open(path) {
                    Ok(f) => f,
                    Err(_) => continue,
                };

                // Binary check
                if is_binary_file(&mut file) {
                    continue;
                }

                let reader = BufReader::new(file);
                let mut file_matches: Vec<SearchMatch> = Vec::new();

                for (line_idx, line_res) in reader.lines().enumerate() {
                    let line = match line_res {
                        Ok(l) => l,
                        Err(_) => break, // invalid UTF-8 or read error
                    };

                    for mat in regex.find_iter(&line) {
                        file_matches.push(SearchMatch {
                            line_number: line_idx + 1,
                            line_text: line.clone(),
                            match_start: mat.start(),
                            match_end: mat.end(),
                        });

                        total_matches += 1;
                        if file_matches.len() >= max_matches_per_file || total_matches >= max_total_matches {
                            break;
                        }
                    }

                    if file_matches.len() >= max_matches_per_file || total_matches >= max_total_matches {
                        break;
                    }
                }

                if !file_matches.is_empty() {
                    let rel_path = path
                        .strip_prefix(root_path)
                        .unwrap_or(path)
                        .to_string_lossy()
                        .into_owned();

                    results.push(FileSearchResult {
                        file_path: path.to_string_lossy().into_owned(),
                        relative_path: rel_path,
                        file_name: file_name.into_owned(),
                        matches: file_matches,
                    });
                }

                if total_matches >= max_total_matches || results.len() >= max_files {
                    limit_hit = true;
                    break 'outer;
                }
            }
        }

        let total_files = results.len();

        Ok(SearchResponse {
            results,
            total_files,
            total_matches,
            duration_ms: start_time.elapsed().as_millis(),
            limit_hit,
        })
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn replace_in_files(replacements: Vec<FileReplacement>) -> Result<usize, String> {
    tokio::task::spawn_blocking(move || {
        use std::collections::HashMap;

        // Group replacements by file path
        let mut file_map: HashMap<String, Vec<FileReplacement>> = HashMap::new();
        for rep in replacements {
            file_map.entry(rep.file_path.clone()).or_default().push(rep);
        }

        let mut total_replaced = 0;

        for (file_path, mut reps) in file_map {
            let content = fs::read_to_string(&file_path).map_err(|e| format!("Failed to read {}: {}", file_path, e))?;
            let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();

            // Sort replacements by line descending and start index descending so offsets don't invalidate
            reps.sort_by(|a, b| {
                b.line_number
                    .cmp(&a.line_number)
                    .then_with(|| b.match_start.cmp(&a.match_start))
            });

            for rep in reps {
                if rep.line_number > 0 && rep.line_number <= lines.len() {
                    let line = &lines[rep.line_number - 1];
                    if rep.match_start <= line.len() && rep.match_end <= line.len() && rep.match_start <= rep.match_end {
                        let mut new_line = line[..rep.match_start].to_string();
                        new_line.push_str(&rep.replacement);
                        new_line.push_str(&line[rep.match_end..]);
                        lines[rep.line_number - 1] = new_line;
                        total_replaced += 1;
                    }
                }
            }

            let new_content = lines.join("\n");
            fs::write(&file_path, new_content).map_err(|e| format!("Failed to write {}: {}", file_path, e))?;
        }

        Ok(total_replaced)
    }).await.map_err(|e| e.to_string())?
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HierarchyNode {
    pub name: String,
    pub kind: String, // "function" | "struct" | "trait" | "enum" | "method"
    pub file_path: String,
    pub line: usize,
    pub column: usize,
    pub signature: String,
    pub children: Vec<HierarchyNode>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HierarchyResponse {
    pub root_symbol: String,
    pub mode: String, // "incoming" | "outgoing" | "supertypes" | "subtypes"
    pub nodes: Vec<HierarchyNode>,
    pub duration_ms: u64,
}

#[tauri::command]
pub async fn get_call_hierarchy(
    project_path: String,
    symbol_name: String,
    mode: String, // "incoming" | "outgoing"
) -> Result<HierarchyResponse, String> {
    tokio::task::spawn_blocking(move || {
        let start = Instant::now();
        let root = Path::new(&project_path);
        let mut nodes = Vec::new();
        let clean_symbol = symbol_name.trim();

        if clean_symbol.is_empty() || !root.exists() {
            return Ok(HierarchyResponse {
                root_symbol: symbol_name,
                mode,
                nodes: Vec::new(),
                duration_ms: start.elapsed().as_millis() as u64,
            });
        }

        let fn_def_regex = regex::Regex::new(r"(?:pub\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)").unwrap();
        let call_regex = regex::Regex::new(&format!(r"\b{}\s*\(", regex::escape(clean_symbol))).unwrap();

        if mode == "incoming" {
            // Find callers that invoke symbol_name(...)
            for entry in WalkDir::new(root).into_iter().flatten() {
                let p = entry.path();
                let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("");
                if ext == "rs" || ext == "ts" || ext == "tsx" {
                    if let Ok(content) = fs::read_to_string(p) {
                        let lines: Vec<&str> = content.lines().collect();
                        let mut current_fn: Option<(String, usize, usize)> = None;

                        for (idx, line) in lines.iter().enumerate() {
                            if let Some(caps) = fn_def_regex.captures(line) {
                                if let Some(m) = caps.get(1) {
                                    current_fn = Some((m.as_str().to_string(), idx + 1, m.start() + 1));
                                }
                            }

                            if call_regex.is_match(line) {
                                let caller_name = current_fn.as_ref().map(|(n, _, _)| n.clone()).unwrap_or_else(|| "top_level".to_string());
                                if caller_name != clean_symbol {
                                    let rel_path = p.strip_prefix(root).unwrap_or(p).to_string_lossy().to_string();
                                    nodes.push(HierarchyNode {
                                        name: caller_name,
                                        kind: "function".to_string(),
                                        file_path: rel_path,
                                        line: idx + 1,
                                        column: 1,
                                        signature: line.trim().to_string(),
                                        children: Vec::new(),
                                    });
                                }
                            }
                        }
                    }
                }
            }
        } else {
            // Outgoing calls: scan inside definition of symbol_name
            let target_fn_regex = regex::Regex::new(&format!(r"(?:pub\s+)?(?:async\s+)?fn\s+{}\b", regex::escape(clean_symbol))).unwrap();
            let generic_call_regex = regex::Regex::new(r"\b([a-zA-Z0-9_]{3,})\s*\(").unwrap();

            for entry in WalkDir::new(root).into_iter().flatten() {
                let p = entry.path();
                let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("");
                if ext == "rs" || ext == "ts" || ext == "tsx" {
                    if let Ok(content) = fs::read_to_string(p) {
                        let lines: Vec<&str> = content.lines().collect();
                        let mut inside_target = false;
                        let mut brace_count = 0;

                        for (idx, line) in lines.iter().enumerate() {
                            if target_fn_regex.is_match(line) {
                                inside_target = true;
                                brace_count = 0;
                            }

                            if inside_target {
                                brace_count += line.matches('{').count() as i32;
                                brace_count -= line.matches('}').count() as i32;

                                for caps in generic_call_regex.captures_iter(line) {
                                    if let Some(callee) = caps.get(1) {
                                        let c_name = callee.as_str();
                                        if c_name != clean_symbol && c_name != "if" && c_name != "match" && c_name != "while" && c_name != "Some" && c_name != "Ok" && c_name != "Err" && c_name != "vec" && c_name != "println" && c_name != "format" {
                                            let rel_path = p.strip_prefix(root).unwrap_or(p).to_string_lossy().to_string();
                                            nodes.push(HierarchyNode {
                                                name: c_name.to_string(),
                                                kind: "function".to_string(),
                                                file_path: rel_path,
                                                line: idx + 1,
                                                column: callee.start() + 1,
                                                signature: line.trim().to_string(),
                                                children: Vec::new(),
                                            });
                                        }
                                    }
                                }

                                if brace_count <= 0 && line.contains('}') {
                                    inside_target = false;
                                }
                            }
                        }
                    }
                }
            }
        }

        // Deduplicate nodes
        nodes.dedup_by(|a, b| a.name == b.name && a.file_path == b.file_path && a.line == b.line);

        Ok(HierarchyResponse {
            root_symbol: clean_symbol.to_string(),
            mode,
            nodes,
            duration_ms: start.elapsed().as_millis() as u64,
        })
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_type_hierarchy(
    project_path: String,
    type_name: String,
    mode: String, // "supertypes" | "subtypes"
) -> Result<HierarchyResponse, String> {
    tokio::task::spawn_blocking(move || {
        let start = Instant::now();
        let root = Path::new(&project_path);
        let mut nodes = Vec::new();
        let clean_type = type_name.trim();

        if clean_type.is_empty() || !root.exists() {
            return Ok(HierarchyResponse {
                root_symbol: type_name,
                mode,
                nodes: Vec::new(),
                duration_ms: start.elapsed().as_millis() as u64,
            });
        }

        // Subtypes: find all `impl <trait> for <Struct>` or `struct/enum`
        let impl_trait_regex = regex::Regex::new(&format!(r"impl(?:\s*<[^>]+>)?\s+{}\s+for\s+([a-zA-Z0-9_]+)", regex::escape(clean_type))).unwrap();
        let impl_for_struct_regex = regex::Regex::new(&format!(r"impl(?:\s*<[^>]+>)?\s+([a-zA-Z0-9_]+)\s+for\s+{}\b", regex::escape(clean_type))).unwrap();
        let trait_super_regex = regex::Regex::new(&format!(r"trait\s+{}\s*:\s*([^{{]+)", regex::escape(clean_type))).unwrap();

        for entry in WalkDir::new(root).into_iter().flatten() {
            let p = entry.path();
            if p.extension().map_or(false, |ext| ext == "rs") {
                if let Ok(content) = fs::read_to_string(p) {
                    let lines: Vec<&str> = content.lines().collect();
                    let rel_path = p.strip_prefix(root).unwrap_or(p).to_string_lossy().to_string();

                    for (idx, line) in lines.iter().enumerate() {
                        if mode == "subtypes" {
                            // Structs implementing this trait
                            if let Some(caps) = impl_trait_regex.captures(line) {
                                if let Some(struct_name) = caps.get(1) {
                                    nodes.push(HierarchyNode {
                                        name: struct_name.as_str().to_string(),
                                        kind: "struct".to_string(),
                                        file_path: rel_path.clone(),
                                        line: idx + 1,
                                        column: struct_name.start() + 1,
                                        signature: line.trim().to_string(),
                                        children: Vec::new(),
                                    });
                                }
                            }
                            // Traits implemented by this struct
                            if let Some(caps) = impl_for_struct_regex.captures(line) {
                                if let Some(tr_name) = caps.get(1) {
                                    nodes.push(HierarchyNode {
                                        name: tr_name.as_str().to_string(),
                                        kind: "trait".to_string(),
                                        file_path: rel_path.clone(),
                                        line: idx + 1,
                                        column: tr_name.start() + 1,
                                        signature: line.trim().to_string(),
                                        children: Vec::new(),
                                    });
                                }
                            }
                        } else if mode == "supertypes" {
                            if let Some(caps) = trait_super_regex.captures(line) {
                                if let Some(supers) = caps.get(1) {
                                    for super_trait in supers.as_str().split('+') {
                                        let s_clean = super_trait.trim();
                                        if !s_clean.is_empty() {
                                            nodes.push(HierarchyNode {
                                                name: s_clean.to_string(),
                                                kind: "trait".to_string(),
                                                file_path: rel_path.clone(),
                                                line: idx + 1,
                                                column: 1,
                                                signature: line.trim().to_string(),
                                                children: Vec::new(),
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        nodes.dedup_by(|a, b| a.name == b.name && a.file_path == b.file_path && a.line == b.line);

        Ok(HierarchyResponse {
            root_symbol: clean_type.to_string(),
            mode,
            nodes,
            duration_ms: start.elapsed().as_millis() as u64,
        })
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_search_in_files_plain_and_regex() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        let file1 = root.join("main.rs");
        let file2 = root.join("lib.rs");
        let file3 = root.join("ignore.txt");

        fs::write(&file1, "fn main() {\n    println!(\"Hello World\");\n}").unwrap();
        fs::write(&file2, "pub fn hello_world() {\n    let world = 42;\n}").unwrap();
        fs::write(&file3, "hello world").unwrap();

        // 1. Search for "world" case-insensitive
        let opts = SearchOptions {
            query: "world".to_string(),
            roots: vec![root.to_string_lossy().to_string()],
            is_case_sensitive: false,
            is_whole_word: false,
            is_regex: false,
            include_pattern: Some("*.rs".to_string()),
            exclude_pattern: None,
            max_results: None,
        };

        let response = search_in_files(opts).await.unwrap();
        assert_eq!(response.total_files, 2);
        assert_eq!(response.total_matches, 3);

        // 2. Regex search for "fn\\s+hello"
        let regex_opts = SearchOptions {
            query: r"fn\s+hello".to_string(),
            roots: vec![root.to_string_lossy().to_string()],
            is_case_sensitive: true,
            is_whole_word: false,
            is_regex: true,
            include_pattern: None,
            exclude_pattern: None,
            max_results: None,
        };

        let regex_res = search_in_files(regex_opts).await.unwrap();
        assert_eq!(regex_res.total_files, 1);
        assert_eq!(regex_res.total_matches, 1);
        assert_eq!(regex_res.results[0].file_name, "lib.rs");
    }

    #[tokio::test]
    async fn test_replace_in_files_batch() {
        let dir = tempdir().unwrap();
        let file1 = dir.path().join("code.rs");

        fs::write(&file1, "fn test() {\n    let foo = 1;\n    let foo = 2;\n}").unwrap();

        let replacements = vec![
            FileReplacement {
                file_path: file1.to_string_lossy().to_string(),
                line_number: 2,
                match_start: 8,
                match_end: 11,
                replacement: "bar".to_string(),
            },
            FileReplacement {
                file_path: file1.to_string_lossy().to_string(),
                line_number: 3,
                match_start: 8,
                match_end: 11,
                replacement: "baz".to_string(),
            },
        ];

        let count = replace_in_files(replacements).await.unwrap();
        assert_eq!(count, 2);

        let new_content = fs::read_to_string(&file1).unwrap();
        assert_eq!(new_content, "fn test() {\n    let bar = 1;\n    let baz = 2;\n}");
    }

    #[tokio::test]
    async fn test_call_hierarchy_incoming() {
        let dir = tempdir().unwrap();
        let main_rs = dir.path().join("main.rs");

        fs::write(&main_rs, "fn compute() {}\n\nfn caller_one() {\n    compute();\n}\n").unwrap();

        let response = get_call_hierarchy(
            dir.path().to_string_lossy().to_string(),
            "compute".to_string(),
            "incoming".to_string(),
        ).await.unwrap();

        assert_eq!(response.nodes.len(), 1);
        assert_eq!(response.nodes[0].name, "caller_one");
    }
}

