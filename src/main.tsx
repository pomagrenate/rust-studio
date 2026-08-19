/**
 * main.tsx — Application entry point.
 *
 * CSS import order matters:
 *   1. globals    — reset + base typography
 *   2. typography — font family, size, weight, and line-height tokens
 *   3. light      — default theme token definitions
 *   4. dark       — overrides when [data-theme="dark"] is set
 *   Components import their own .module.css via CSS Modules.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { activateBuiltinExtensions } from "./extensions/builtin";

// ── Global styles (must be first) ────────────────────────────────────────────
import "./styles/globals.css";
import "./styles/typography.css";
import "./styles/themes/light.css";
import "./styles/themes/dark.css";

// Activate built-in extensions (Git SCM, Outline, Timeline)
activateBuiltinExtensions();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
