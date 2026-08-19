/**
 * extensions/builtin/outline/SymbolProvider.ts
 * Built-in Document Symbol Provider extension for Outline view.
 */

import { IDocumentSymbolProvider, IDocumentSymbol } from "../../types";
import { parseDocumentSymbols } from "../../../components/outline/symbolParser";

export class BuiltinSymbolProvider implements IDocumentSymbolProvider {
  public readonly id = "builtin-symbol-provider";
  public readonly selector = ["ts", "tsx", "js", "jsx", "rs", "py", "md", "css", "json", "html"];

  async provideDocumentSymbols(path: string, lines: string[]): Promise<IDocumentSymbol[]> {
    const rawSymbols = parseDocumentSymbols(path, lines);

    const mapSymbol = (s: typeof rawSymbols[0]): IDocumentSymbol => ({
      name: s.name,
      kind: s.kind as IDocumentSymbol["kind"],
      line: s.line,
      col: s.col,
      children: s.children ? s.children.map(mapSymbol) : undefined,
    });

    return rawSymbols.map(mapSymbol);
  }
}
