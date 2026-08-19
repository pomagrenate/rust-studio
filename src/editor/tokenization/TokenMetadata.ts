import { TokenKind } from '../../types/contracts';

// Mirrors the constants in Rust metadata.rs
export const MetadataConsts = {
	LANGUAGEID_MASK: 0b00000000_00000000_00000000_11111111,
	TOKEN_TYPE_MASK: 0b00000000_00000000_00000011_00000000,
	BALANCED_BRACKETS_MASK: 0b00000000_00000000_00000100_00000000,
	FONT_STYLE_MASK: 0b00000000_00000000_01111000_00000000,
	FOREGROUND_MASK: 0b00000000_11111111_10000000_00000000,
	BACKGROUND_MASK: 0b11111111_00000000_00000000_00000000,

	LANGUAGEID_OFFSET: 0,
	TOKEN_TYPE_OFFSET: 8,
	BALANCED_BRACKETS_OFFSET: 10,
	FONT_STYLE_OFFSET: 11,
	FOREGROUND_OFFSET: 15,
	BACKGROUND_OFFSET: 24,
};

export class TokenMetadata {
    /**
     * Extracts the Foreground ID (TokenKind) from the 32-bit metadata
     */
	public static getForeground(metadata: number): TokenKind {
		return (metadata & MetadataConsts.FOREGROUND_MASK) >>> MetadataConsts.FOREGROUND_OFFSET;
	}
}
