/**
 * extensions/extensionRegistry.ts
 * Central registry for SCM, Outline, Timeline, and future extensions.
 */

import {
  IExtension,
  IExtensionContext,
  ISCMProvider,
  ISCMRepository,
  IDocumentSymbolProvider,
  IDocumentSymbol,
  ITimelineProvider,
  ITimelineItem,
} from "./types";

class ExtensionRegistry {
  private scmProviders = new Map<string, ISCMProvider>();
  private symbolProviders = new Map<string, IDocumentSymbolProvider>();
  private timelineProviders = new Map<string, ITimelineProvider>();
  private extensions = new Map<string, IExtension>();

  // SCM Providers
  registerSCMProvider(provider: ISCMProvider): () => void {
    this.scmProviders.set(provider.id, provider);
    return () => {
      this.scmProviders.delete(provider.id);
    };
  }

  getSCMProvider(id: string): ISCMProvider | undefined {
    return this.scmProviders.get(id);
  }

  getAllSCMProviders(): ISCMProvider[] {
    return Array.from(this.scmProviders.values());
  }

  async getRepositoryForWorkspace(rootUri: string): Promise<ISCMRepository | null> {
    for (const provider of this.scmProviders.values()) {
      const repo = await provider.createRepository(rootUri);
      if (repo) return repo;
    }
    return null;
  }

  // Symbol / Outline Providers
  registerDocumentSymbolProvider(provider: IDocumentSymbolProvider): () => void {
    this.symbolProviders.set(provider.id, provider);
    return () => {
      this.symbolProviders.delete(provider.id);
    };
  }

  async getDocumentSymbols(path: string, lines: string[]): Promise<IDocumentSymbol[]> {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    for (const provider of this.symbolProviders.values()) {
      if (provider.selector.includes(ext) || provider.selector.includes('*')) {
        try {
          return await provider.provideDocumentSymbols(path, lines);
        } catch (e) {
          console.error(`Provider ${provider.id} error:`, e);
        }
      }
    }
    return [];
  }

  // Timeline Providers
  registerTimelineProvider(provider: ITimelineProvider): () => void {
    this.timelineProviders.set(provider.id, provider);
    return () => {
      this.timelineProviders.delete(provider.id);
    };
  }

  async getTimeline(filePath: string): Promise<ITimelineItem[]> {
    const items: ITimelineItem[] = [];
    for (const provider of this.timelineProviders.values()) {
      try {
        const res = await provider.provideTimeline(filePath);
        items.push(...res);
      } catch (e) {
        console.error(`Timeline Provider ${provider.id} error:`, e);
      }
    }
    return items.sort((a, b) => b.timestamp - a.timestamp);
  }

  // Extension Lifecycle
  async registerExtension(extension: IExtension): Promise<void> {
    if (this.extensions.has(extension.id)) return;
    this.extensions.set(extension.id, extension);

    const context: IExtensionContext = {
      registerSCMProvider: this.registerSCMProvider.bind(this),
      registerDocumentSymbolProvider: this.registerDocumentSymbolProvider.bind(this),
      registerTimelineProvider: this.registerTimelineProvider.bind(this),
    };

    await extension.activate(context);
  }
}

export const extensionRegistry = new ExtensionRegistry();
