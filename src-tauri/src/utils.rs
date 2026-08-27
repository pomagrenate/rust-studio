/// utils.rs — Utility functions and traits for Pomai Studio backend.

pub trait CommandExtHideWindow {
    /// Hides console window on Windows (sets CREATE_NO_WINDOW = 0x08000000).
    fn hide_window(&mut self) -> &mut Self;
}

impl CommandExtHideWindow for std::process::Command {
    fn hide_window(&mut self) -> &mut Self {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            self.creation_flags(0x08000000);
        }
        self
    }
}

impl CommandExtHideWindow for tokio::process::Command {
    fn hide_window(&mut self) -> &mut Self {
        #[cfg(target_os = "windows")]
        {
            self.creation_flags(0x08000000);
        }
        self
    }
}
