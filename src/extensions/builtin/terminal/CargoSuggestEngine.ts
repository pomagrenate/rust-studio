/**
 * CargoSuggestEngine.ts
 * High-performance Terminal Autocompletion & Suggestion Engine
 * Provides rich command, subcommand, flag, and dynamic workspace suggestions
 * for Cargo, Git, and Rust tools.
 */

export interface TerminalSuggestItem {
  label: string;
  insertText: string;
  detail: string;
  documentation?: string;
  kind: "command" | "subcommand" | "flag" | "target" | "branch";
  category: "cargo" | "git" | "rust";
}

export interface SuggestContext {
  binTargets?: string[];
  testNames?: string[];
  gitBranches?: string[];
}

// ── 1. Cargo Command Catalog ──
const CARGO_SUBCOMMANDS: TerminalSuggestItem[] = [
  { label: "build", insertText: "build", detail: "Compile the current package", kind: "subcommand", category: "cargo" },
  { label: "check", insertText: "check", detail: "Analyze package and report errors without building binary", kind: "subcommand", category: "cargo" },
  { label: "test", insertText: "test", detail: "Execute all unit, integration, and doc tests", kind: "subcommand", category: "cargo" },
  { label: "run", insertText: "run", detail: "Run a binary or example of the local package", kind: "subcommand", category: "cargo" },
  { label: "clippy", insertText: "clippy", detail: "Run lints and code quality checks", kind: "subcommand", category: "cargo" },
  { label: "fmt", insertText: "fmt", detail: "Format all Rust source code according to rustfmt", kind: "subcommand", category: "cargo" },
  { label: "add", insertText: "add", detail: "Add dependencies to Cargo.toml", kind: "subcommand", category: "cargo" },
  { label: "remove", insertText: "remove", detail: "Remove dependencies from Cargo.toml", kind: "subcommand", category: "cargo" },
  { label: "update", insertText: "update", detail: "Update dependencies listed in Cargo.lock", kind: "subcommand", category: "cargo" },
  { label: "tree", insertText: "tree", detail: "Display a tree visualization of dependency graph", kind: "subcommand", category: "cargo" },
  { label: "bench", insertText: "bench", detail: "Execute benchmarks", kind: "subcommand", category: "cargo" },
  { label: "clean", insertText: "clean", detail: "Remove generated artifacts in target/ directory", kind: "subcommand", category: "cargo" },
  { label: "doc", insertText: "doc", detail: "Build package documentation", kind: "subcommand", category: "cargo" },
  { label: "init", insertText: "init", detail: "Create a new cargo package in current directory", kind: "subcommand", category: "cargo" },
  { label: "new", insertText: "new", detail: "Create a new cargo package in a new directory", kind: "subcommand", category: "cargo" },
  { label: "publish", insertText: "publish", detail: "Package and upload this package to crates.io", kind: "subcommand", category: "cargo" },
];

const CARGO_FLAGS: Record<string, TerminalSuggestItem[]> = {
  build: [
    { label: "--release", insertText: "--release", detail: "Build with optimizations enabled", kind: "flag", category: "cargo" },
    { label: "--bin", insertText: "--bin ", detail: "Build only the specified binary", kind: "flag", category: "cargo" },
    { label: "--workspace", insertText: "--workspace", detail: "Build all members in the workspace", kind: "flag", category: "cargo" },
    { label: "--all-targets", insertText: "--all-targets", detail: "Build all targets (bins, tests, benches, examples)", kind: "flag", category: "cargo" },
    { label: "--target", insertText: "--target ", detail: "Build for the target triple", kind: "flag", category: "cargo" },
    { label: "--features", insertText: "--features ", detail: "Space or comma separated list of features to activate", kind: "flag", category: "cargo" },
    { label: "--all-features", insertText: "--all-features", detail: "Activate all available features", kind: "flag", category: "cargo" },
    { label: "--no-default-features", insertText: "--no-default-features", detail: "Do not activate the `default` feature", kind: "flag", category: "cargo" },
    { label: "--message-format", insertText: "--message-format json", detail: "Output compiler errors as JSON stream", kind: "flag", category: "cargo" },
  ],
  check: [
    { label: "--all-targets", insertText: "--all-targets", detail: "Check all targets (bins, tests, benches, examples)", kind: "flag", category: "cargo" },
    { label: "--workspace", insertText: "--workspace", detail: "Check all members in the workspace", kind: "flag", category: "cargo" },
    { label: "--release", insertText: "--release", detail: "Check with release optimizations profile", kind: "flag", category: "cargo" },
    { label: "--features", insertText: "--features ", detail: "Activate specific features", kind: "flag", category: "cargo" },
  ],
  test: [
    { label: "-- --nocapture", insertText: "-- --nocapture", detail: "Print test stdout and print statements in real time", kind: "flag", category: "cargo" },
    { label: "-- --exact", insertText: "-- --exact", detail: "Run only tests that exactly match the filter name", kind: "flag", category: "cargo" },
    { label: "--release", insertText: "--release", detail: "Run tests with release profile optimizations", kind: "flag", category: "cargo" },
    { label: "--no-run", insertText: "--no-run", detail: "Compile test binaries without executing them", kind: "flag", category: "cargo" },
    { label: "--doc", insertText: "--doc", detail: "Test only this library's documentation examples", kind: "flag", category: "cargo" },
    { label: "--workspace", insertText: "--workspace", detail: "Run tests for all workspace members", kind: "flag", category: "cargo" },
  ],
  run: [
    { label: "--release", insertText: "--release", detail: "Run with optimizations enabled", kind: "flag", category: "cargo" },
    { label: "--bin", insertText: "--bin ", detail: "Run the specified binary target", kind: "flag", category: "cargo" },
    { label: "--example", insertText: "--example ", detail: "Run the specified example", kind: "flag", category: "cargo" },
  ],
  clippy: [
    { label: "--fix", insertText: "--fix", detail: "Automatically apply clippy suggestion fixes to source code", kind: "flag", category: "cargo" },
    { label: "--allow-dirty", insertText: "--allow-dirty", detail: "Allow fixing even if git working directory is not clean", kind: "flag", category: "cargo" },
    { label: "-- -D warnings", insertText: "-- -D warnings", detail: "Treat all clippy warnings as compilation errors", kind: "flag", category: "cargo" },
  ],
  fmt: [
    { label: "--check", insertText: "--check", detail: "Check formatting and exit with code 1 if unformatted", kind: "flag", category: "cargo" },
    { label: "--all", insertText: "--all", detail: "Format all packages in the workspace", kind: "flag", category: "cargo" },
  ],
  doc: [
    { label: "--open", insertText: "--open", detail: "Open the generated docs in default browser", kind: "flag", category: "cargo" },
    { label: "--no-deps", insertText: "--no-deps", detail: "Do not build documentation for dependencies", kind: "flag", category: "cargo" },
  ],
  add: [
    { label: "--dev", insertText: "--dev", detail: "Add as development-only dependency", kind: "flag", category: "cargo" },
    { label: "--build", insertText: "--build", detail: "Add as build script dependency", kind: "flag", category: "cargo" },
    { label: "--features", insertText: "--features ", detail: "Enable specific crate features", kind: "flag", category: "cargo" },
  ],
};

// ── 2. Git Command Catalog ──
const GIT_SUBCOMMANDS: TerminalSuggestItem[] = [
  { label: "status", insertText: "status", detail: "Show working tree status", kind: "subcommand", category: "git" },
  { label: "checkout", insertText: "checkout", detail: "Switch branches or restore files", kind: "subcommand", category: "git" },
  { label: "commit", insertText: "commit -m \"\"", detail: "Record changes to repository", kind: "subcommand", category: "git" },
  { label: "pull", insertText: "pull", detail: "Fetch from and integrate with remote branch", kind: "subcommand", category: "git" },
  { label: "push", insertText: "push", detail: "Update remote refs along with associated objects", kind: "subcommand", category: "git" },
  { label: "branch", insertText: "branch", detail: "List, create, or delete branches", kind: "subcommand", category: "git" },
  { label: "diff", insertText: "diff", detail: "Show changes between commits, commit and working tree", kind: "subcommand", category: "git" },
  { label: "log", insertText: "log --oneline", detail: "Show commit logs", kind: "subcommand", category: "git" },
  { label: "stash", insertText: "stash", detail: "Stash changes in a dirty working directory", kind: "subcommand", category: "git" },
  { label: "add", insertText: "add .", detail: "Add file contents to the index", kind: "subcommand", category: "git" },
  { label: "fetch", insertText: "fetch --all", detail: "Download objects and refs from another repository", kind: "subcommand", category: "git" },
];

/**
 * Main Autocompletion Query Function
 */
export function getTerminalSuggestions(
  currentLine: string,
  context: SuggestContext = {}
): { suggestions: TerminalSuggestItem[]; replacePrefix: string } {
  const line = currentLine.trimStart();
  const parts = line.split(/\s+/);
  const firstWord = parts[0]?.toLowerCase() || "";
  const secondWord = parts[1]?.toLowerCase() || "";
  const lastWord = parts[parts.length - 1] || "";

  // 1. User typing root command: "c", "ca", "g", "gi", etc.
  if (parts.length === 1 && !currentLine.endsWith(" ")) {
    const rootItems: TerminalSuggestItem[] = [
      { label: "cargo", insertText: "cargo ", detail: "Rust package manager & build system", kind: "command", category: "cargo" },
      { label: "git", insertText: "git ", detail: "Distributed version control system", kind: "command", category: "git" },
      { label: "rustup", insertText: "rustup ", detail: "Rust toolchain installer", kind: "command", category: "rust" },
      { label: "rustc", insertText: "rustc ", detail: "Rust compiler", kind: "command", category: "rust" },
    ];
    const rootMatches = rootItems.filter((item) => item.label.startsWith(firstWord));

    return { suggestions: rootMatches, replacePrefix: lastWord };
  }

  // 2. Cargo Subcommands: "cargo " or "cargo bu"
  if (firstWord === "cargo") {
    if (parts.length === 2 && !currentLine.endsWith(" ")) {
      const filtered = CARGO_SUBCOMMANDS.filter((sub) =>
        sub.label.toLowerCase().startsWith(secondWord)
      );
      return { suggestions: filtered, replacePrefix: secondWord };
    }

    if (parts.length === 1 && currentLine.endsWith(" ")) {
      return { suggestions: CARGO_SUBCOMMANDS, replacePrefix: "" };
    }

    // 3. Cargo Flags: "cargo build --" or "cargo test --"
    const subCmd = secondWord;
    const availableFlags = CARGO_FLAGS[subCmd] || [];

    // Dynamic targets for `cargo run --bin <target>`
    if (subCmd === "run" && lastWord === "--bin" && context.binTargets?.length) {
      const binSuggestions: TerminalSuggestItem[] = context.binTargets.map((bin) => ({
        label: bin,
        insertText: bin,
        detail: `Binary target: ${bin}`,
        kind: "target",
        category: "cargo",
      }));
      return { suggestions: binSuggestions, replacePrefix: "" };
    }

    // Dynamic test names for `cargo test <test_name>`
    if (subCmd === "test" && parts.length === 2 && currentLine.endsWith(" ") && context.testNames?.length) {
      const testSuggestions: TerminalSuggestItem[] = context.testNames.slice(0, 8).map((t) => ({
        label: t,
        insertText: `${t} -- --nocapture`,
        detail: `Run test: ${t}`,
        kind: "target",
        category: "cargo",
      }));
      return { suggestions: [...availableFlags, ...testSuggestions], replacePrefix: "" };
    }

    if (lastWord.startsWith("-")) {
      const matchedFlags = availableFlags.filter((f) =>
        f.label.toLowerCase().startsWith(lastWord.toLowerCase())
      );
      return { suggestions: matchedFlags, replacePrefix: lastWord };
    }

    if (currentLine.endsWith(" ")) {
      return { suggestions: availableFlags, replacePrefix: "" };
    }
  }

  // 4. Git Subcommands: "git " or "git co"
  if (firstWord === "git") {
    if (parts.length === 2 && !currentLine.endsWith(" ")) {
      const filtered = GIT_SUBCOMMANDS.filter((sub) =>
        sub.label.toLowerCase().startsWith(secondWord)
      );
      return { suggestions: filtered, replacePrefix: secondWord };
    }

    if (parts.length === 1 && currentLine.endsWith(" ")) {
      return { suggestions: GIT_SUBCOMMANDS, replacePrefix: "" };
    }

    // Dynamic branches for `git checkout <branch>`
    if (secondWord === "checkout" && parts.length === 2 && currentLine.endsWith(" ") && context.gitBranches?.length) {
      const branchSuggestions: TerminalSuggestItem[] = context.gitBranches.map((b) => ({
        label: b,
        insertText: b,
        detail: `Git branch: ${b}`,
        kind: "branch",
        category: "git",
      }));
      return { suggestions: branchSuggestions, replacePrefix: "" };
    }
  }

  return { suggestions: [], replacePrefix: "" };
}
