pub mod process_manager;
pub mod diagnostic_mapper;
pub mod fix_application;

#[cfg(test)]
pub mod tests;

pub use process_manager::{CargoProcessManager, CargoCommand};
pub use diagnostic_mapper::{CargoDiagnostic, DiagnosticSeverity, DiagnosticRange, CodeSuggestion};
pub use fix_application::{apply_compiler_suggestion, filter_machine_applicable};
