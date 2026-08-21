/// document/mod.rs — Document registry and Document model.

pub mod document;
pub mod registry;
#[cfg(test)]
mod tests;

pub use document::{Document, DocumentInfo, EolStyle, Encoding};
pub use registry::DocumentRegistry;
