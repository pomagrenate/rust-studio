/**
 * MergeConflictBanner.tsx
 * Top notification and quick action banner rendered when the open file has merge conflicts.
 */

import { VscWarning, VscSplitHorizontal, VscCheck } from "react-icons/vsc";
import { MergeConflictBlock } from "../../extensions/builtin/git/MergeConflictParser";
import styles from "./MergeConflictBanner.module.css";

interface MergeConflictBannerProps {
  conflicts: MergeConflictBlock[];
  onAcceptAllCurrent: () => void;
  onAcceptAllIncoming: () => void;
  onOpen3WayResolver: () => void;
}

export function MergeConflictBanner({
  conflicts,
  onAcceptAllCurrent,
  onAcceptAllIncoming,
  onOpen3WayResolver,
}: MergeConflictBannerProps) {
  if (conflicts.length === 0) return null;

  return (
    <div className={styles.conflictBanner}>
      <div className={styles.bannerLeft}>
        <VscWarning className={styles.conflictIcon} />
        <span className={styles.conflictCountBadge}>{conflicts.length}</span>
        <span className={styles.conflictTitle}>
          {conflicts.length === 1 ? "Merge conflict detected" : `${conflicts.length} merge conflicts detected`}
        </span>
      </div>

      <div className={styles.bannerActions}>
        <button
          className={`${styles.actionBtn} ${styles.btnCurrent}`}
          onClick={onAcceptAllCurrent}
          title="Accept Current Changes (HEAD) for all conflicts in file"
        >
          <VscCheck size={13} />
          <span>Accept All Current</span>
        </button>

        <button
          className={`${styles.actionBtn} ${styles.btnIncoming}`}
          onClick={onAcceptAllIncoming}
          title="Accept Incoming Changes for all conflicts in file"
        >
          <VscCheck size={13} />
          <span>Accept All Incoming</span>
        </button>

        <button
          className={`${styles.actionBtn} ${styles.btnOpen3Way}`}
          onClick={onOpen3WayResolver}
          title="Open Visual 3-Way Merge Conflict Resolver (Ours vs. Theirs vs. Result)"
        >
          <VscSplitHorizontal size={14} />
          <span>3-Way Merge Resolver</span>
        </button>
      </div>
    </div>
  );
}

export default MergeConflictBanner;
