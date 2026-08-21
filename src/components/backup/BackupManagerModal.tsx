/**
 * BackupManagerModal.tsx — Production-Ready Local Code Backup Management
 *
 * Allows developers to create instant, zero-git local snapshots of their active workspace,
 * name them, specify descriptions, select destination folders, and perform 1-click restores.
 */

import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  VscArchive,
  VscClose,
  VscFolder,
  VscHistory,
  VscHistory as VscRestore,
  VscTrash,
  VscAdd,
  VscCheck,
} from "react-icons/vsc";
import { useTheme } from "../../hooks/useTheme";
import styles from "./BackupManagerModal.module.css";

export interface BackupMetadata {
  id: string;
  name: string;
  description: string;
  created_at: string;
  source_workspace: string;
  file_count: number;
  total_size_bytes: number;
  archive_path: string;
}

export interface BackupManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspacePath?: string;
}

export const BackupManagerModal: React.FC<BackupManagerModalProps> = ({
  isOpen,
  onClose,
  workspacePath = "",
}) => {
  const { theme } = useTheme();
  const isLight = theme !== "dark";

  // Form State
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [backupDir, setBackupDir] = useState("");
  const [backups, setBackups] = useState<BackupMetadata[]>([]);

  const [isCreating, setIsCreating] = useState(false);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState("");

  // Default backup location based on workspace or user directory
  useEffect(() => {
    if (workspacePath) {
      const defaultDir = `${workspacePath}/.backups`;
      setBackupDir(defaultDir);
    }
  }, [workspacePath]);

  const loadBackups = useCallback(async () => {
    if (!backupDir) return;
    try {
      const list = await invoke<BackupMetadata[]>("list_code_backups", {
        backupDir,
      });
      setBackups(list);
    } catch (err) {
      console.error("[BackupManager] Failed to list backups:", err);
    }
  }, [backupDir]);

  useEffect(() => {
    if (isOpen && backupDir) {
      loadBackups();
    }
  }, [isOpen, backupDir, loadBackups]);

  const handlePickDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Choose Local Backup Destination Folder",
      });
      if (selected && typeof selected === "string") {
        setBackupDir(selected);
      }
    } catch (err) {
      console.error("[BackupManager] Folder picker error:", err);
    }
  };

  const handleCreateBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspacePath) {
      setStatusMsg("No workspace open to backup!");
      return;
    }
    if (!backupDir) {
      setStatusMsg("Please select a target backup folder.");
      return;
    }

    setIsCreating(true);
    setStatusMsg("");

    try {
      const meta = await invoke<BackupMetadata>("create_code_backup", {
        workspacePath,
        backupDir,
        name: name.trim() || "Workspace Snapshot",
        description: description.trim(),
      });

      setStatusMsg(`Backup "${meta.name}" created successfully! (${meta.file_count} files)`);
      setName("");
      setDescription("");
      await loadBackups();
    } catch (err) {
      console.error("[BackupManager] Create error:", err);
      setStatusMsg(`Error creating backup: ${err}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRestoreBackup = async (backup: BackupMetadata) => {
    if (
      !window.confirm(
        `Are you sure you want to restore backup "${backup.name}"? This will overwrite files in your workspace.`
      )
    ) {
      return;
    }

    setIsRestoring(backup.id);
    try {
      await invoke("restore_code_backup", {
        backupPath: backup.archive_path,
        targetWorkspacePath: workspacePath,
      });
      setStatusMsg(`Successfully restored snapshot "${backup.name}"!`);
    } catch (err) {
      console.error("[BackupManager] Restore error:", err);
      setStatusMsg(`Error restoring backup: ${err}`);
    } finally {
      setIsRestoring(null);
    }
  };

  const handleDeleteBackup = async (backup: BackupMetadata) => {
    if (!window.confirm(`Delete backup "${backup.name}" permanently?`)) return;

    try {
      await invoke("delete_code_backup", {
        backupPath: backup.archive_path,
      });
      await loadBackups();
      setStatusMsg(`Deleted backup "${backup.name}".`);
    } catch (err) {
      console.error("[BackupManager] Delete error:", err);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (isoStr: string) => {
    try {
      const date = new Date(isoStr);
      return date.toLocaleString();
    } catch {
      return isoStr;
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={isLight ? styles.modalLight : styles.modalDark}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={isLight ? styles.headerLight : styles.headerDark}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIcon}>
              <VscArchive size={20} />
            </div>
            <h2 className={isLight ? styles.titleLight : styles.titleDark}>
              Local Code Backup Manager
            </h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <VscClose size={20} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {statusMsg && (
            <div
              style={{
                marginBottom: 16,
                padding: "10px 14px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                backgroundColor: isLight ? "#ddf4ff" : "#1f3a5f",
                color: isLight ? "#0969da" : "#58a6ff",
                border: isLight ? "1px solid #54aefd" : "1px solid #388bfd",
              }}
            >
              {statusMsg}
            </div>
          )}

          {/* Create Backup Form Card */}
          <form
            className={isLight ? styles.formCardLight : styles.formCardDark}
            onSubmit={handleCreateBackup}
          >
            <h3 className={styles.formTitle}>Create New Code Snapshot</h3>

            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Backup Name</label>
                <input
                  className={isLight ? styles.inputLight : styles.inputDark}
                  placeholder="e.g. Pre-Refactor AST Parser"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label}>Destination Folder</label>
                <div className={styles.dirPickerGroup}>
                  <input
                    className={isLight ? styles.inputLight : styles.inputDark}
                    style={{ flex: 1 }}
                    value={backupDir}
                    onChange={(e) => setBackupDir(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className={isLight ? styles.btnSecondaryLight : styles.btnSecondaryDark}
                    onClick={handlePickDirectory}
                  >
                    <VscFolder /> Browse
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.fieldGroup} style={{ marginBottom: 16 }}>
              <label className={styles.label}>Description & Notes</label>
              <textarea
                className={isLight ? styles.inputLight : styles.inputDark}
                style={{ height: 60, resize: "vertical" }}
                placeholder="Optional notes describing changes in this snapshot..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <button type="submit" className={styles.btnPrimary} disabled={isCreating}>
              <VscAdd /> {isCreating ? "Creating Backup..." : "Create Backup Snapshot"}
            </button>
          </form>

          {/* Backup History Timeline */}
          <div className={styles.historySectionTitle}>
            <span>
              <VscHistory /> Local Backup History ({backups.length})
            </span>
          </div>

          <div className={styles.backupList}>
            {backups.map((b) => (
              <div
                key={b.id}
                className={isLight ? styles.backupCardLight : styles.backupCardDark}
              >
                <div className={styles.backupInfo}>
                  <span className={styles.backupName}>{b.name}</span>
                  {b.description && <span className={styles.backupDesc}>{b.description}</span>}
                  <div className={styles.backupBadges}>
                    <span className={isLight ? styles.badge : styles.badgeDark}>
                      {formatSize(b.total_size_bytes)}
                    </span>
                    <span className={isLight ? styles.badge : styles.badgeDark}>
                      {b.file_count} files
                    </span>
                    <span style={{ fontSize: 11, color: isLight ? "#57606a" : "#888888" }}>
                      {formatDate(b.created_at)}
                    </span>
                  </div>
                </div>

                <div className={styles.backupActions}>
                  <button
                    className={isLight ? styles.btnSecondaryLight : styles.btnSecondaryDark}
                    onClick={() => handleRestoreBackup(b)}
                    disabled={isRestoring === b.id}
                  >
                    <VscRestore /> {isRestoring === b.id ? "Restoring..." : "Restore"}
                  </button>
                  <button className={styles.btnDanger} onClick={() => handleDeleteBackup(b)}>
                    <VscTrash /> Delete
                  </button>
                </div>
              </div>
            ))}

            {backups.length === 0 && (
              <div className={styles.emptyState}>
                No local backups found in destination folder. Create one above to preserve your code safely!
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BackupManagerModal;
