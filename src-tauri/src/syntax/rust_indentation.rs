/**
 * rust_indentation.rs - Rust-specific smart indentation
 * Implements automatic indentation for Rust code structures
 */

#[derive(Debug, Clone, PartialEq)]
pub enum IndentAction {
    /// Increase indentation by one level
    Increase,
    /// Decrease indentation by one level
    Decrease,
    /// Keep current indentation
    Same,
    /// No indentation (for closing braces)
    None,
}

#[derive(Debug, Clone)]
pub struct IndentRule {
    /// Pattern to match at end of previous line
    pub pattern: String,
    /// Action to take
    pub action: IndentAction,
    /// Optional pattern to match at start of current line
    pub current_line_pattern: Option<String>,
}

pub struct RustIndenter {
    rules: Vec<IndentRule>,
    indent_size: usize,
}

impl RustIndenter {
    pub fn new(indent_size: usize) -> Self {
        let mut indenter = Self {
            rules: Vec::new(),
            indent_size,
        };
        indenter.init_rules();
        indenter
    }

    fn init_rules(&mut self) {
        // Block opening keywords
        self.rules.push(IndentRule {
            pattern: r"\bfn\b".to_string(),
            action: IndentAction::Increase,
            current_line_pattern: None,
        });
        self.rules.push(IndentRule {
            pattern: r"\bstruct\b".to_string(),
            action: IndentAction::Increase,
            current_line_pattern: None,
        });
        self.rules.push(IndentRule {
            pattern: r"\benum\b".to_string(),
            action: IndentAction::Increase,
            current_line_pattern: None,
        });
        self.rules.push(IndentRule {
            pattern: r"\bimpl\b".to_string(),
            action: IndentAction::Increase,
            current_line_pattern: None,
        });
        self.rules.push(IndentRule {
            pattern: r"\btrait\b".to_string(),
            action: IndentAction::Increase,
            current_line_pattern: None,
        });
        self.rules.push(IndentRule {
            pattern: r"\bmod\b".to_string(),
            action: IndentAction::Increase,
            current_line_pattern: None,
        });
        self.rules.push(IndentRule {
            pattern: r"\bmatch\b".to_string(),
            action: IndentAction::Increase,
            current_line_pattern: None,
        });
        self.rules.push(IndentRule {
            pattern: r"\bloop\b".to_string(),
            action: IndentAction::Increase,
            current_line_pattern: None,
        });
        self.rules.push(IndentRule {
            pattern: r"\bwhile\b".to_string(),
            action: IndentAction::Increase,
            current_line_pattern: None,
        });
        self.rules.push(IndentRule {
            pattern: r"\bfor\b".to_string(),
            action: IndentAction::Increase,
            current_line_pattern: None,
        });
        self.rules.push(IndentRule {
            pattern: r"\bif\b".to_string(),
            action: IndentAction::Increase,
            current_line_pattern: None,
        });
        self.rules.push(IndentRule {
            pattern: r"\belse\b".to_string(),
            action: IndentAction::Same,
            current_line_pattern: None,
        });
        self.rules.push(IndentRule {
            pattern: r"\bel(if)\b".to_string(),
            action: IndentAction::Same,
            current_line_pattern: None,
        });

        // Opening braces
        self.rules.push(IndentRule {
            pattern: r"\{$".to_string(),
            action: IndentAction::Increase,
            current_line_pattern: None,
        });

        // Closing braces
        self.rules.push(IndentRule {
            pattern: r"^\s*\}".to_string(),
            action: IndentAction::Decrease,
            current_line_pattern: None,
        });

        // Match arms
        self.rules.push(IndentRule {
            pattern: r"=>".to_string(),
            action: IndentAction::Increase,
            current_line_pattern: None,
        });
    }

    /// Calculate indentation for a new line based on previous line
    pub fn get_indent_for_new_line(&self, previous_line: &str, current_indent: usize) -> String {
        let mut new_indent = current_indent;

        // Check rules against previous line
        for rule in &self.rules {
            if self.matches_pattern(previous_line, &rule.pattern) {
                match rule.action {
                    IndentAction::Increase => {
                        new_indent += self.indent_size;
                    }
                    IndentAction::Decrease => {
                        new_indent = new_indent.saturating_sub(self.indent_size);
                    }
                    IndentAction::Same => {}
                    IndentAction::None => {
                        new_indent = 0;
                    }
                }
                break;
            }
        }

        // Check if previous line ends with opening brace
        if previous_line.trim_end().ends_with('{') {
            new_indent += self.indent_size;
        }

        // Check if previous line ends with opening parenthesis (for multi-line function calls)
        if previous_line.trim_end().ends_with('(') || previous_line.trim_end().ends_with('[') {
            new_indent += self.indent_size;
        }

        " ".repeat(new_indent)
    }

    /// Calculate indentation for an existing line based on context
    pub fn get_indent_for_line(&self, line: &str, previous_line: &str, previous_indent: usize) -> String {
        let mut indent = previous_indent;

        // If line starts with closing brace, decrease indent
        if line.trim_start().starts_with('}') || line.trim_start().starts_with(']') || line.trim_start().starts_with(')') {
            indent = indent.saturating_sub(self.indent_size);
        }

        // Check if previous line ends with opening brace
        if previous_line.trim_end().ends_with('{') {
            indent += self.indent_size;
        }

        " ".repeat(indent)
    }

    /// Check if a line matches a pattern
    fn matches_pattern(&self, line: &str, pattern: &str) -> bool {
        if pattern.starts_with('^') {
            // Match at start of line
            let trimmed = line.trim_start();
            trimmed.starts_with(&pattern[1..])
        } else if pattern.ends_with('$') {
            // Match at end of line
            let trimmed = line.trim_end();
            trimmed.ends_with(&pattern[..pattern.len() - 1])
        } else {
            // Match anywhere in line
            line.contains(pattern)
        }
    }

    /// Get the current indentation level of a line
    pub fn get_indent_level(&self, line: &str) -> usize {
        line.chars().take_while(|c| c.is_whitespace()).count()
    }

    /// Create an indentation string of the given level
    pub fn indent_string(&self, level: usize) -> String {
        " ".repeat(level * self.indent_size)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fn_indent() {
        let indenter = RustIndenter::new(4);
        let indent = indenter.get_indent_for_new_line("fn main() {", 0);
        assert_eq!(indent, "    "); // 4 spaces
    }

    #[test]
    fn test_struct_indent() {
        let indenter = RustIndenter::new(4);
        let indent = indenter.get_indent_for_new_line("struct Point {", 0);
        assert_eq!(indent, "    ");
    }

    #[test]
    fn test_closing_brace() {
        let indenter = RustIndenter::new(4);
        let indent = indenter.get_indent_for_line("}", "    let x = 1;", 4);
        assert_eq!(indent, ""); // 0 spaces
    }

    #[test]
    fn test_match_indent() {
        let indenter = RustIndenter::new(4);
        let indent = indenter.get_indent_for_new_line("match x {", 0);
        assert_eq!(indent, "    ");
    }

    #[test]
    fn test_else_indent() {
        let indenter = RustIndenter::new(4);
        let indent = indenter.get_indent_for_new_line("} else {", 4);
        assert_eq!(indent, "        "); // 4 current + 4 for block opening brace = 8 spaces
    }
}
