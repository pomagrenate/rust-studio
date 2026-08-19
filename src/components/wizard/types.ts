/**
 * wizard/types.ts
 * Type definitions for the Rich Framework Templates New Project Wizard.
 */

export type TemplateCategory = "All" | "Basic" | "Desktop" | "Web Backend" | "Wasm/Frontend";

export interface ProjectTemplate {
  id: string;
  name: string;
  category: "Basic" | "Desktop" | "Web Backend" | "Wasm/Frontend";
  description: string;
  badge?: string;
  tags: string[];
  defaultName: string;
  setupCommands: string[]; // Real CLI commands with {name} placeholder
  features: string[];
}
