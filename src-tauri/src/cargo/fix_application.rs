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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::buffer::RopeBuffer;

    #[test]
    fn test_is_machine_applicable_and_filter() {
        let sug1 = CodeSuggestion {
            range: DiagnosticRange { start_line: 0, start_character: 0, end_line: 0, end_character: 1 },
            replacement: "_a".into(),
            applicability: "MachineApplicable".into(),
        };
        let sug2 = CodeSuggestion {
            range: DiagnosticRange { start_line: 1, start_character: 0, end_line: 1, end_character: 1 },
            replacement: "b".into(),
            applicability: "MaybeIncorrect".into(),
        };
        let sug3 = CodeSuggestion {
            range: DiagnosticRange { start_line: 2, start_character: 0, end_line: 2, end_character: 1 },
            replacement: "c".into(),
            applicability: "HasPlaceholders".into(),
        };

        assert!(is_machine_applicable(&sug1));
        assert!(!is_machine_applicable(&sug2));
        assert!(!is_machine_applicable(&sug3));

        let all = vec![sug1, sug2, sug3];
        let filtered = filter_machine_applicable(&all);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].replacement, "_a");
    }

    #[test]
    fn test_apply_compiler_suggestion_replacement() {
        let mut buffer = RopeBuffer::from_str("fn main() {\n    let x = 10;\n}");
        let suggestion = CodeSuggestion {
            range: DiagnosticRange {
                start_line: 1,
                start_character: 8,
                end_line: 1,
                end_character: 9,
            },
            replacement: "_x".to_string(),
            applicability: "MachineApplicable".to_string(),
        };

        apply_compiler_suggestion(&mut buffer, &suggestion).unwrap();
        assert_eq!(buffer.to_string(), "fn main() {\n    let _x = 10;\n}");
    }

    #[test]
    fn test_apply_compiler_suggestion_insertion() {
        let mut buffer = RopeBuffer::from_str("fn main() {\n    let mut x = 10;\n}");
        let suggestion = CodeSuggestion {
            range: DiagnosticRange {
                start_line: 1,
                start_character: 19,
                end_line: 1,
                end_character: 19,
            },
            replacement: "; // unused".to_string(),
            applicability: "MachineApplicable".to_string(),
        };

        apply_compiler_suggestion(&mut buffer, &suggestion).unwrap();
        assert_eq!(buffer.to_string(), "fn main() {\n    let mut x = 10;; // unused\n}");
    }

    #[test]
    fn test_apply_compiler_suggestion_deletion() {
        let mut buffer = RopeBuffer::from_str("fn main() {\n    let mut x = 10;\n}");
        let suggestion = CodeSuggestion {
            range: DiagnosticRange {
                start_line: 1,
                start_character: 8,
                end_line: 1,
                end_character: 12,
            },
            replacement: "".to_string(),
            applicability: "MachineApplicable".to_string(),
        };

        apply_compiler_suggestion(&mut buffer, &suggestion).unwrap();
        assert_eq!(buffer.to_string(), "fn main() {\n    let x = 10;\n}");
    }

    #[test]
    fn test_apply_compiler_suggestion_multiline() {
        let mut buffer = RopeBuffer::from_str("fn main() {\n    println!(\"hello\");\n    println!(\"world\");\n}");
        let suggestion = CodeSuggestion {
            range: DiagnosticRange {
                start_line: 1,
                start_character: 4,
                end_line: 2,
                end_character: 22,
            },
            replacement: "// cleared lines".to_string(),
            applicability: "MachineApplicable".to_string(),
        };

        apply_compiler_suggestion(&mut buffer, &suggestion).unwrap();
        assert_eq!(buffer.to_string(), "fn main() {\n    // cleared lines\n}");
    }
}
