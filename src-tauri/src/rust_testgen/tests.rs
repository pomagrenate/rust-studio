#[cfg(test)]
mod tests {
    use crate::rust_testgen::ast_parser::parse_rust_file_ast;
    use crate::rust_testgen::generator::generate_rust_test_suite;
    use crate::rust_testgen::types::RustTestOptions;

    #[test]
    fn test_parse_rust_file_ast() {
        let code = r#"
            pub fn add_numbers(a: usize, b: usize) -> Result<usize, String> {
                Ok(a + b)
            }

            pub async fn fetch_data(url: &str) -> Option<String> {
                Some(url.to_string())
            }
        "#;

        let funcs = parse_rust_file_ast(code).expect("Should parse valid Rust AST");
        assert_eq!(funcs.len(), 2);

        let add_fn = &funcs[0];
        assert_eq!(add_fn.name, "add_numbers");
        assert!(add_fn.is_pub);
        assert!(!add_fn.is_async);
        assert!(add_fn.is_result);

        let fetch_fn = &funcs[1];
        assert_eq!(fetch_fn.name, "fetch_data");
        assert!(fetch_fn.is_async);
        assert!(fetch_fn.is_option);
    }

    #[test]
    fn test_generate_rust_test_suite() {
        let code = r#"
            pub fn process_input(input: String) -> Result<usize, String> {
                Ok(input.len())
            }
        "#;

        let funcs = parse_rust_file_ast(code).unwrap();
        let options = RustTestOptions::default();

        let suite = generate_rust_test_suite("sample.rs", &funcs, &options);
        assert_eq!(suite.total_functions_parsed, 1);
        assert!(!suite.test_cases.is_empty());
        assert!(suite.combined_mod_tests_code.contains("#[cfg(test)]"));
        assert!(suite.combined_mod_tests_code.contains("test_process_input_happy_path"));
    }
}
