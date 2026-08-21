/// fs/mod.rs — File system abstraction: reading, watching, directory listing.

pub mod reader;
pub mod walker;
#[cfg(test)]
mod tests;

pub use reader::{read_file_content, save_file_content};
pub use walker::{list_directory, FsEntry, EntryKind};
