/**
 * useKeybindings.ts - Hook to extract and format keybindings from command registry
 * Provides filtered and searchable keybinding data for the settings panel
 */

import { useMemo, useState } from 'react';
import { commandRegistry, Keybinding } from '../components/editor/commands/CommandRegistry';

export interface KeybindingEntry {
  id: string;
  title?: string;
  category?: string;
  keybindings: string[]; // Formatted keybinding strings for current platform
  commandId: string;
}

export interface UseKeybindingsReturn {
  keybindings: KeybindingEntry[];
  categories: string[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  filteredKeybindings: KeybindingEntry[];
}

/**
 * Get current platform for keybinding display
 */
function getCurrentPlatform(): 'windows' | 'mac' | 'linux' {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('mac')) return 'mac';
  if (userAgent.includes('linux')) return 'linux';
  return 'windows';
}

/**
 * Format keybinding for display
 * Converts "Ctrl+C" to "Ctrl + C" with proper platform-specific modifiers
 */
function formatKeybinding(key: string, platform: 'windows' | 'mac' | 'linux'): string {
  // Replace common key names with display-friendly versions
  let formatted = key
    .replace(/Ctrl/g, 'Ctrl')
    .replace(/Cmd/g, platform === 'mac' ? 'Cmd' : 'Ctrl')
    .replace(/Alt/g, 'Alt')
    .replace(/Shift/g, 'Shift')
    .replace(/Meta/g, 'Cmd')
    .replace(/Control/g, 'Ctrl')
    .replace(/Arrow/g, '')
    .replace(/Left/g, '←')
    .replace(/Right/g, '→')
    .replace(/Up/g, '↑')
    .replace(/Down/g, '↓')
    .replace(/Home/g, 'Home')
    .replace(/End/g, 'End')
    .replace(/PageUp/g, 'Page Up')
    .replace(/PageDown/g, 'Page Down')
    .replace(/Space/g, 'Space')
    .replace(/Tab/g, 'Tab')
    .replace(/Enter/g, 'Enter')
    .replace(/Escape/g, 'Esc')
    .replace(/Backspace/g, 'Backspace')
    .replace(/Delete/g, 'Delete')
    .replace(/Insert/g, 'Insert');

  // Add spaces around + signs
  formatted = formatted.replace(/\+/g, ' + ');

  // Clean up extra spaces
  formatted = formatted.replace(/\s+/g, ' ').trim();

  return formatted;
}

/**
 * Extract keybindings for current platform from command
 */
function extractPlatformKeybindings(keybindings: Keybinding[], platform: 'windows' | 'mac' | 'linux'): string[] {
  const platformSpecific = keybindings.filter(kb => 
    !kb.platform || kb.platform === platform
  );

  // If no platform-specific bindings, use all bindings
  const bindingsToUse = platformSpecific.length > 0 ? platformSpecific : keybindings;

  return bindingsToUse.map(kb => formatKeybinding(kb.key, platform));
}

/**
 * Hook to access and filter keybindings
 */
export function useKeybindings(): UseKeybindingsReturn {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const platform = getCurrentPlatform();

  const keybindings = useMemo((): KeybindingEntry[] => {
    const commands = commandRegistry.getAllCommands();
    
    return commands.map(cmd => ({
      id: cmd.id,
      title: cmd.title || cmd.id,
      category: cmd.category || 'Other',
      keybindings: extractPlatformKeybindings(cmd.keybindings, platform),
      commandId: cmd.id
    }));
  }, [platform]);

  const categories = useMemo((): string[] => {
    const cats = new Set(keybindings.map(kb => kb.category).filter((cat): cat is string => cat !== undefined));
    return ['All', ...Array.from(cats).sort()];
  }, [keybindings]);

  const filteredKeybindings = useMemo((): KeybindingEntry[] => {
    let filtered = keybindings;

    // Filter by category
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(kb => kb.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(kb =>
        kb.title?.toLowerCase().includes(query) ||
        kb.id.toLowerCase().includes(query) ||
        kb.category?.toLowerCase().includes(query) ||
        kb.keybindings.some(kb => kb.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [keybindings, searchQuery, selectedCategory]);

  return {
    keybindings,
    categories,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    filteredKeybindings
  };
}
