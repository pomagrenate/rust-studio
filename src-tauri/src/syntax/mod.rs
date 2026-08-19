pub mod tokenizer;
pub mod metadata;
pub mod types;
pub mod parser;
pub mod highlighter;

pub use tokenizer::tokenize_line;
pub use metadata::TokenMetadata;
pub use types::{HighlightToken, HighlightResult, TextEdit};
pub use parser::SyntaxEngine;
pub use highlighter::{build_rust_highlight_config, highlight_source};
