/**
 * KeybindingsSettings.tsx - Interactive Keyboard Shortcuts Table
 * Displays all registered commands with their keybindings, searchable and filterable
 */

import { VscSearch, VscSettings } from 'react-icons/vsc';
import { useKeybindings } from '../../hooks/useKeybindings';
import styles from './KeybindingsSettings.module.css';

export function KeybindingsSettings() {
  const {
    keybindings,
    categories,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    filteredKeybindings
  } = useKeybindings();

  return (
    <div className={styles.container}>
      {/* Search and Filter Bar */}
      <div className={styles.searchBar}>
        <div className={styles.searchInputWrapper}>
          <VscSearch className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search commands, keybindings, or categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>
        
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className={styles.categorySelect}
        >
          {categories.map(category => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      {/* Keybindings Table */}
      <div className={styles.tableContainer}>
        {filteredKeybindings.length === 0 ? (
          <div className={styles.emptyState}>
            <VscSettings className={styles.emptyIcon} />
            <p className={styles.emptyText}>
              {searchQuery || selectedCategory !== 'All'
                ? 'No keybindings match your search'
                : 'No keybindings registered'}
            </p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.headerCell}>Command</th>
                <th className={styles.headerCell}>Keybinding</th>
                <th className={styles.headerCell}>Category</th>
                <th className={styles.headerCell}>Command ID</th>
              </tr>
            </thead>
            <tbody>
              {filteredKeybindings.map((kb) => (
                <tr key={kb.id} className={styles.row}>
                  <td className={styles.cell}>
                    <span className={styles.commandTitle}>{kb.title}</span>
                  </td>
                  <td className={styles.cell}>
                    {kb.keybindings.length > 0 ? (
                      <div className={styles.keybindingBadges}>
                        {kb.keybindings.map((keybinding, idx) => (
                          <kbd key={idx} className={styles.keyBadge}>
                            {keybinding}
                          </kbd>
                        ))}
                      </div>
                    ) : (
                      <span className={styles.noKeybinding}>No keybinding</span>
                    )}
                  </td>
                  <td className={styles.cell}>
                    <span className={styles.categoryBadge}>{kb.category}</span>
                  </td>
                  <td className={styles.cell}>
                    <code className={styles.commandId}>{kb.commandId}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer Stats */}
      <div className={styles.footer}>
        <span className={styles.stats}>
          Showing {filteredKeybindings.length} of {keybindings.length} keybindings
        </span>
      </div>
    </div>
  );
}

export default KeybindingsSettings;
