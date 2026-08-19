export interface RenderLine {
  lineNumber: number;
  text: string;
  tokens: number[];
}

export enum TokenKind {
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
