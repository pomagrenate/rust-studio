/// syntax/metadata.rs
/// 
/// VS Code compatible 32-bit token metadata packing.
/// This matches encodedTokenAttributes.ts logic.

pub const LANGUAGEID_OFFSET: u32 = 0;
pub const TOKEN_TYPE_OFFSET: u32 = 8;
pub const BALANCED_BRACKETS_OFFSET: u32 = 10;
pub const FONT_STYLE_OFFSET: u32 = 11;
pub const FOREGROUND_OFFSET: u32 = 15;
pub const BACKGROUND_OFFSET: u32 = 24;

pub const LANGUAGEID_MASK: u32 = 0b00000000_00000000_00000000_11111111;
pub const TOKEN_TYPE_MASK: u32 = 0b00000000_00000000_00000011_00000000;
pub const BALANCED_BRACKETS_MASK: u32 = 0b00000000_00000000_00000100_00000000;
pub const FONT_STYLE_MASK: u32 = 0b00000000_00000000_01111000_00000000;
pub const FOREGROUND_MASK: u32 = 0b00000000_11111111_10000000_00000000;
pub const BACKGROUND_MASK: u32 = 0b11111111_00000000_00000000_00000000;

#[repr(u8)]
pub enum StandardTokenType {
    Other = 0,
    Comment = 1,
    String = 2,
    RegEx = 3,
}

#[repr(u8)]
pub enum FontStyle {
    None = 0,
    Italic = 1,
    Bold = 2,
    Underline = 4,
    Strikethrough = 8,
}

/// A frontend-friendly TokenKind mapped to the ColorMap foreground ID.
/// (Corresponds to TokenKind in TS)
#[repr(u32)]
pub enum TokenKind {
    Plain = 0,
    Keyword = 1,
    String = 2,
    Number = 3,
    Comment = 4,
    Function = 5,
    Type = 6,
    Variable = 7,
    Operator = 8,
    Punctuation = 9,
}

pub struct TokenMetadata;

impl TokenMetadata {
    #[inline]
    pub fn pack(
        language_id: u32,
        token_type: StandardTokenType,
        font_style: u32,
        foreground_id: u32,
        background_id: u32,
    ) -> u32 {
        let mut metadata = 0;
        metadata |= (language_id << LANGUAGEID_OFFSET) & LANGUAGEID_MASK;
        metadata |= ((token_type as u32) << TOKEN_TYPE_OFFSET) & TOKEN_TYPE_MASK;
        metadata |= (font_style << FONT_STYLE_OFFSET) & FONT_STYLE_MASK;
        metadata |= (foreground_id << FOREGROUND_OFFSET) & FOREGROUND_MASK;
        metadata |= (background_id << BACKGROUND_OFFSET) & BACKGROUND_MASK;
        metadata
    }

    #[inline]
    pub fn pack_simple(kind: TokenKind) -> u32 {
        Self::pack(0, StandardTokenType::Other, FontStyle::None as u32, kind as u32, 0)
    }
}
