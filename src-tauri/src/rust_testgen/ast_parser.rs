use super::types::{RustFunctionMeta, RustParamMeta};
use syn::spanned::Spanned;
use syn::{FnArg, Item, Pat, ReturnType};

pub fn parse_rust_file_ast(code: &str) -> Result<Vec<RustFunctionMeta>, String> {
    let syn_file = syn::parse_file(code).map_err(|e| format!("Failed to parse Rust AST: {}", e))?;
    let mut functions = Vec::new();

    for item in syn_file.items {
        match item {
            Item::Fn(func) => {
                let meta = extract_fn_meta(&func.sig, matches!(func.vis, syn::Visibility::Public(_)), func.span().start().line);
                functions.push(meta);
            }
            Item::Impl(item_impl) => {
                for impl_item in item_impl.items {
                    if let syn::ImplItem::Fn(method) = impl_item {
                        let meta = extract_fn_meta(&method.sig, matches!(method.vis, syn::Visibility::Public(_)), method.span().start().line);
                        functions.push(meta);
                    }
                }
            }
            _ => {}
        }
    }

    Ok(functions)
}

fn extract_fn_meta(sig: &syn::Signature, is_pub: bool, line_number: usize) -> RustFunctionMeta {
    let fn_name = sig.ident.to_string();
    let is_async = sig.asyncness.is_some();
    let is_const = sig.constness.is_some();

    let mut params = Vec::new();
    for arg in &sig.inputs {
        if let FnArg::Typed(pat_type) = arg {
            let param_name = match &*pat_type.pat {
                Pat::Ident(pat_ident) => pat_ident.ident.to_string(),
                _ => "arg".to_string(),
            };
            let type_str = quote::quote!(#pat_type.ty).to_string();
            params.push(RustParamMeta {
                name: param_name,
                type_str,
            });
        }
    }

    let mut return_type = None;
    let mut is_result = false;
    let mut is_option = false;

    if let ReturnType::Type(_, ty) = &sig.output {
        let ret_str = quote::quote!(#ty).to_string();
        if ret_str.contains("Result") {
            is_result = true;
        }
        if ret_str.contains("Option") {
            is_option = true;
        }
        return_type = Some(ret_str);
    }

    RustFunctionMeta {
        name: fn_name,
        is_pub,
        is_async,
        is_const,
        params,
        return_type,
        is_result,
        is_option,
        line_number,
    }
}
