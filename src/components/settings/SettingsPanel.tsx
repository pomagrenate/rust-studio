/**
 * SettingsPanel.tsx — Font & Typography Settings
 * Allows users to configure editor and UI fonts, sizes, and other typography settings
 */

import { useState } from "react";
import { VscClose, VscCheck } from "react-icons/vsc";
import { useFontScaling } from "../../hooks/useFontScaling";
import { KeybindingsSettings } from "./KeybindingsSettings";
import styles from "./SettingsPanel.module.css";

interface SettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

type SettingsTab = 'fonts' | 'keybindings';

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
    const { settings, updateSettings } = useFontScaling();
    const [activeTab, setActiveTab] = useState<SettingsTab>('fonts');

    const handleReset = () => {
        updateSettings({
            editorFontSize: 14,
            editorFontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace",
            editorLineHeight: 1.5,
            editorFontLigatures: true,
            uiFontSize: 13,
            uiFontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        });
    };

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <h2 className={styles.title}>Settings</h2>
                    <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
                        <VscClose />
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className={styles.tabs}>
                    <button
                        className={`${styles.tab} ${activeTab === 'fonts' ? styles.tabActive : ''}`}
                        onClick={() => setActiveTab('fonts')}
                    >
                        Fonts
                    </button>
                    <button
                        className={`${styles.tab} ${activeTab === 'keybindings' ? styles.tabActive : ''}`}
                        onClick={() => setActiveTab('keybindings')}
                    >
                        Keybindings
                    </button>
                </div>

                <div className={styles.content}>
                    {activeTab === 'fonts' ? (
                        <>
                            {/* Editor Font Settings */}
                            <section className={styles.section}>
                                <h3 className={styles.sectionTitle}>Editor Font</h3>
                        
                        <div className={styles.settingRow}>
                            <label className={styles.label}>
                                Font Size
                                <span className={styles.labelHint}>10 - 32px</span>
                            </label>
                            <div className={styles.controlGroup}>
                                <input
                                    type="range"
                                    min="10"
                                    max="32"
                                    step="1"
                                    value={settings.editorFontSize}
                                    onChange={(e) => updateSettings({ editorFontSize: parseInt(e.target.value) })}
                                    className={styles.rangeInput}
                                />
                                <span className={styles.valueDisplay}>{settings.editorFontSize}px</span>
                            </div>
                        </div>

                        <div className={styles.settingRow}>
                            <label className={styles.label}>
                                Font Family
                                <span className={styles.labelHint}>Monospace fonts recommended</span>
                            </label>
                            <select
                                value={settings.editorFontFamily}
                                onChange={(e) => updateSettings({ editorFontFamily: e.target.value })}
                                className={styles.selectInput}
                            >
                                <option value="'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace">
                                    JetBrains Mono (Default)
                                </option>
                                <option value="'Fira Code', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace">
                                    Fira Code
                                </option>
                                <option value="'Cascadia Code', Menlo, Monaco, 'Courier New', monospace">
                                    Cascadia Code
                                </option>
                                <option value="'Consolas', 'Monaco', 'Courier New', monospace">
                                    Consolas
                                </option>
                                <option value="'Source Code Pro', 'Menlo', Monaco, 'Courier New', monospace">
                                    Source Code Pro
                                </option>
                                <option value="Menlo, Monaco, 'Courier New', monospace">
                                    Menlo
                                </option>
                                <option value="Monaco, 'Courier New', monospace">
                                    Monaco
                                </option>
                                <option value="'Courier New', monospace">
                                    Courier New
                                </option>
                            </select>
                        </div>

                        <div className={styles.settingRow}>
                            <label className={styles.label}>
                                Line Height
                                <span className={styles.labelHint}>Line spacing multiplier</span>
                            </label>
                            <div className={styles.controlGroup}>
                                <input
                                    type="range"
                                    min="1.0"
                                    max="2.5"
                                    step="0.1"
                                    value={settings.editorLineHeight}
                                    onChange={(e) => updateSettings({ editorLineHeight: parseFloat(e.target.value) })}
                                    className={styles.rangeInput}
                                />
                                <span className={styles.valueDisplay}>{settings.editorLineHeight.toFixed(1)}</span>
                            </div>
                        </div>

                        <div className={styles.settingRow}>
                            <label className={styles.label}>
                                Font Ligatures
                                <span className={styles.labelHint}>Enable programming ligatures (e.g. arrows, operators)</span>
                            </label>
                            <button
                                className={`${styles.toggleBtn} ${settings.editorFontLigatures ? styles.toggleBtnOn : styles.toggleBtnOff}`}
                                onClick={() => updateSettings({ editorFontLigatures: !settings.editorFontLigatures })}
                            >
                                {settings.editorFontLigatures ? <VscCheck /> : null}
                            </button>
                        </div>
                    </section>

                    {/* UI Font Settings */}
                    <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>UI Font</h3>
                        
                        <div className={styles.settingRow}>
                            <label className={styles.label}>
                                Font Size
                                <span className={styles.labelHint}>11 - 16px</span>
                            </label>
                            <div className={styles.controlGroup}>
                                <input
                                    type="range"
                                    min="11"
                                    max="16"
                                    step="1"
                                    value={settings.uiFontSize}
                                    onChange={(e) => updateSettings({ uiFontSize: parseInt(e.target.value) })}
                                    className={styles.rangeInput}
                                />
                                <span className={styles.valueDisplay}>{settings.uiFontSize}px</span>
                            </div>
                        </div>

                        <div className={styles.settingRow}>
                            <label className={styles.label}>
                                Font Family
                                <span className={styles.labelHint}>System UI fonts</span>
                            </label>
                            <select
                                value={settings.uiFontFamily}
                                onChange={(e) => updateSettings({ uiFontFamily: e.target.value })}
                                className={styles.selectInput}
                            >
                                <option value="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif">
                                    System Default
                                </option>
                                <option value="'Segoe UI', Roboto, Helvetica, Arial, sans-serif">
                                    Segoe UI
                                </option>
                                <option value="Roboto, Helvetica, Arial, sans-serif">
                                    Roboto
                                </option>
                                <option value="Helvetica, Arial, sans-serif">
                                    Helvetica
                                </option>
                                <option value="'Inter', -apple-system, BlinkMacSystemFont, sans-serif">
                                    Inter
                                </option>
                            </select>
                        </div>
                    </section>

                    {/* Keyboard Shortcuts Info */}
                    <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Keyboard Shortcuts</h3>
                        <div className={styles.shortcutInfo}>
                            <div className={styles.shortcutRow}>
                                <span className={styles.shortcutKey}>Ctrl + +</span>
                                <span className={styles.shortcutDesc}>Increase editor font size</span>
                            </div>
                            <div className={styles.shortcutRow}>
                                <span className={styles.shortcutKey}>Ctrl + -</span>
                                <span className={styles.shortcutDesc}>Decrease editor font size</span>
                            </div>
                            <div className={styles.shortcutRow}>
                                <span className={styles.shortcutKey}>Ctrl + 0</span>
                                <span className={styles.shortcutDesc}>Reset editor font size to default</span>
                            </div>
                        </div>
                    </section>
                        </>
                    ) : (
                        <KeybindingsSettings />
                    )}
                </div>

                <div className={styles.footer}>
                    <button className={styles.resetBtn} onClick={handleReset}>
                        Reset to Defaults
                    </button>
                    <button className={styles.closeBtnFooter} onClick={onClose}>
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}

export default SettingsPanel;
