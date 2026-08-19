/**
 * App.tsx — Root component.
 * Opens PyCharm-style WorkspaceLauncher first if no workspace is active,
 * then transitions to the full EditorLayout once a project is opened.
 */

import { useState } from "react";
import { EditorLayout } from "./components/layout/EditorLayout";
import { WorkspaceLauncher } from "./components/launcher/WorkspaceLauncher";
import { useTheme } from "./hooks/useTheme";
import { useFontScaling } from "./hooks/useFontScaling";

export function App() {
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();
  useFontScaling(); // Initialize font scaling with keyboard shortcuts

  if (!activeWorkspace) {
    return (
      <WorkspaceLauncher
        onOpenWorkspace={(path) => setActiveWorkspace(path)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  return (
    <EditorLayout
      initialWorkspace={activeWorkspace}
      onCloseWorkspace={() => setActiveWorkspace(null)}
    />
  );
}

export default App;
