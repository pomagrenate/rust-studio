/**
 * CommandRegistry.ts - Central command registration system for editor commands
 * VSCode-like command architecture with keybinding support
 */

export interface Command {
  id: string;
  execute: (args?: any) => void | Promise<void>;
}

export interface Keybinding {
  key: string;
  platform?: 'windows' | 'mac' | 'linux';
}

export interface CommandRegistration {
  command: Command;
  keybindings?: Keybinding[];
  when?: string; // Context expression
  title?: string; // Human-readable title
  category?: string; // Category for grouping
}

export interface CommandInfo {
  id: string;
  title?: string;
  category?: string;
  keybindings: Keybinding[];
}

class CommandRegistry {
  private commands: Map<string, Command> = new Map();
  private keybindings: Map<string, string> = new Map(); // key -> commandId
  private registrations: Map<string, CommandRegistration> = new Map(); // Store full registration data

  registerCommand(registration: CommandRegistration): void {
    const { command, keybindings } = registration;
    this.commands.set(command.id, command);
    this.registrations.set(command.id, registration);

    if (keybindings) {
      keybindings.forEach((kb) => {
        const key = this.normalizeKey(kb.key, kb.platform);
        this.keybindings.set(key, command.id);
      });
    }
  }

  getCommand(id: string): Command | undefined {
    return this.commands.get(id);
  }

  executeCommand(id: string, args?: any): void | Promise<void> {
    const command = this.commands.get(id);
    if (command) {
      return command.execute(args);
    }
    console.warn(`Command not found: ${id}`);
  }

  getCommandForKey(key: string, platform?: string): Command | undefined {
    const normalizedKey = this.normalizeKey(key, platform);
    const commandId = this.keybindings.get(normalizedKey);
    if (commandId) {
      return this.commands.get(commandId);
    }
    return undefined;
  }

  getAllCommands(): CommandInfo[] {
    const commands: CommandInfo[] = [];
    this.registrations.forEach((registration, id) => {
      commands.push({
        id,
        title: registration.title,
        category: registration.category,
        keybindings: registration.keybindings || []
      });
    });
    return commands;
  }

  private normalizeKey(key: string, platform?: string): string {
    // Normalize key combinations to a standard format
    // e.g., "Ctrl+A" -> "ctrl+a", "Cmd+A" -> "meta+a" on Mac
    let normalized = key.toLowerCase();
    
    if (platform === 'mac') {
      normalized = normalized.replace('cmd', 'meta');
      normalized = normalized.replace('ctrl', 'ctrl');
    } else {
      normalized = normalized.replace('cmd', 'ctrl');
    }
    
    return normalized;
  }
}

export const commandRegistry = new CommandRegistry();
