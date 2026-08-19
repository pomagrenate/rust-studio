# Rust Studio

<!-- SEO Meta Tags -->
<meta name="description" content="Rust Studio - A modern, lightweight IDE built with Rust for Rust development. Features LSP integration, Cargo build support, Git integration, and more.">
<meta name="keywords" content="Rust IDE, Rust development, Tauri, LSP, Cargo, Git integration, code editor, Rust analyzer">
<meta name="author" content="Rust Studio Contributors">

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Rust](https://img.shields.io/badge/Rust-1.70+-orange.svg)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-2.0+-ff9900.svg)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-18+-61dafb.svg)](https://reactjs.org/)

**Rust Studio** is a modern, lightweight Integrated Development Environment (IDE) built specifically for Rust development. Written in Rust using Tauri, it provides a fast, native experience with powerful features like Language Server Protocol (LSP) integration, Cargo build support, Git integration, and a customizable editor interface.

## Features

- **🚀 Blazing Fast** - Built with Rust and Tauri for native performance
- **🔍 LSP Integration** - Full Language Server Protocol support for intelligent code completion, diagnostics, and navigation
- **📦 Cargo Integration** - Seamless Cargo build, test, and Clippy integration
- **🔀 Git Support** - Built-in Git integration with merge conflict resolution
- **🎨 Customizable Editor** - Syntax highlighting, font scaling, and theme support
- **🐛 Debugging** - Integrated debugging with breakpoints and inline variable inspection
- **📁 File Explorer** - Intuitive file browser with workspace management
- **🔍 Find & Replace** - Powerful search and replace functionality
- **📝 Markdown Preview** - Live Markdown rendering with GitHub-flavored support
- **🖼️ Media Viewers** - Built-in viewers for images, PDFs, and CSV files
- **⌨️ Keyboard Shortcuts** - Efficient keyboard-driven workflow
- **🌙 Dark & Light Themes** - Beautiful theme support for all lighting conditions

## Installation

### Prerequisites

- **Rust** (1.70 or later)
- **Node.js** (18 or later)
- **pnpm** (recommended) or npm/yarn

### Build from Source

```bash
# Clone the repository
git clone https://github.com/your-username/rust-studio.git
cd rust-studio

# Install dependencies
pnpm install

# Build the application
pnpm tauri build

# Run in development mode
pnpm tauri dev
```

## Usage

### Opening a Workspace

1. Launch Rust Studio
2. Click "Open Workspace" or "Open Folder"
3. Select your Rust project directory
4. Start coding!

### Keyboard Shortcuts

| Action | Windows/Linux | macOS |
|--------|---------------|-------|
| Save | `Ctrl+S` | `Cmd+S` |
| Find | `Ctrl+F` | `Cmd+F` |
| Replace | `Ctrl+H` | `Cmd+H` |
| Go to Definition | `F12` | `F12` |
| Toggle Terminal | `Ctrl+\`` | `Cmd+\`` |
| Split Editor | `Ctrl+\` | `Cmd+\` |
| Close Editor | `Ctrl+W` | `Cmd+W` |
| Undo | `Ctrl+Z` | `Cmd+Z` |
| Redo | `Ctrl+Y` / `Ctrl+Shift+Z` | `Cmd+Y` / `Cmd+Shift+Z` |

## Development

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

### Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- **Rust**: Follow `rustfmt` formatting
- **TypeScript/React**: Follow ESLint and Prettier rules
- **Commit Messages**: Use conventional commit format

## Roadmap

- [ ] Multi-file editing and refactoring
- [ ] Extension system and marketplace
- [ ] Remote development support
- [ ] Performance profiling tools
- [ ] Additional language support
- [ ] Cloud sync and collaboration features

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Tauri](https://tauri.app/) - Framework for building desktop apps with web technologies
- [React](https://reactjs.org/) - UI library
- [Rust Analyzer](https://rust-analyzer.github.io/) - Rust language server
- [CodeMirror](https://codemirror.net/) - Text editor component inspiration

## Contact

- **Issues**: [GitHub Issues](https://github.com/your-username/rust-studio/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-username/rust-studio/discussions)

---

**Built with ❤️ using Rust and Tauri**
