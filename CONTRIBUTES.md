# 🛠️ Contributing to Rust Studio

Thank you for your interest in contributing to **Rust Studio**[cite: 2]! We are building a blazing-fast, zero-AI, and hackable IDE tailored specifically for Rust developers. Whether you are fixing a small typo, profiling memory usage on the Rope Buffer, adding Tree-sitter AST transformation templates, or enhancing LSP diagnostics, your contributions make a massive difference[cite: 2].

---

## 🧭 Table of Contents

1. [Code of Conduct](#-code-of-conduct)
2. [Prerequisites & Development Setup](#-prerequisites--development-setup)
3. [Architecture Overview](#-architecture-overview)
4. [Contribution Workflow](#-contribution-workflow)
5. [Coding & Style Standards](#-coding--style-standards)
6. [Conventional Commit Guidelines](#-conventional-commit-guidelines)
7. [Submitting Pull Requests](#-submitting-pull-requests)
8. [License](#-license)

---

## 📜 Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free environment for all contributors[cite: 2]. Please make sure to read and adhere to our [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) throughout your participation in the project[cite: 2].

---

## 💻 Prerequisites & Development Setup

### System Prerequisites
- **Rust Toolchain:** Version `1.75` or later[cite: 2] (`rustup update stable`)
- **Node.js:** `v18.x` or `v20.x` LTS[cite: 2]
- **Package Manager:** `pnpm` (recommended)[cite: 2], `npm`, or `yarn`[cite: 2]
- **Platform Dependencies:** Ensure your OS has the necessary build tools required by [Tauri v2 Prerequisites](https://tauri.app/start/prerequisites/).

### Setting Up Your Local Environment

```
# 1. Fork repository
git clone [https://github.com/pomagrenate/rust-studio.git](https://github.com/pomagrenate/rust-studio.git)
cd rust-studio

# 2. Install frontend dependencies
npm install

# 3. Launch in development mode
npm run tauri dev

# 4. Build standalone production binary
npm run tauri build
```

## 🔄 Contribution Workflow

### 1. Reporting Bugs

* Search the [GitHub Issues tracker](https://www.google.com/search?q=https://github.com/pomagrenate/rust-studio/issues) to verify the bug hasn't already been reported.


* Open an issue using the **Bug Report** template.


* Include exact steps to reproduce, expected vs. actual behavior, platform details (OS, GPU, RAM), and console/Rust logs.



### 2. Proposing Features & Refactoring

* We prioritize **deterministic, zero-AI, low-memory developer tooling** (compiler diagnostics, AST transformations, native OS security).
* Please open a **Feature Request / Discussion Issue** before writing large pull requests so we can align on architectural design.



---

## 🎨 Coding & Style Standards

### Rust Backend

* Format code before committing: `cargo fmt --all`.


* Verify linting rules pass with zero warnings: `cargo clippy --all-targets -- -D warnings`.


* Favor zero-cost abstractions, minimal heap allocations, and deterministic execution.

### Frontend TypeScript / React

* Follow ESLint and Prettier guidelines (`pnpm lint` / `pnpm format`).


* **Strict CSS Custom Properties:** Avoid hardcoding hex colors. Use the design tokens defined in `--pm-bg-...`, `--pm-fg-...`, and `--pm-border`.
* **Performance First:** Minimize unnecessary React re-renders in editor buffers and sidebars.

---

## 📝 Conventional Commit Guidelines

We enforce the [Conventional Commits specification](https://www.conventionalcommits.org/) for clear changelog generation and commit history:

```text
<type>(<scope>): <short summary>

[optional body explaining context and architectural tradeoffs]

[optional footer(s), e.g., Closes #123]

```

### Allowed Types:

* `feat`: A new feature or capability (e.g., `feat(ast): add surround with unsafe block template`)


* `fix`: A bug fix (e.g., `fix(rope): prevent panic on multi-byte UTF-8 slice`)


* `perf`: A code change that improves performance without altering behavior
* `refactor`: Code restructuring without bug fixes or feature additions


* `style`: Formatting, missing semi-colons, white-space changes


* `docs`: Documentation updates only


* `test`: Adding or correcting unit/integration tests


* `chore`: Tooling, build pipeline, or dependency updates


## 🚀 Submitting Pull Requests

1. Create a descriptive feature branch:


```bash
git checkout -b feat/ssr-template-engine
```

2. Commit your atomic changes following the commit message format:

```bash
git commit -m "feat(ssr): add tree-sitter pattern matcher for if-let expressions"
```


3. Push to your fork and submit a Pull Request against the `main` branch.
4. Fill out the PR template completely. Ensure all automated CI checks (Clippy, fmt, TypeScript checks, and unit tests) pass green.

---

## ⚖️ License

By contributing to **Rust Studio**, you agree that your contributions will be licensed under the project's [MIT License](https://www.google.com/search?q=LICENSE).