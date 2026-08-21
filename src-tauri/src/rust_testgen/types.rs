use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RustParamMeta {
    pub name: String,
    pub type_str: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RustFunctionMeta {
    pub name: String,
    pub is_pub: bool,
    pub is_async: bool,
    pub is_const: bool,
    pub params: Vec<RustParamMeta>,
    pub return_type: Option<String>,
    pub is_result: bool,
    pub is_option: bool,
    pub line_number: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RustTestOptions {
    pub generate_unit_tests: bool,
    pub generate_error_paths: bool,
    pub generate_async_tokio: bool,
    pub generate_proptest: bool,
    pub generate_boundary_checks: bool,
    pub generate_benchmarks: bool,
    pub generate_doc_tests: bool,
}

impl Default for RustTestOptions {
    fn default() -> Self {
        Self {
            generate_unit_tests: true,
            generate_error_paths: true,
            generate_async_tokio: true,
            generate_proptest: true,
            generate_boundary_checks: true,
            generate_benchmarks: false,
            generate_doc_tests: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RustTestCase {
    pub id: String,
    pub fn_name: String,
    pub test_name: String,
    pub test_type: String, // "unit", "async", "proptest", "boundary", "benchmark"
    pub code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RustGeneratedTestSuite {
    pub source_file: String,
    pub total_functions_parsed: usize,
    pub test_cases: Vec<RustTestCase>,
    pub combined_mod_tests_code: String,
}
