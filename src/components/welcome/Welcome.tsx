import { 
  VscNewFile, 
  VscFolderOpened, 
  VscSearch, 
  VscFile
} from 'react-icons/vsc';
import { FaRust } from 'react-icons/fa';
import styles from './Welcome.module.css';

interface WelcomeScreenProps {
  onNewFile: () => void;
  onOpenFile: () => void;
  onOpenFolder: () => void;
  onNewProject?: () => void;
  onOpenSearchEverywhere?: () => void;
}

export function WelcomeScreen({ 
  onNewFile, 
  onOpenFile, 
  onOpenFolder,
  onNewProject,
  onOpenSearchEverywhere
}: WelcomeScreenProps) {
  return (
    <div className={styles.welcomeContainer}>
      <div className={styles.content}>
        <div className={styles.heroHeader}>
          <FaRust className={styles.heroLogo} />
          <div>
            <h1 className={styles.title}>Pomai Studio for Rust</h1>
            <p className={styles.subtitle}>High-performance, out-of-the-box IDE for Rust development.</p>
          </div>
        </div>
        
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Start Project</h2>
          <div className={styles.actionGrid}>
            <button className={styles.actionCard} onClick={onNewProject || onNewFile}>
              <VscNewFile className={styles.actionIcon} />
              <div className={styles.actionCardText}>
                <span className={styles.actionTitle}>New Rust Project...</span>
                <span className={styles.actionDesc}>Scaffold Axum, Tokio, Bevy, Leptos, or CLI</span>
              </div>
            </button>

            <button className={styles.actionCard} onClick={onOpenFolder}>
              <VscFolderOpened className={styles.actionIcon} />
              <div className={styles.actionCardText}>
                <span className={styles.actionTitle}>Open Folder...</span>
                <span className={styles.actionDesc}>Open existing Rust crate or Cargo workspace</span>
              </div>
            </button>

            <button className={styles.actionCard} onClick={onOpenSearchEverywhere}>
              <VscSearch className={styles.actionIcon} />
              <div className={styles.actionCardText}>
                <span className={styles.actionTitle}>Search Everywhere</span>
                <span className={styles.actionDesc}>Find files, symbols, types, and actions</span>
              </div>
            </button>

            <button className={styles.actionCard} onClick={onOpenFile}>
              <VscFile className={styles.actionIcon} />
              <div className={styles.actionCardText}>
                <span className={styles.actionTitle}>Open Single File...</span>
                <span className={styles.actionDesc}>Inspect and edit standalone source files</span>
              </div>
            </button>
          </div>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Essential Shortcuts</h2>
          <div className={styles.shortcutGrid}>
            <div className={styles.shortcutItem}>
              <span className={styles.shortcutLabel}>Search Everywhere</span>
              <span className={styles.keybind}>Double Shift</span>
            </div>
            <div className={styles.shortcutItem}>
              <span className={styles.shortcutLabel}>Find in Files</span>
              <span className={styles.keybind}>Ctrl+Shift+F</span>
            </div>
            <div className={styles.shortcutItem}>
              <span className={styles.shortcutLabel}>Toggle Terminal</span>
              <span className={styles.keybind}>Ctrl+`</span>
            </div>
            <div className={styles.shortcutItem}>
              <span className={styles.shortcutLabel}>Toggle Sidebar</span>
              <span className={styles.keybind}>Ctrl+B</span>
            </div>
            <div className={styles.shortcutItem}>
              <span className={styles.shortcutLabel}>Split Editor Right</span>
              <span className={styles.keybind}>Ctrl+\</span>
            </div>
            <div className={styles.shortcutItem}>
              <span className={styles.shortcutLabel}>Go to File</span>
              <span className={styles.keybind}>Ctrl+P</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EmptyScreen() {
  return (
    <div className={styles.emptyContainer}>
      <div className={styles.watermark}>
        <FaRust size={120} />
      </div>
      <div className={styles.shortcuts}>
        <div className={styles.shortcutRow}>
          <span>Search Everywhere</span>
          <span className={styles.keybind}>Double Shift</span>
        </div>
        <div className={styles.shortcutRow}>
          <span>Find in Files</span>
          <span className={styles.keybind}>Ctrl+Shift+F</span>
        </div>
        <div className={styles.shortcutRow}>
          <span>Go to File</span>
          <span className={styles.keybind}>Ctrl+P</span>
        </div>
        <div className={styles.shortcutRow}>
          <span>Toggle Terminal</span>
          <span className={styles.keybind}>Ctrl+`</span>
        </div>
      </div>
    </div>
  );
}
