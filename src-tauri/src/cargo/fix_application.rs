/**
 * fix_application.rs — Apply compiler suggestions to the rope buffer
 *
 * This module provides functionality to apply machine-applicable compiler
 * suggestions from cargo check to the document buffer atomically.
 */

use crate::buffer::{RopeBuffer, TextBuffer, EditRange, Position};
use crate::cargo::diagnostic_mapper::{CodeSuggestion, DiagnosticRange};

/// Apply a compiler suggestion to the document buffer
pub fn apply_compiler_suggestion(
    buffer: &mut RopeBuffer,
    suggestion: &CodeSuggestion,
) -> Result<(), String> {
    let range = convert_diagnostic_range_to_edit_range(&suggestion.range);
    
    // Calculate character indices manually since position_to_char_idx is private
    let start_idx = calculate_char_index(buffer, range.start);
    let end_idx = calculate_char_index(buffer, range.end);
    
    // Delete the old text (delete takes char_idx and len_chars)
    if start_idx < end_idx {
        let len = end_idx - start_idx;
        buffer.delete(start_idx, len);
    }
    
    // Insert the new text
    if !suggestion.replacement.is_empty() {
        buffer.insert(start_idx, &suggestion.replacement);
    }
    
    Ok(())
}

/// Calculate character index from position (manual implementation)
fn calculate_char_index(buffer: &RopeBuffer, pos: Position) -> usize {
    let line_start = buffer.line_to_char(pos.line);
    line_start + pos.column
}

/// Convert DiagnosticRange to EditRange
fn convert_diagnostic_range_to_edit_range(range: &DiagnosticRange) -> EditRange {
    EditRange {
        start: Position {
            line: range.start_line as usize,
            column: range.start_character as usize,
        },
        end: Position {
            line: range.end_line as usize,
            column: range.end_character as usize,
        },
    }
}

/// Check if a suggestion is machine-applicable
pub fn is_machine_applicable(suggestion: &CodeSuggestion) -> bool {
    suggestion.applicability == "MachineApplicable"
}

/// Filter suggestions to only machine-applicable ones
pub fn filter_machine_applicable(suggestions: &[CodeSuggestion]) -> Vec<CodeSuggestion> {
    suggestions
        .iter()
        .filter(|s| is_machine_applicable(s))
        .cloned()
        .collect()
}
