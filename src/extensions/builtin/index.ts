/**
 * extensions/builtin/index.ts
 * Initializes and registers all built-in extensions into the ExtensionRegistry.
 */

import { extensionRegistry } from "../extensionRegistry";
import { GitSCMProvider } from "./git/GitSCMProvider";
import { BuiltinSymbolProvider } from "./outline/SymbolProvider";
import { GitTimelineProvider } from "./timeline/GitTimelineProvider";
import { IExtension } from "../types";

export const GitExtension: IExtension = {
  id: "pomai.git",
  name: "Git Extension",
  activate(context) {
    const gitProvider = new GitSCMProvider();
    context.registerSCMProvider(gitProvider);

    const timelineProvider = new GitTimelineProvider();
    context.registerTimelineProvider(timelineProvider);
  },
};

export const OutlineExtension: IExtension = {
  id: "pomai.outline",
  name: "Document Symbol Outline",
  activate(context) {
    const symbolProvider = new BuiltinSymbolProvider();
    context.registerDocumentSymbolProvider(symbolProvider);
  },
};

export async function activateBuiltinExtensions(): Promise<void> {
  await extensionRegistry.registerExtension(GitExtension);
  await extensionRegistry.registerExtension(OutlineExtension);
}
