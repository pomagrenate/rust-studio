use super::types::{RustFunctionMeta, RustGeneratedTestSuite, RustTestCase, RustTestOptions};

pub fn generate_rust_test_suite(
    source_file_name: &str,
    functions: &[RustFunctionMeta],
    options: &RustTestOptions,
) -> RustGeneratedTestSuite {
    let mut test_cases = Vec::new();

    for fn_meta in functions {
        // Skip test functions themselves
        if fn_meta.name.starts_with("test_") || fn_meta.name.ends_with("_test") {
            continue;
        }

        // 1. Standard Unit Test
        if options.generate_unit_tests {
            let tc = generate_unit_test(fn_meta);
            test_cases.push(tc);
        }

        // 2. Error Path Test (Result/Option)
        if options.generate_error_paths && (fn_meta.is_result || fn_meta.is_option) {
            let tc = generate_error_path_test(fn_meta);
            test_cases.push(tc);
        }

        // 3. Tokio Async Test
        if options.generate_async_tokio && fn_meta.is_async {
            let tc = generate_async_tokio_test(fn_meta);
            test_cases.push(tc);
        }

        // 4. Boundary Values Test
        if options.generate_boundary_checks && !fn_meta.params.is_empty() {
            let tc = generate_boundary_test(fn_meta);
            test_cases.push(tc);
        }

        // 5. Proptest Property Test
        if options.generate_proptest && !fn_meta.params.is_empty() {
            let tc = generate_proptest(fn_meta);
            test_cases.push(tc);
        }

        // 6. Benchmark Stub
        if options.generate_benchmarks {
            let tc = generate_benchmark_stub(fn_meta);
            test_cases.push(tc);
        }
    }

    // Combine all generated tests into a clean Rust `mod tests` block
    let mut combined_code = String::new();
    combined_code.push_str("#[cfg(test)]\nmod tests {\n    use super::*;\n\n");

    if options.generate_proptest {
        combined_code.push_str("    // Property testing strategies via proptest\n");
        combined_code.push_str("    use proptest::prelude::*;\n\n");
    }

    for tc in &test_cases {
        combined_code.push_str(&format!("    {}\n\n", tc.code.replace("\n", "\n    ")));
    }

    combined_code.push_str("}\n");

    RustGeneratedTestSuite {
        source_file: source_file_name.to_string(),
        total_functions_parsed: functions.len(),
        test_cases,
        combined_mod_tests_code: combined_code,
    }
}

fn generate_unit_test(fn_meta: &RustFunctionMeta) -> RustTestCase {
    let test_name = format!("test_{}_happy_path", fn_meta.name);
    let mut code = String::new();

    code.push_str("#[test]\n");
    code.push_str(&format!("fn {}() {{\n", test_name));

    // Dummy args based on params
    let arg_calls = build_default_args(&fn_meta.params);
    let invocation = if arg_calls.is_empty() {
        format!("{}()", fn_meta.name)
    } else {
        format!("{}({})", fn_meta.name, arg_calls.join(", "))
    };

    if fn_meta.is_async {
        code.push_str("    // Note: Async function invoked in sync test wrapper or tokio runtime\n");
    }

    if fn_meta.is_result {
        code.push_str(&format!("    let result = {};\n", invocation));
        code.push_str("    assert!(result.is_ok(), \"Expected Ok result, got Err: {:?}\", result.err());\n");
    } else if fn_meta.is_option {
        code.push_str(&format!("    let result = {};\n", invocation));
        code.push_str("    assert!(result.is_some(), \"Expected Some value, got None\");\n");
    } else if fn_meta.return_type.is_some() {
        code.push_str(&format!("    let result = {};\n", invocation));
        code.push_str("    // assert_eq!(result, expected_value);\n");
        code.push_str("    let _ = result;\n");
    } else {
        code.push_str(&format!("    {};\n", invocation));
    }

    code.push_str("}");

    RustTestCase {
        id: format!("{}_unit", fn_meta.name),
        fn_name: fn_meta.name.clone(),
        test_name,
        test_type: "unit".to_string(),
        code,
    }
}

fn generate_error_path_test(fn_meta: &RustFunctionMeta) -> RustTestCase {
    let test_name = format!("test_{}_error_boundary", fn_meta.name);
    let mut code = String::new();

    code.push_str("#[test]\n");
    code.push_str(&format!("fn {}() {{\n", test_name));

    let invalid_args = build_boundary_args(&fn_meta.params);
    let invocation = if invalid_args.is_empty() {
        format!("{}()", fn_meta.name)
    } else {
        format!("{}({})", fn_meta.name, invalid_args.join(", "))
    };

    if fn_meta.is_result {
        code.push_str(&format!("    let result = {};\n", invocation));
        code.push_str("    // Assert error or edge case handling\n");
        code.push_str("    // assert!(result.is_err());\n");
        code.push_str("    let _ = result;\n");
    } else if fn_meta.is_option {
        code.push_str(&format!("    let result = {};\n", invocation));
        code.push_str("    // assert!(result.is_none());\n");
        code.push_str("    let _ = result;\n");
    }

    code.push_str("}");

    RustTestCase {
        id: format!("{}_error", fn_meta.name),
        fn_name: fn_meta.name.clone(),
        test_name,
        test_type: "error".to_string(),
        code,
    }
}

fn generate_async_tokio_test(fn_meta: &RustFunctionMeta) -> RustTestCase {
    let test_name = format!("test_{}_tokio_async", fn_meta.name);
    let mut code = String::new();

    code.push_str("#[tokio::test]\n");
    code.push_str(&format!("async fn {}() {{\n", test_name));

    let arg_calls = build_default_args(&fn_meta.params);
    let invocation = format!("{}({}).await", fn_meta.name, arg_calls.join(", "));

    if fn_meta.is_result {
        code.push_str(&format!("    let res = {};\n", invocation));
        code.push_str("    assert!(res.is_ok());\n");
    } else {
        code.push_str(&format!("    let res = {};\n", invocation));
        code.push_str("    let _ = res;\n");
    }

    code.push_str("}");

    RustTestCase {
        id: format!("{}_async", fn_meta.name),
        fn_name: fn_meta.name.clone(),
        test_name,
        test_type: "async".to_string(),
        code,
    }
}

fn generate_boundary_test(fn_meta: &RustFunctionMeta) -> RustTestCase {
    let test_name = format!("test_{}_boundary_limits", fn_meta.name);
    let mut code = String::new();

    code.push_str("#[test]\n");
    code.push_str(&format!("fn {}() {{\n", test_name));

    let boundary_args = build_boundary_args(&fn_meta.params);
    let invocation = format!("{}({})", fn_meta.name, boundary_args.join(", "));

    code.push_str("    // Testing boundary limits (empty strings, zeros, MAX values)\n");
    code.push_str(&format!("    let res = {};\n", invocation));
    code.push_str("    let _ = res;\n");
    code.push_str("}");

    RustTestCase {
        id: format!("{}_boundary", fn_meta.name),
        fn_name: fn_meta.name.clone(),
        test_name,
        test_type: "boundary".to_string(),
        code,
    }
}

fn generate_proptest(fn_meta: &RustFunctionMeta) -> RustTestCase {
    let test_name = format!("prop_test_{}_randomized", fn_meta.name);
    let mut code = String::new();

    code.push_str("proptest! {\n");
    code.push_str(&format!("    #[test]\n    fn {}(\n", test_name));

    for (i, p) in fn_meta.params.iter().enumerate() {
        let strategy = map_type_to_proptest_strategy(&p.type_str);
        let comma = if i == fn_meta.params.len() - 1 { "" } else { "," };
        code.push_str(&format!("        {} in {}{}\n", p.name, strategy, comma));
    }

    code.push_str("    ) {\n");
    let arg_names: Vec<String> = fn_meta.params.iter().map(|p| p.name.clone()).collect();

    if fn_meta.is_async {
        code.push_str("        // Async property test execution stub\n");
        code.push_str(&format!("        let _ = tokio::runtime::Runtime::new().unwrap().block_on({}({}));\n", fn_meta.name, arg_names.join(", ")));
    } else {
        code.push_str(&format!("        let _ = {}({});\n", fn_meta.name, arg_names.join(", ")));
    }

    code.push_str("    }\n");
    code.push_str("}");

    RustTestCase {
        id: format!("{}_proptest", fn_meta.name),
        fn_name: fn_meta.name.clone(),
        test_name,
        test_type: "proptest".to_string(),
        code,
    }
}

fn generate_benchmark_stub(fn_meta: &RustFunctionMeta) -> RustTestCase {
    let test_name = format!("bench_{}", fn_meta.name);
    let mut code = String::new();

    code.push_str("#[bench]\n");
    code.push_str(&format!("fn {}(b: &mut test::Bencher) {{\n", test_name));
    let args = build_default_args(&fn_meta.params);
    code.push_str(&format!("    b.iter(|| {}({}));\n", fn_meta.name, args.join(", ")));
    code.push_str("}");

    RustTestCase {
        id: format!("{}_bench", fn_meta.name),
        fn_name: fn_meta.name.clone(),
        test_name,
        test_type: "benchmark".to_string(),
        code,
    }
}

fn build_default_args(params: &[super::types::RustParamMeta]) -> Vec<String> {
    params
        .iter()
        .map(|p| {
            let t = p.type_str.replace(" ", "");
            if t.contains("&str") {
                "\"test_string\"".to_string()
            } else if t.contains("String") {
                "\"test_string\".to_string()".to_string()
            } else if t.contains("usize") || t.contains("u32") || t.contains("i32") || t.contains("u64") {
                "42".to_string()
            } else if t.contains("bool") {
                "true".to_string()
            } else if t.contains("Vec") || t.contains("&[") {
                "vec![]".to_string()
            } else if t.contains("Option") {
                "Some(Default::default())".to_string()
            } else if t.contains("Path") {
                "std::path::Path::new(\"test_path\")".to_string()
            } else {
                "Default::default()".to_string()
            }
        })
        .collect()
}

fn build_boundary_args(params: &[super::types::RustParamMeta]) -> Vec<String> {
    params
        .iter()
        .map(|p| {
            let t = p.type_str.replace(" ", "");
            if t.contains("&str") {
                "\"\"".to_string()
            } else if t.contains("String") {
                "String::new()".to_string()
            } else if t.contains("usize") || t.contains("u32") || t.contains("u64") {
                "0".to_string()
            } else if t.contains("i32") || t.contains("i64") {
                "i32::MIN".to_string()
            } else if t.contains("bool") {
                "false".to_string()
            } else if t.contains("Vec") {
                "Vec::new()".to_string()
            } else if t.contains("Option") {
                "None".to_string()
            } else {
                "Default::default()".to_string()
            }
        })
        .collect()
}

fn map_type_to_proptest_strategy(type_str: &str) -> String {
    let t = type_str.replace(" ", "");
    if t.contains("usize") {
        "0..1000usize".to_string()
    } else if t.contains("u32") {
        "0..1000u32".to_string()
    } else if t.contains("i32") {
        "-500..500i32".to_string()
    } else if t.contains("&str") || t.contains("String") {
        "\".*\"".to_string()
    } else if t.contains("bool") {
        "any::<bool>()".to_string()
    } else {
        "any::<String>()".to_string()
    }
}
