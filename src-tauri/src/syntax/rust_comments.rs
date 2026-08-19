/**
 * rust_comments.rs - Rust-specific comment handling
 * Implements line comment and block comment toggling for Rust code
 */

pub struct RustCommenter;

impl RustCommenter {
    /// Toggle line comment (//) on a single line
    pub fn toggle_line_comment(line: &str) -> String {
        let trimmed = line.trim_start();
        
        if trimmed.starts_with("//") {
            // Remove comment
            let after_comment = trimmed[2..].trim_start();
            let indent = line.chars().take_while(|c| c.is_whitespace()).collect::<String>();
            format!("{}{}", indent, after_comment)
        } else {
            // Add comment
            let indent = line.chars().take_while(|c| c.is_whitespace()).collect::<String>();
            format!("{}// {}", indent, trimmed)
        }
    }

    /// Toggle line comment on multiple lines
    pub fn toggle_line_comments(lines: &[String], start_line: usize, end_line: usize) -> Vec<String> {
        let mut result = lines.to_vec();
        
        for i in start_line..=end_line.min(lines.len() - 1) {
            result[i] = Self::toggle_line_comment(&result[i]);
        }
        
        result
    }

    /// Toggle block comment (/* */) on a selection
    pub fn toggle_block_comment(lines: &[String], start_line: usize, end_line: usize) -> Vec<String> {
        let mut result = lines.to_vec();
        
        if start_line == end_line {
            // Single line - wrap in block comment
            let line = &result[start_line];
            let trimmed = line.trim();
            
            if trimmed.starts_with("/*") && trimmed.ends_with("*/") {
                // Remove block comment
                let inner = trimmed[2..trimmed.len() - 2].trim();
                let indent = line.chars().take_while(|c| c.is_whitespace()).collect::<String>();
                result[start_line] = format!("{}{}", indent, inner);
            } else {
                // Add block comment
                let indent = line.chars().take_while(|c| c.is_whitespace()).collect::<String>();
                result[start_line] = format!("{}/* {} */", indent, trimmed);
            }
        } else {
            // Multi-line - check if already has block comment
            let first_line = result[start_line].trim();
            let last_line = result[end_line].trim();
            
            if first_line.starts_with("/*") && last_line.ends_with("*/") {
                // Remove block comment
                let first_indent = result[start_line].chars().take_while(|c| c.is_whitespace()).collect::<String>();
                let last_indent = result[end_line].chars().take_while(|c| c.is_whitespace()).collect::<String>();
                
                result[start_line] = format!("{}{}", first_indent, first_line[2..].trim_start());
                result[end_line] = format!("{}{}", last_indent, last_line[..last_line.len() - 2].trim_end());
            } else {
                // Add block comment
                let first_indent = result[start_line].chars().take_while(|c| c.is_whitespace()).collect::<String>();
                let last_indent = result[end_line].chars().take_while(|c| c.is_whitespace()).collect::<String>();
                
                result[start_line] = format!("{}/* {}", first_indent, result[start_line].trim());
                result[end_line] = format!("{} */{}", last_indent, result[end_line].trim());
            }
        }
        
        result
    }

    /// Check if a line is a comment
    pub fn is_comment(line: &str) -> bool {
        let trimmed = line.trim();
        trimmed.starts_with("//") || trimmed.starts_with("/*") || trimmed.starts_with("*")
    }

    /// Get the comment type of a line
    pub fn get_comment_type(line: &str) -> Option<&'static str> {
        let trimmed = line.trim();
        if trimmed.starts_with("//") {
            Some("line")
        } else if trimmed.starts_with("/*") {
            Some("block_start")
        } else if trimmed.starts_with("*") && !trimmed.starts_with("*/") {
            Some("block_middle")
        } else if trimmed.starts_with("*/") {
            Some("block_end")
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_toggle_line_comment_add() {
        let line = "let x = 1;";
        let result = RustCommenter::toggle_line_comment(line);
        assert_eq!(result, "// let x = 1;");
    }

    #[test]
    fn test_toggle_line_comment_remove() {
        let line = "// let x = 1;";
        let result = RustCommenter::toggle_line_comment(line);
        assert_eq!(result, "let x = 1;");
    }

    #[test]
    fn test_toggle_line_comment_with_indent() {
        let line = "    let x = 1;";
        let result = RustCommenter::toggle_line_comment(line);
        assert_eq!(result, "    // let x = 1;");
    }

    #[test]
    fn test_toggle_block_comment_single_line() {
        let lines = vec!["let x = 1;".to_string()];
        let result = RustCommenter::toggle_block_comment(&lines, 0, 0);
        assert_eq!(result[0], "/* let x = 1; */");
    }

    #[test]
    fn test_toggle_block_comment_remove_single_line() {
        let lines = vec!["/* let x = 1; */".to_string()];
        let result = RustCommenter::toggle_block_comment(&lines, 0, 0);
        assert_eq!(result[0], "let x = 1;");
    }

    #[test]
    fn test_is_comment() {
        assert!(RustCommenter::is_comment("// comment"));
        assert!(RustCommenter::is_comment("/* comment */"));
        assert!(RustCommenter::is_comment("* comment"));
        assert!(!RustCommenter::is_comment("let x = 1;"));
    }

    #[test]
    fn test_get_comment_type() {
        assert_eq!(RustCommenter::get_comment_type("// comment"), Some("line"));
        assert_eq!(RustCommenter::get_comment_type("/* comment */"), Some("block_start"));
        assert_eq!(RustCommenter::get_comment_type("* comment"), Some("block_middle"));
        assert_eq!(RustCommenter::get_comment_type("*/"), Some("block_end"));
        assert_eq!(RustCommenter::get_comment_type("let x = 1;"), None);
    }
}
