/**
 * extensions/builtin/timeline/GitTimelineProvider.ts
 * Built-in Timeline Provider querying Git history via Rust engine.
 */

import { invoke } from "@tauri-apps/api/core";
import { ITimelineProvider, ITimelineItem } from "../../types";

interface RustTimelineEntry {
  id: string;
  label: string;
  detail: string;
  timestamp: string;
  source: string;
  author: string;
}

export class GitTimelineProvider implements ITimelineProvider {
  public readonly id = "git-timeline-provider";
  public readonly label = "Git History";

  async provideTimeline(filePath: string): Promise<ITimelineItem[]> {
    if (!filePath || filePath === "Welcome") return [];

    try {
      if (window.__TAURI_INTERNALS__) {
        const res = await invoke<RustTimelineEntry[]>("get_file_timeline", { filePath });
        return (res || []).map((entry) => ({
          id: entry.id,
          label: entry.label,
          detail: entry.detail,
          author: entry.author || "Git",
          relativeDate: entry.timestamp,
          timestamp: Date.now(),
          source: (entry.source === "git" ? "git" : "local-history") as "git" | "local-history",
        }));
      } else {
        return [
          {
            id: "commit-mock-1",
            label: "Update file architecture",
            detail: "Author: Developer • 10 minutes ago",
            author: "Developer",
            relativeDate: "10 minutes ago",
            timestamp: Date.now() - 600000,
            source: "git",
          },
          {
            id: "local-mock-1",
            label: "File Saved",
            detail: "Local Save • 1 hour ago",
            author: "Local History",
            relativeDate: "1 hour ago",
            timestamp: Date.now() - 3600000,
            source: "local-history",
          },
        ];
      }
    } catch (e) {
      console.error("Timeline query failed:", e);
      return [];
    }
  }
}
