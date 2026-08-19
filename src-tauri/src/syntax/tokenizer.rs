use super::metadata::{TokenMetadata, TokenKind};

/// A highly simplified mock tokenizer for phase 1.
/// Real implementation would use Tree-sitter or syntect.
pub fn tokenize_line(text: &str) -> Vec<u32> {
    let mut tokens = Vec::new();
    
    // Very naive tokenization for demo purposes:
    // Split by whitespace/boundaries and assign TokenKinds based on match.
    // In a real tokenizer, this operates on characters and maintains a state stack.

    // To make it simple, we will just use a generic regex-like search or basic string matching.
    // We'll scan the string character by character for simplicity of yielding byte indices.

    let mut current_word = String::new();
    let mut word_start = 0;
    
    let chars: Vec<(usize, char)> = text.char_indices().collect();
    let mut i = 0;

    let keywords = ["import", "export", "function", "const", "let", "var", "return", "from"];
    let types = ["React", "State", "HTMLElement", "String", "number"];
    let operators = ['=', '+', '-', '*', '/', '<', '>', '!', '&', '|'];
    let punctuation = ['{', '}', '(', ')', '[', ']', ';', ',', '.', ':'];

    // If it's a comment line (starts with //), color it all as comment
    let trimmed = text.trim_start();
    if trimmed.starts_with("//") {
        tokens.push(0);
        tokens.push(TokenMetadata::pack_simple(TokenKind::Comment));
        return tokens;
    }

    while i < chars.len() {
        let (idx, c) = chars[i];

        if c.is_whitespace() || operators.contains(&c) || punctuation.contains(&c) || c == '"' || c == '\'' {
            // Process the accumulated word if any
            if !current_word.is_empty() {
                let kind = if keywords.contains(&current_word.as_str()) {
                    TokenKind::Keyword
                } else if types.contains(&current_word.as_str()) {
                    TokenKind::Type
                } else if current_word.parse::<f64>().is_ok() {
                    TokenKind::Number
                } else {
                    // Check if it's followed by '(' to loosely identify functions
                    let next_non_ws = chars.iter().skip(i).find(|(_, nc)| !nc.is_whitespace());
                    if let Some((_, '(')) = next_non_ws {
                        TokenKind::Function
                    } else {
                        TokenKind::Plain
                    }
                };

                tokens.push(word_start as u32);
                tokens.push(TokenMetadata::pack_simple(kind));
                current_word.clear();
            }

            // Process the current boundary character
            if c == '"' || c == '\'' {
                // Parse string literal
                let quote = c;
                tokens.push(idx as u32);
                tokens.push(TokenMetadata::pack_simple(TokenKind::String));
                
                i += 1;
                while i < chars.len() {
                    let (_, nc) = chars[i];
                    if nc == quote {
                        break;
                    }
                    i += 1;
                }
                
                // End of string is reached (inclusive of closing quote)
                // Next iteration will push a plain token starting after quote, if not handled here.
                // We'll let the main loop continue. But we need to ensure the next token knows where to start.
                if i + 1 < chars.len() {
                    tokens.push((chars[i].0 + 1) as u32);
                    tokens.push(TokenMetadata::pack_simple(TokenKind::Plain));
                }
            } else if operators.contains(&c) {
                tokens.push(idx as u32);
                tokens.push(TokenMetadata::pack_simple(TokenKind::Operator));
                
                // Plain token follows
                if i + 1 < chars.len() {
                    tokens.push((idx + c.len_utf8()) as u32);
                    tokens.push(TokenMetadata::pack_simple(TokenKind::Plain));
                }
            } else if punctuation.contains(&c) {
                tokens.push(idx as u32);
                tokens.push(TokenMetadata::pack_simple(TokenKind::Punctuation));
                
                if i + 1 < chars.len() {
                    tokens.push((idx + c.len_utf8()) as u32);
                    tokens.push(TokenMetadata::pack_simple(TokenKind::Plain));
                }
            } else if c.is_whitespace() {
                // Just let it be part of the plain token sequence, no new token required unless we care
            }
            
            word_start = idx + c.len_utf8();
        } else {
            if current_word.is_empty() {
                word_start = idx;
            }
            current_word.push(c);
        }

        i += 1;
    }

    // Process remainder
    if !current_word.is_empty() {
        let kind = if keywords.contains(&current_word.as_str()) {
            TokenKind::Keyword
        } else if types.contains(&current_word.as_str()) {
            TokenKind::Type
        } else if current_word.parse::<f64>().is_ok() {
            TokenKind::Number
        } else {
            TokenKind::Plain
        };
        tokens.push(word_start as u32);
        tokens.push(TokenMetadata::pack_simple(kind));
    }

    // Optimization: VS Code merges adjacent tokens with identical metadata.
    let mut optimized_tokens = Vec::with_capacity(tokens.len());
    let mut last_metadata = None;

    for chunk in tokens.chunks_exact(2) {
        let start_idx = chunk[0];
        let metadata = chunk[1];
        
        if last_metadata != Some(metadata) {
            optimized_tokens.push(start_idx);
            optimized_tokens.push(metadata);
            last_metadata = Some(metadata);
        }
    }

    optimized_tokens
}
