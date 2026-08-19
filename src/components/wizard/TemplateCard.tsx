import {
  VscTerminal,
  VscLibrary,
  VscGlobe,
  VscWindow,
  VscFlame,
} from "react-icons/vsc";
import { ProjectTemplate } from "./types";
import styles from "./TemplateCard.module.css";

interface TemplateCardProps {
  template: ProjectTemplate;
  isSelected: boolean;
  onSelect: () => void;
}

export function TemplateCard({ template, isSelected, onSelect }: TemplateCardProps) {
  const getCategoryIcon = () => {
    switch (template.category) {
      case "Basic":
        return template.id === "cargo-lib" ? (
          <div className={`${styles.iconWrapper} ${styles.iconBasic}`}>
            <VscLibrary />
          </div>
        ) : (
          <div className={`${styles.iconWrapper} ${styles.iconBasic}`}>
            <VscTerminal />
          </div>
        );
      case "Web Backend":
        return (
          <div className={`${styles.iconWrapper} ${styles.iconWeb}`}>
            <VscGlobe />
          </div>
        );
      case "Desktop":
        return (
          <div className={`${styles.iconWrapper} ${styles.iconDesktop}`}>
            <VscWindow />
          </div>
        );
      case "Wasm/Frontend":
        return (
          <div className={`${styles.iconWrapper} ${styles.iconWasm}`}>
            <VscFlame />
          </div>
        );
      default:
        return (
          <div className={`${styles.iconWrapper} ${styles.iconBasic}`}>
            <VscTerminal />
          </div>
        );
    }
  };

  return (
    <div
      className={`${styles.templateCard} ${isSelected ? styles.templateCardSelected : ""}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      aria-selected={isSelected}
    >
      <div className={styles.cardHeader}>
        {getCategoryIcon()}
        {template.badge && <span className={styles.badge}>{template.badge}</span>}
      </div>

      <div className={styles.templateName}>{template.name}</div>
      <div className={styles.templateDesc}>{template.description}</div>

      <div className={styles.tagList}>
        {template.tags.map((tag) => (
          <span key={tag} className={styles.tag}>
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

export default TemplateCard;
