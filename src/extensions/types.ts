/**
 * extensions/types.ts
 * Generic contracts for Extension & Provider architecture in Pomai Studio.
 */

// ── SCM (Source Control Management) ──

export interface ISCMResource {
  path: string;
  filename: string;
  status: string; // "M" | "A" | "D" | "R" | "U"
  staged: boolean;
}

export interface ISCMResourceGroup {
  id: string; // "staged" | "changes"
  label: string;
  resources: ISCMResource[];
}

export interface ISCMHistoryItem {
  hash: string;
  parents: string[];
  refs: string[];
  message: string;
  author: string;
  relativeDate: string;
  isHead: boolean;
  remoteRef?: string;
  localRef?: string;
}

export interface ISCMStashItem {
  index: number;
  name: string;
  branch: string;
  message: string;
}

export interface ISCMCommitDetail {
  hash: string;
  author: string;
  date: string;
  message: string;
  files: ISCMResource[];
}

export interface ISCMRepositoryState {
  isRepo: boolean;
  branch: string;
  ahead: number;
  behind: number;
  stagedChanges: ISCMResource[];
  unstagedChanges: ISCMResource[];
  conflictedChanges: ISCMResource[];
  hasConflicts: boolean;
  history: ISCMHistoryItem[];
  stashes: ISCMStashItem[];
  isLoading: boolean;
}

export interface ISCMRepository {
  id: string;
  providerId: string;
  rootUri: string;
  getState(): ISCMRepositoryState;
  subscribe(listener: (state: ISCMRepositoryState) => void): () => void;
  refresh(): Promise<void>;
  stage(paths: string[]): Promise<void>;
  unstage(paths: string[]): Promise<void>;
  stageAll(): Promise<void>;
  unstageAll(): Promise<void>;
  discard(paths: string[]): Promise<void>;
  discardAll(): Promise<void>;
  commit(message: string): Promise<void>;
  sync(): Promise<void>;
  fetch(): Promise<void>;
  stashSave(message?: string): Promise<void>;
  stashPop(): Promise<void>;
  checkoutOurs(path: string): Promise<void>;
  checkoutTheirs(path: string): Promise<void>;
  abortMerge(): Promise<void>;
  getCommitDetails(hash: string): Promise<ISCMCommitDetail>;
  initRepo(): Promise<void>;
  getBranches(): Promise<string[]>;
  checkoutBranch(branchName: string): Promise<void>;
  createBranch(branchName: string): Promise<void>;
}

export interface ISCMProvider {
  id: string;
  label: string;
  createRepository(rootUri: string): Promise<ISCMRepository | null>;
}

// ── Document Symbols / Outline ──

export type SymbolKind = 
  | "function" 
  | "method" 
  | "class" 
  | "interface" 
  | "type" 
  | "variable" 
  | "property"
  | "constant" 
  | "struct" 
  | "enum" 
  | "module"
  | "heading"
  | "header"
  | "key";

export interface IDocumentSymbol {
  name: string;
  kind: SymbolKind;
  line: number;
  col: number;
  endLine?: number;
  children?: IDocumentSymbol[];
  containerName?: string;
}

export interface IDocumentSymbolProvider {
  id: string;
  selector: string[]; // file extensions supported, e.g. ["ts", "js", "rs", "py", "md", "css", "json"]
  provideDocumentSymbols(path: string, lines: string[]): Promise<IDocumentSymbol[]>;
}

// ── Timeline / File History ──

export interface ITimelineItem {
  id: string;
  label: string;
  detail: string;
  author: string;
  relativeDate: string;
  timestamp: number;
  icon?: string;
  source: "git" | "local-history";
}

export interface ITimelineProvider {
  id: string;
  label: string;
  provideTimeline(filePath: string): Promise<ITimelineItem[]>;
}

// ── Generic Extension Lifecycle ──

export interface IExtensionContext {
  registerSCMProvider(provider: ISCMProvider): () => void;
  registerDocumentSymbolProvider(provider: IDocumentSymbolProvider): () => void;
  registerTimelineProvider(provider: ITimelineProvider): () => void;
}

export interface IExtension {
  id: string;
  name: string;
  activate(context: IExtensionContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}
