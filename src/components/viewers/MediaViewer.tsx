import { convertFileSrc } from "@tauri-apps/api/core";
import { VscFileMedia } from "react-icons/vsc";
import styles from "./MediaViewer.module.css";

interface MediaViewerProps {
  filePath: string;
}

export function MediaViewer({ filePath }: MediaViewerProps) {
  const fileName = filePath.split(/[/\\]/).pop() || filePath;
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const isVideo = ["mp4", "webm", "ogg", "mov"].includes(ext);

  const mediaSrc = window.__TAURI_INTERNALS__
    ? convertFileSrc(filePath)
    : filePath;

  return (
    <div className={styles.mediaContainer}>
      <div className={styles.mediaCard}>
        <div className={styles.mediaTitle}>
          <VscFileMedia color="#005fb8" />
          <span>{fileName}</span>
        </div>

        {isVideo ? (
          <video
            src={mediaSrc}
            controls
            className={styles.videoElement}
            autoPlay={false}
          />
        ) : (
          <audio
            src={mediaSrc}
            controls
            className={styles.audioElement}
            autoPlay={false}
          />
        )}

        <div className={styles.metaInfo}>
          Path: {filePath}
        </div>
      </div>
    </div>
  );
}

export default MediaViewer;
