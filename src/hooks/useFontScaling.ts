/**
 * useFontScaling.ts — Hook for dynamic font scaling with keyboard shortcuts
 * Handles Ctrl+/-/0 shortcuts for editor font size adjustment
 */

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

const STORAGE_KEY = "pm-font-settings";

interface FontSettings {
    editorFontSize: number;
    editorFontFamily: string;
    editorLineHeight: number;
    editorFontLigatures: boolean;
    uiFontSize: number;
    uiFontFamily: string;
}

const DEFAULT_SETTINGS: FontSettings = {
    editorFontSize: 14,
    editorFontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace",
    editorLineHeight: 1.5,
    editorFontLigatures: true,
    uiFontSize: 13,
    uiFontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

function loadSettings(): FontSettings {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
        } catch {
            return DEFAULT_SETTINGS;
        }
    }
    return DEFAULT_SETTINGS;
}

function saveSettings(settings: FontSettings): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function applySettings(settings: FontSettings): void {
    const root = document.documentElement;
    root.style.setProperty('--editor-font-size', `${settings.editorFontSize}px`);
    root.style.setProperty('--editor-font-family', settings.editorFontFamily);
    root.style.setProperty('--editor-line-height', settings.editorLineHeight.toString());
    root.style.setProperty('--editor-font-ligatures', settings.editorFontLigatures ? '"liga" 1, "calt" 1' : 'normal');
    root.style.setProperty('--ui-font-size', `${settings.uiFontSize}px`);
    root.style.setProperty('--ui-font-family', settings.uiFontFamily);
}

export function useFontScaling() {
    const [settings, setSettings] = useState<FontSettings>(loadSettings);

    // Initial load from backend disk storage
    useEffect(() => {
        invoke<any>("get_user_settings")
            .then((res) => {
                if (res) {
                    setSettings((prev) => ({
                        ...prev,
                        editorFontSize: res.editor_font_size ?? prev.editorFontSize,
                        editorFontFamily: res.editor_font_family ?? prev.editorFontFamily,
                        editorLineHeight: res.editor_line_height ?? prev.editorLineHeight,
                        editorFontLigatures: res.editor_font_ligatures ?? prev.editorFontLigatures,
                        uiFontSize: res.ui_font_size ?? prev.uiFontSize,
                        uiFontFamily: res.ui_font_family ?? prev.uiFontFamily,
                    }));
                }
            })
            .catch(() => {});
    }, []);

    // Apply settings on mount and sync to disk & localStorage
    useEffect(() => {
        applySettings(settings);
        saveSettings(settings);
        invoke("save_user_settings", {
            settings: {
                editor_font_size: settings.editorFontSize,
                editor_font_family: settings.editorFontFamily,
                editor_line_height: settings.editorLineHeight,
                editor_font_ligatures: settings.editorFontLigatures,
                ui_font_size: settings.uiFontSize,
                ui_font_family: settings.uiFontFamily,
            },
        }).catch(() => {});
    }, [settings]);

    // Font scaling functions
    const increaseFontSize = useCallback(() => {
        setSettings((prev: FontSettings) => ({
            ...prev,
            editorFontSize: Math.min(32, prev.editorFontSize + 1)
        }));
    }, []);

    const decreaseFontSize = useCallback(() => {
        setSettings((prev: FontSettings) => ({
            ...prev,
            editorFontSize: Math.max(10, prev.editorFontSize - 1)
        }));
    }, []);

    const resetFontSize = useCallback(() => {
        setSettings((prev: FontSettings) => ({
            ...prev,
            editorFontSize: DEFAULT_SETTINGS.editorFontSize
        }));
    }, []);

    const updateSettings = useCallback((newSettings: Partial<FontSettings>) => {
        setSettings((prev: FontSettings) => ({ ...prev, ...newSettings }));
    }, []);

    // Keyboard shortcuts for font scaling
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl + + or Ctrl + = to increase font size
            if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
                e.preventDefault();
                increaseFontSize();
            }
            // Ctrl + - to decrease font size
            else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
                e.preventDefault();
                decreaseFontSize();
            }
            // Ctrl + 0 to reset font size
            else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
                e.preventDefault();
                resetFontSize();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [increaseFontSize, decreaseFontSize, resetFontSize]);

    return {
        settings,
        updateSettings,
        increaseFontSize,
        decreaseFontSize,
        resetFontSize,
    };
}
