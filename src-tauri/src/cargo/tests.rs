/**
 * tests.rs — Production-ready test suite for the Cargo integration subsystem
 */

#[cfg(test)]
mod cargo_integration_tests {
    use std::path::PathBuf;
    use serde_json::json;
    use crate::buffer::RopeBuffer;
    use crate::cargo::diagnostic_mapper::{
        parse_compiler_message, CargoDiagnostic, DiagnosticSeverity, CodeSuggestion, DiagnosticRange
    };
    use crate::cargo::fix_application::{
        apply_compiler_suggestion, filter_machine_applicable
    };

    #[test]
    fn test_e2e_cargo_check_and_autofix() {
        let workspace_root = PathBuf::from("E:/GithubProjects/pomai-studio");

        // 1. Raw JSON message from `cargo check --message-format=json`
        let raw_cargo_json = json!({
            "reason": "compiler-message",
            "package_id": "pomai-studio 0.1.0",
            "target": { "kind": ["bin"], "name": "pomai-studio" },
            "message": {
                "code": { "code": "unused_variables", "explanation": null },
                "level": "warning",
                "message": "unused variable: `unused_val`",
                "rendered": "warning: unused variable: `unused_val`\n  --> src/main.rs:2:9\n",
                "spans": [
                    {
                        "file_name": "src/main.rs",
                        "line_start": 2,
                        "line_end": 2,
                        "column_start": 9,
                        "column_end": 19,
                        "is_primary": true,
                        "label": null
                    }
                ],
                "children": [
                    {
                        "level": "help",
                        "message": "if this is intentional, prefix it with an underscore",
                        "spans": [],
                        "suggestion": {
                            "applicability": "MachineApplicable",
                            "replacement": "_unused_val",
                            "spans": [
                                {
                                    "file_name": "src/main.rs",
                                    "line_start": 2,
                                    "line_end": 2,
                                    "column_start": 9,
                                    "column_end": 19
                                }
                            ]
                        }
                    }
                ]
            }
        });

        // 2. Parse compiler message
        let compiler_msg = raw_cargo_json.get("message").unwrap();
        let diagnostics = parse_compiler_message(compiler_msg, &workspace_root)
            .expect("Failed to parse compiler message");

        assert_eq!(diagnostics.len(), 1);
        let diag = &diagnostics[0];
        assert_eq!(diag.code.as_deref(), Some("unused_variables"));
        assert!(matches!(diag.severity, DiagnosticSeverity::Warning));

        // 3. Filter machine-applicable suggestions
        let machine_suggestions = filter_machine_applicable(&diag.suggestions);
        assert_eq!(machine_suggestions.len(), 1);

        // 4. Initialize buffer with un-fixed source code
        let source_code = "fn main() {\n    let unused_val = 42;\n    println!(\"Hello\");\n}";
        let mut buffer = RopeBuffer::from_str(source_code);

        // 5. Apply compiler suggestion
        apply_compiler_suggestion(&mut buffer, &machine_suggestions[0])
            .expect("Failed to apply compiler suggestion");

        // 6. Verify source code was auto-fixed
        let expected_code = "fn main() {\n    let _unused_val = 42;\n    println!(\"Hello\");\n}";
        assert_eq!(buffer.to_string(), expected_code);
    }

    #[test]
    fn test_sequential_suggestions_application() {
        let mut buffer = RopeBuffer::from_str("fn main() {\n    let foo = 1;\n    let bar = 2;\n}");

        let sug1 = CodeSuggestion {
            range: DiagnosticRange {
                start_line: 1,
                start_character: 8,
                end_line: 1,
                end_character: 11,
            },
            replacement: "_foo".to_string(),
            applicability: "MachineApplicable".to_string(),
        };

        let sug2 = CodeSuggestion {
            range: DiagnosticRange {
                start_line: 2,
                start_character: 8,
                end_line: 2,
                end_character: 11,
            },
            replacement: "_bar".to_string(),
            applicability: "MachineApplicable".to_string(),
        };

        // Apply suggestions bottom-up or sequentially
        apply_compiler_suggestion(&mut buffer, &sug2).unwrap();
        apply_compiler_suggestion(&mut buffer, &sug1).unwrap();

        assert_eq!(buffer.to_string(), "fn main() {\n    let _foo = 1;\n    let _bar = 2;\n}");
    }

    #[test]
    fn test_complex_workspace_diagnostics() {
        let workspace_root = PathBuf::from("E:/GithubProjects/pomai-studio");

        let msg_json = json!({
            "code": { "code": "E0425" },
            "level": "error",
            "message": "cannot find value `missing_func` in this scope",
            "rendered": "error[E0425]: cannot find value `missing_func`",
            "spans": [
                {
                    "file_name": "src-tauri/src/lib.rs",
                    "line_start": 15,
                    "line_end": 15,
                    "column_start": 5,
                    "column_end": 17,
                    "is_primary": true
                }
            ],
            "children": [
                {
                    "level": "help",
                    "message": "a function with a similar name exists: `existing_func`",
                    "spans": [
                        {
                            "file_name": "src-tauri/src/lib.rs",
                            "line_start": 2,
                            "line_end": 2,
                            "column_start": 1,
                            "column_end": 20
                        }
                    ]
                }
            ]
        });

        let diags = parse_compiler_message(&msg_json, &workspace_root).unwrap();
        assert_eq!(diags.len(), 1);
        let diag = &diags[0];

        assert_eq!(diag.file_path, workspace_root.join("src-tauri/src/lib.rs").to_string_lossy().to_string());
        assert_eq!(diag.range.start_line, 14);
        assert_eq!(diag.range.start_character, 4);
        assert_eq!(diag.related.len(), 1);
        assert_eq!(diag.related[0].range.start_line, 1);
    }

    #[test]
    fn test_cargo_diagnostic_serde_roundtrip() {
        let diag = CargoDiagnostic {
            file_path: "E:/GithubProjects/pomai-studio/src/main.rs".to_string(),
            range: DiagnosticRange {
                start_line: 10,
                start_character: 5,
                end_line: 10,
                end_character: 15,
            },
            severity: DiagnosticSeverity::Error,
            code: Some("E0308".to_string()),
            rendered_message: "rendered error".to_string(),
            message: "mismatched types".to_string(),
            related: vec![],
            suggestions: vec![
                CodeSuggestion {
                    range: DiagnosticRange {
                        start_line: 10,
                        start_character: 5,
                        end_line: 10,
                        end_character: 15,
                    },
                    replacement: "valid_type".to_string(),
                    applicability: "MachineApplicable".to_string(),
                }
            ],
        };

        let serialized = serde_json::to_string(&diag).expect("Serialization failed");
        let deserialized: CargoDiagnostic = serde_json::from_str(&serialized).expect("Deserialization failed");

        assert_eq!(deserialized.file_path, diag.file_path);
        assert_eq!(deserialized.code, diag.code);
        assert_eq!(deserialized.suggestions.len(), 1);
        assert_eq!(deserialized.suggestions[0].replacement, "valid_type");
    }
}
