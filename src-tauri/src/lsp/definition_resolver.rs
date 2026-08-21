/**
 * definition_resolver.rs — Production-grade Go to Definition resolver
 * 
 * Handles workspace, stdlib, and external crate definition resolution
 * with virtual buffer support for read-only external files.
 */

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;
use crate::lsp::types::{LocationLink, ResolvedDefinition};

/// Source path classification
#[derive(Debug, Clone, PartialEq)]
pub enum SourceKind {
    /// Local workspace file
    Workspace,
    /// Rust standard library (core, std, alloc)
    StdLib,
    /// External crate from Cargo registry
    ExternalCrate,
    /// Sysroot toolchain file
    Sysroot,
    /// Unknown/other
    Other,
}

/// Virtual file cache entry
#[derive(Clone)]
struct VirtualFileCache {
    content: String,
    #[allow(dead_code)]
    language_id: String,
    #[allow(dead_code)]
    last_accessed: std::time::Instant,
}

/// Definition resolver with virtual file support
#[derive(Clone)]
pub struct DefinitionResolver {
    /// Workspace root path
    workspace_root: PathBuf,
    /// Rust sysroot path (detected from rustc)
    sysroot: PathBuf,
    /// Virtual file cache (LRU-style)
    virtual_cache: Arc<RwLock<HashMap<String, VirtualFileCache>>>,
    /// Maximum cache size
    max_cache_size: usize,
}

impl DefinitionResolver {
    /// Create a new definition resolver
    pub fn new(workspace_root: PathBuf) -> Result<Self, Box<dyn std::error::Error>> {
        let sysroot = Self::detect_sysroot()?;
        
        Ok(Self {
            workspace_root,
            sysroot,
            virtual_cache: Arc::new(RwLock::new(HashMap::new())),
            max_cache_size: 100, // Cache up to 100 virtual files
        })
    }

    /// Detect the Rust sysroot using rustc
    fn detect_sysroot() -> Result<PathBuf, Box<dyn std::error::Error>> {
        use crate::utils::CommandExtHideWindow;
        let output = std::process::Command::new("rustc")
            .hide_window()
            .args(["--print", "sysroot"])
            .output()?;
        
        if !output.status.success() {
            return Err("Failed to execute rustc".into());
        }
        
        let sysroot_str = String::from_utf8(output.stdout)?
            .trim()
            .to_string();
        
        Ok(PathBuf::from(sysroot_str))
    }

    /// Check if rust-src component is installed
    pub fn check_rust_src_installed(&self) -> bool {
        let rust_src_path = self.sysroot
            .join("lib/rustlib/src/rust");
        
        rust_src_path.exists() && rust_src_path.join("library").exists()
    }

    /// Get the rust-src library path
    pub fn get_rust_src_path(&self) -> PathBuf {
        self.sysroot.join("lib/rustlib/src/rust/library")
    }

    /// Get rust-src installation status
    pub fn get_rust_src_status(&self) -> crate::lsp::types::RustSrcStatus {
        let installed = self.check_rust_src_installed();
        crate::lsp::types::RustSrcStatus {
            installed,
            sysroot: self.sysroot.to_string_lossy().to_string(),
            rust_src_path: self.get_rust_src_path().to_string_lossy().to_string(),
        }
    }

    /// Attempt to install rust-src component
    pub async fn install_rust_src(&self) -> Result<String, Box<dyn std::error::Error>> {
        use crate::utils::CommandExtHideWindow;
        let output = tokio::process::Command::new("rustup")
            .hide_window()
            .args(["component", "add", "rust-src"])
            .output()
            .await?;
        
        if output.status.success() {
            Ok("rust-src component installed successfully".to_string())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("Failed to install rust-src: {}", stderr).into())
        }
    }

    /// Classify a source path
    pub fn classify_source(&self, path: &Path) -> SourceKind {
        let path_str = path.to_string_lossy().to_lowercase();
        
        // Check if it's in workspace
        if path_str.starts_with(&self.workspace_root.to_string_lossy().to_lowercase()) {
            return SourceKind::Workspace;
        }
        
        // Check if it's in rust-src (standard library)
        let rust_src_path = self.get_rust_src_path();
        if path_str.starts_with(&rust_src_path.to_string_lossy().to_lowercase()) {
            return SourceKind::StdLib;
        }
        
        // Check if it's in sysroot
        if path_str.starts_with(&self.sysroot.to_string_lossy().to_lowercase()) {
            return SourceKind::Sysroot;
        }
        
        // Check if it's in Cargo registry
        if path_str.contains("/.cargo/registry/src/") || path_str.contains("\\.cargo\\registry\\src\\") {
            return SourceKind::ExternalCrate;
        }
        
        SourceKind::Other
    }

    /// Resolve a definition location from LSP response
    pub async fn resolve_definition(
        &self,
        location: LocationLink,
    ) -> Result<ResolvedDefinition, Box<dyn std::error::Error>> {
        let uri = &location.target_uri;
        let range = location.target_range;
        
        let path = self.uri_to_path(uri)?;
        let source_kind = self.classify_source(&path);
        
        let (is_virtual, content) = match source_kind {
            SourceKind::Workspace => (false, None),
            SourceKind::StdLib | SourceKind::ExternalCrate | SourceKind::Sysroot => {
                // Load virtual file content
                let content = self.load_virtual_file(&path).await?;
                (true, Some(content))
            }
            SourceKind::Other => (false, None),
        };
        
        let language_id = self.detect_language_id(&path);
        
        Ok(ResolvedDefinition {
            uri: uri.clone(),
            range,
            is_virtual,
            content,
            language_id,
        })
    }

    /// Convert file:// URI to filesystem path
    fn uri_to_path(&self, uri: &str) -> Result<PathBuf, Box<dyn std::error::Error>> {
        let path = uri
            .strip_prefix("file://")
            .ok_or("Invalid file URI")?
            .replace("%20", " ")
            .replace("/", "\\"); // Windows path normalization
        
        Ok(PathBuf::from(path))
    }

    /// Detect language ID from file extension
    fn detect_language_id(&self, path: &Path) -> String {
        match path.extension().and_then(|e| e.to_str()) {
            Some("rs") => "rust".to_string(),
            Some("toml") => "toml".to_string(),
            Some("json") => "json".to_string(),
            Some("md") => "markdown".to_string(),
            _ => "plaintext".to_string(),
        }
    }

    /// Load a virtual file (with caching)
    async fn load_virtual_file(&self, path: &Path) -> Result<String, Box<dyn std::error::Error>> {
        let path_str = path.to_string_lossy().to_string();
        
        // Check cache first
        {
            let cache = self.virtual_cache.read().await;
            if let Some(entry) = cache.get(&path_str) {
                return Ok(entry.content.clone());
            }
        }
        
        // Load from disk
        let content = tokio::fs::read_to_string(path).await?;
        
        // Update cache
        {
            let mut cache = self.virtual_cache.write().await;
            
            // Evict old entries if cache is full
            if cache.len() >= self.max_cache_size {
                // Simple eviction: remove oldest entry
                if let Some(key) = cache.keys().next().cloned() {
                    cache.remove(&key);
                }
            }
            
            cache.insert(path_str, VirtualFileCache {
                content: content.clone(),
                language_id: self.detect_language_id(path),
                last_accessed: std::time::Instant::now(),
            });
        }
        
        Ok(content)
    }

    /// Clear the virtual file cache
    pub async fn clear_cache(&self) {
        self.virtual_cache.write().await.clear();
    }

    /// Get cache statistics
    pub async fn cache_stats(&self) -> (usize, usize) {
        let cache = self.virtual_cache.read().await;
        (cache.len(), self.max_cache_size)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sysroot_detection() {
        let sysroot = DefinitionResolver::detect_sysroot();
        assert!(sysroot.is_ok());
        let sysroot_path = sysroot.unwrap();
        assert!(sysroot_path.exists());
    }

    #[test]
    fn test_source_classification() {
        let workspace = PathBuf::from("E:/test/project");
        let resolver = DefinitionResolver::new(workspace.clone()).unwrap();
        
        // Test workspace classification
        let workspace_file = workspace.join("src/main.rs");
        assert_eq!(resolver.classify_source(&workspace_file), SourceKind::Workspace);
        
        // Test stdlib classification
        let stdlib_file = resolver.get_rust_src_path().join("std/src/lib.rs");
        assert_eq!(resolver.classify_source(&stdlib_file), SourceKind::StdLib);
    }
}
