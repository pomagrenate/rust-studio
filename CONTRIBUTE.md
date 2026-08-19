# Contributing to Rust Studio

Thank you for your interest in contributing to Rust Studio! We welcome contributions from everyone.

## Getting Started

### Prerequisites

- **Rust** (1.70 or later)
- **Node.js** (18 or later)
- **pnpm** (recommended) or npm/yarn

### Setting Up the Development Environment

```bash
# Clone the repository
git clone https://github.com/pomagrenate/rust-studio.git
cd rust-studio

# Install dependencies
pnpm install

# Run in development mode
pnpm tauri dev

# Build the application
pnpm tauri build
```

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When creating a bug report:

- Use a clear and descriptive title
- Describe the exact steps to reproduce the problem
- Provide expected behavior vs. actual behavior
- Include screenshots if applicable
- Specify your OS, Rust version, and Node.js version

### Suggesting Enhancements

Enhancement suggestions are welcome! Please:

- Use a clear and descriptive title
- Provide a detailed description of the suggested enhancement
- Explain why this enhancement would be useful
- Provide examples of how the enhancement would be used

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Pull Request Guidelines

- Keep PRs focused and small
- Write clear commit messages following [conventional commits](https://www.conventionalcommits.org/)
- Include tests for new features
- Update documentation as needed
- Ensure all tests pass
- Follow the code style guidelines below

## Code Style

### Rust

- Follow `rustfmt` formatting
- Use `cargo clippy` for linting
- Write descriptive variable and function names
- Add comments for complex logic

### TypeScript/React

- Follow ESLint and Prettier rules
- Use functional components with hooks
- Write descriptive component and function names
- Add JSDoc comments for complex functions
- Use TypeScript types strictly

### Commit Messages

Follow the [conventional commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Example:
```
feat(editor): add syntax highlighting for Rust

Implement syntax highlighting for Rust source files using
the tree-sitter parser. This includes support for:
- Keywords and types
- Strings and comments
- Function definitions

Closes #123
```

## Development Guidelines

### Project Structure

```
rust-studio/
├── src/                    # Frontend React application
│   ├── components/         # React components
│   ├── hooks/             # Custom React hooks
│   ├── ipc/               # IPC communication layer
│   └── styles/            # CSS stylesheets
├── src-tauri/             # Tauri Rust backend
│   ├── src/               # Rust source code
│   └── Cargo.toml         # Rust dependencies
└── package.json           # Node.js dependencies
```

### Adding New Features

1. Create an issue first to discuss the feature
2. Design the API and user interface
3. Implement the feature with tests
4. Update documentation
5. Submit a pull request

### Testing

- Write unit tests for utility functions
- Write integration tests for components
- Test on multiple platforms (Windows, macOS, Linux)
- Ensure accessibility standards are met

## Code of Conduct

Please read and follow our [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) to ensure a welcoming and inclusive environment for all contributors.

## Questions?

If you have questions about contributing, feel free to open a discussion or ask in an existing issue.

## License

By contributing to Rust Studio, you agree that your contributions will be licensed under the MIT License.
