import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  VscSearch,
  VscCheck,
  VscTerminal,
  VscRocket,
  VscFolderOpened
} from "react-icons/vsc";
import { ProjectTemplate, TemplateCategory } from "./types";
import { RUST_PROJECT_TEMPLATES } from "./templates";
import { TemplateCard } from "./TemplateCard";
import styles from "./ProjectWizard.module.css";

interface ProjectWizardProps {
  onProjectCreated: (projectPath: string) => void;
  onCancel: () => void;
}

const CATEGORIES: TemplateCategory[] = [
  "All",
  "Basic",
  "Web Backend",
  "Desktop",
  "Wasm/Frontend",
];

export function ProjectWizard({ onProjectCreated, onCancel }: ProjectWizardProps) {
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate>(RUST_PROJECT_TEMPLATES[0]);

  const [projectName, setProjectName] = useState(RUST_PROJECT_TEMPLATES[0].defaultName);
  const [projectLocation, setProjectLocation] = useState("C:\\Projects");

  const [isScaffolding, setIsScaffolding] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSelectTemplate = (tpl: ProjectTemplate) => {
    setSelectedTemplate(tpl);
    setProjectName(tpl.defaultName);
  };

  const handleBrowseLocation = async () => {
    try {
      if (window.__TAURI_INTERNALS__) {
        const selected = await open({
          directory: true,
          multiple: false,
          title: "Select Destination Directory",
        });
        if (selected && typeof selected === "string") {
          setProjectLocation(selected);
        }
      }
    } catch (err) {
      console.error("Directory browse failed:", err);
    }
  };

  const handleCreate = async () => {
    if (!projectName.trim() || !projectLocation.trim()) return;

    setIsScaffolding(true);
    setErrorMessage("");

    try {
      if (window.__TAURI_INTERNALS__) {
        const createdPath = await invoke<string>("cargo_scaffold_project", {
          parentDir: projectLocation.trim(),
          name: projectName.trim(),
          commands: selectedTemplate.setupCommands,
        });

        await invoke("add_recently_opened", { path: createdPath, isFolder: true });
        onProjectCreated(createdPath);
      } else {
        const mockPath = `${projectLocation}\\${projectName}`;
        onProjectCreated(mockPath);
      }
    } catch (err) {
      setErrorMessage(String(err));
    } finally {
      setIsScaffolding(false);
    }
  };

  const filteredTemplates = RUST_PROJECT_TEMPLATES.filter((tpl) => {
    const matchCategory = selectedCategory === "All" || tpl.category === selectedCategory;
    const matchSearch =
      searchQuery === "" ||
      tpl.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tpl.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tpl.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchCategory && matchSearch;
  });

  return (
    <div className={styles.wizardRoot}>
      {/* Top Header Bar */}
      <div className={styles.wizardHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <VscRocket />
          </div>
          <span className={styles.headerTitle}>Rich Framework Templates</span>
        </div>

        <div className={styles.searchWrapper}>
          <VscSearch className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search templates, crates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Horizontal Category Filter Pills */}
      <div className={styles.categoryPillBar}>
        {CATEGORIES.map((cat) => {
          const count =
            cat === "All"
              ? RUST_PROJECT_TEMPLATES.length
              : RUST_PROJECT_TEMPLATES.filter((t) => t.category === cat).length;

          return (
            <button
              key={cat}
              className={`${styles.categoryPill} ${selectedCategory === cat ? styles.categoryPillActive : ""}`}
              onClick={() => setSelectedCategory(cat)}
            >
              <span>{cat}</span>
              <span className={styles.categoryPillCount}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Templates Grid */}
      <div className={styles.templateGrid}>
        {filteredTemplates.map((tpl) => (
          <TemplateCard
            key={tpl.id}
            template={tpl}
            isSelected={selectedTemplate.id === tpl.id}
            onSelect={() => handleSelectTemplate(tpl)}
          />
        ))}
      </div>

      {/* Configuration Panel for Selected Template */}
      <div className={styles.configPanel}>
        <div className={styles.configHeader}>
          <span className={styles.configTitle}>
            Configure {selectedTemplate.name}
          </span>
          <div className={styles.featuresList}>
            {selectedTemplate.features.map((f, i) => (
              <span key={i} className={styles.featurePill}>
                <VscCheck /> {f}
              </span>
            ))}
          </div>
        </div>

        {errorMessage && (
          <div className={styles.errorBanner}>
            {errorMessage}
          </div>
        )}

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Project Name</label>
            <input
              type="text"
              className={styles.formInput}
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="my_rust_project"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Destination Location</label>
            <div className={styles.inputGroup}>
              <input
                type="text"
                className={styles.formInput}
                style={{ flex: 1 }}
                value={projectLocation}
                onChange={(e) => setProjectLocation(e.target.value)}
              />
              <button
                type="button"
                className={styles.browseBtn}
                onClick={handleBrowseLocation}
              >
                <VscFolderOpened /> Browse...
              </button>
            </div>
          </div>
        </div>

        {/* Real CLI Commands Live Preview */}
        <div className={styles.cliPreviewBox}>
          <div className={styles.cliHeader}>
            <VscTerminal /> Scaffolding Commands (Executed in Shell)
          </div>
          {selectedTemplate.setupCommands.map((cmd, i) => (
            <div key={i} className={styles.cliCommandLine}>
              $ {cmd.replace("{name}", projectName || selectedTemplate.defaultName)}
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className={styles.wizardFooter}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onCancel}
            disabled={isScaffolding}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.primaryCreateBtn}
            onClick={handleCreate}
            disabled={isScaffolding}
          >
            <VscRocket />
            <span>{isScaffolding ? "Scaffolding Project..." : "Create Project"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProjectWizard;
