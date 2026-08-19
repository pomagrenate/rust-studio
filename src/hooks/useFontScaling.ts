/**
 * useFontScaling.ts — Hook for dynamic font scaling with keyboard shortcuts
 * Handles Ctrl+/-/0 shortcuts for editor font size adjustment
 */

import { useState, useEffect, useCallback } from "react";

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

    // Apply settings on mount and when they change
    useEffect(() => {
        applySettings(settings);
        saveSettings(settings);
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
