/**
 * extensions/builtin/formatters/FormatterRegistry.ts
 * Formatter system supporting rustfmt for Rust and built-in formatters.
 */

import { CargoProvider } from "../rust/CargoProvider";

export interface ICodeFormatter {
  id: string;
  name: string;
  selector: string[]; // e.g. ["rs", "json", "toml", "md"]
  formatDocument(filePath: string, lines: string[], workspaceRoot?: string): Promise<string[]>;
}

export class RustfmtFormatter implements ICodeFormatter {
  public readonly id = "rustfmt";
  public readonly name = "Rustfmt (Cargo)";
  public readonly selector = ["rs"];

  async formatDocument(filePath: string, lines: string[], workspaceRoot?: string): Promise<string[]> {
    if (workspaceRoot && filePath) {
      await CargoProvider.format(workspaceRoot, filePath);
    }
    return lines;
  }
}

export class JsonTomlFormatter implements ICodeFormatter {
  public readonly id = "json-toml-formatter";
  public readonly name = "JSON / TOML Formatter";
  public readonly selector = ["json"];

  async formatDocument(_filePath: string, lines: string[]): Promise<string[]> {
    try {
      const parsed = JSON.parse(lines.join("\n"));
      return JSON.stringify(parsed, null, 2).split("\n");
    } catch {
      return lines;
    }
  }
}

class FormatterRegistry {
  private formatters: ICodeFormatter[] = [
    new RustfmtFormatter(),
    new JsonTomlFormatter(),
  ];

  registerFormatter(formatter: ICodeFormatter) {
    this.formatters.push(formatter);
  }

  async formatFile(filePath: string, lines: string[], workspaceRoot?: string): Promise<string[]> {
    const ext = filePath.split(".").pop()?.toLowerCase() || "";
    const formatter = this.formatters.find((f) => f.selector.includes(ext));
    if (!formatter) return lines;

    try {
      return await formatter.formatDocument(filePath, lines, workspaceRoot);
    } catch (e) {
      console.error(`Formatter ${formatter.name} failed:`, e);
      return lines;
    }
  }
}

export const formatterRegistry = new FormatterRegistry();
