/// viewport/layout.rs — Virtualized line layout engine.
///
/// ## VS Code mapping
/// This module is a Rust port of `linesLayout.ts` (LinesLayout class).
///
/// The core question answered here:
///   *"The user has scrolled to Y pixels. Which lines are visible?"*
///
/// ## The Algorithm
///
/// Given:
///   - `line_count` total lines in the document
///   - `default_line_height` pixels per line (e.g. 20px)
///   - `scroll_top` current scroll position in pixels
///   - `viewport_height` the rendered height of the editor in pixels
///
/// We want to find `[start_line, end_line]` such that all lines in that
/// range are (at least partially) visible.
///
/// With uniform line heights this is trivial:
///   - `start_line = floor(scroll_top / line_height)` — O(1)
///   - `end_line = ceil((scroll_top + viewport_height) / line_height)` — O(1)
///
/// With non-uniform line heights (folded regions, diff widgets, etc.) we
/// use the same prefix-sum approach as VS Code:
///   - A `BTreeMap<usize, f32>` stores exceptions to the default height
///   - Prefix sums are computed lazily and cached
///
/// For Phase 1 we implement the fast uniform case. The non-uniform case
/// will be Phase 2 (needed for code folding and inline diffs).

use serde::Serialize;

/// A single line's layout information returned to the renderer.
#[derive(Debug, Clone, Serialize)]
pub struct LineOffset {
    /// 0-indexed line number.
    pub line: usize,
    /// Top offset in pixels relative to the document origin (scroll_top = 0).
    pub top: f64,
    /// Height of this line in pixels.
    pub height: f32,
}

/// Data returned to the frontend for a single viewport query.
#[derive(Debug, Clone, Serialize)]
pub struct ViewportData {
    /// First visible line (0-indexed, inclusive).
    pub start_line: usize,
    /// Last visible line (0-indexed, inclusive).
    pub end_line: usize,
    /// Per-line layout data for every line in `[start_line, end_line]`.
    pub lines: Vec<LineOffset>,
    /// Total scrollable height of the document in pixels.
    pub total_height: f64,
    /// The line closest to the vertical center of the viewport.
    pub centered_line: usize,
}

/// The viewport layout engine.
///
/// Create one per open editor pane, update it when the document changes
/// (line count) or the user resizes the window (viewport_height, line_height).
pub struct ViewportManager {
    /// Total number of lines in the document. Updated on every edit.
    pub line_count: usize,

    /// Default height of a single line in pixels (e.g. 20.0).
    pub default_line_height: f32,

    /// Top padding above line 0 in pixels.
    pub padding_top: f32,

    /// Bottom padding below the last line in pixels.
    pub padding_bottom: f32,

    /// Current scroll position in pixels (distance from document top).
    pub scroll_top: f64,

    /// Height of the visible editor area in pixels.
    pub viewport_height: f64,
}

impl ViewportManager {
    pub fn new(
        line_count: usize,
        default_line_height: f32,
        viewport_height: f64,
    ) -> Self {
        Self {
            line_count,
            default_line_height,
            padding_top: 0.0,
            padding_bottom: 0.0,
            scroll_top: 0.0,
            viewport_height,
        }
    }

    /// Update the line count after a document edit.
    pub fn on_lines_changed(&mut self, new_line_count: usize) {
        self.line_count = new_line_count;
    }

    /// Total rendered height of the document in pixels.
    ///
    /// With uniform line heights: O(1).
    /// Future: with non-uniform heights → O(log N) via prefix sum tree.
    pub fn total_height(&self) -> f64 {
        (self.line_count as f64 * self.default_line_height as f64)
            + self.padding_top as f64
            + self.padding_bottom as f64
    }

    /// Get the vertical pixel offset of the TOP of line `line_idx`.
    ///
    /// With uniform heights: O(1).
    pub fn line_top(&self, line_idx: usize) -> f64 {
        self.padding_top as f64 + (line_idx as f64 * self.default_line_height as f64)
    }

    /// Find which line is at or below a given vertical pixel offset.
    ///
    /// With uniform heights: O(1) direct calculation.
    /// VS Code equivalent: `getLineNumberAtOrAfterVerticalOffset` — O(log N)
    /// because it accounts for non-uniform whitespace.
    pub fn line_at_y(&self, y: f64) -> usize {
        if y <= self.padding_top as f64 {
            return 0;
        }
        let line = ((y - self.padding_top as f64) / self.default_line_height as f64) as usize;
        line.min(self.line_count.saturating_sub(1))
    }

    /// **The main viewport query.**
    ///
    /// Given the current scroll position and viewport height, compute exactly
    /// which lines are visible and their pixel offsets.
    ///
    /// This is a Rust port of `LinesLayout.getLinesViewportData()` from VS Code.
    ///
    /// ## Complexity
    /// - Uniform heights: O(K) where K = number of visible lines (~50)
    /// - Non-uniform: O(log N + K) with prefix sum tree (Phase 2)
    pub fn get_viewport_data(&self) -> ViewportData {
        if self.line_count == 0 {
            return ViewportData {
                start_line: 0,
                end_line: 0,
                lines: vec![],
                total_height: 0.0,
                centered_line: 0,
            };
        }

        let scroll_bottom = self.scroll_top + self.viewport_height;
        let total_height = self.total_height();

        // Find the first visible line.
        let start_line = self.line_at_y(self.scroll_top);

        // Walk forward from start_line, accumulating height until we exceed scroll_bottom.
        let mut end_line = start_line;
        let mut lines = Vec::with_capacity(64); // typical viewport is ~50 lines

        // Track the center for smooth scrolling UX.
        let vertical_center = self.scroll_top + self.viewport_height / 2.0;
        let mut centered_line = start_line;
        let mut found_center = false;

        let mut current_top = self.line_top(start_line);

        for line_idx in start_line..self.line_count {
            let line_bottom = current_top + self.default_line_height as f64;

            // Determine centered line (line whose top-half contains the viewport center).
            if !found_center {
                let line_mid = current_top + self.default_line_height as f64 / 2.0;
                if line_mid >= vertical_center || current_top > vertical_center {
                    centered_line = line_idx;
                    found_center = true;
                }
            }

            lines.push(LineOffset {
                line: line_idx,
                top:  current_top,
                height: self.default_line_height,
            });

            end_line = line_idx;

            // Stop once we've gone past the bottom of the viewport.
            if line_bottom >= scroll_bottom {
                break;
            }

            current_top = line_bottom;
        }

        // VS Code "bigNumbersDelta" trick: when total_height > 500_000px,
        // we subtract a large aligned delta so the CSS `top` values stay
        // within safe browser pixel ranges. Apply this to `top` offsets.
        // (Phase 2: implement when supporting files > ~25k lines at 20px/line)

        ViewportData {
            start_line,
            end_line,
            lines,
            total_height,
            centered_line,
        }
    }
}

// ── Unit Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_viewport_at_top() {
        let vp = ViewportManager::new(1000, 20.0, 400.0);
        let data = vp.get_viewport_data();
        assert_eq!(data.start_line, 0);
        assert_eq!(data.end_line, 20); // 400px / 20px = 20 lines
        assert_eq!(data.lines.len(), 21);
        assert_eq!(data.lines[0].top, 0.0);
        assert_eq!(data.lines[1].top, 20.0);
    }

    #[test]
    fn test_viewport_scrolled() {
        let mut vp = ViewportManager::new(1000, 20.0, 400.0);
        vp.scroll_top = 200.0; // scrolled down 200px = 10 lines
        let data = vp.get_viewport_data();
        assert_eq!(data.start_line, 10);
        assert_eq!(data.end_line, 30);
    }

    #[test]
    fn test_total_height() {
        let vp = ViewportManager::new(100, 20.0, 400.0);
        assert_eq!(vp.total_height(), 2000.0); // 100 lines × 20px
    }

    #[test]
    fn test_line_at_y() {
        let vp = ViewportManager::new(1000, 20.0, 400.0);
        assert_eq!(vp.line_at_y(0.0), 0);
        assert_eq!(vp.line_at_y(19.9), 0);  // still line 0
        assert_eq!(vp.line_at_y(20.0), 1);
        assert_eq!(vp.line_at_y(39.9), 1);  // still line 1
        assert_eq!(vp.line_at_y(40.0), 2);
    }

    #[test]
    fn test_on_lines_changed() {
        let mut vp = ViewportManager::new(100, 20.0, 400.0);
        assert_eq!(vp.total_height(), 2000.0);
        vp.on_lines_changed(200);
        assert_eq!(vp.total_height(), 4000.0);
    }
}
