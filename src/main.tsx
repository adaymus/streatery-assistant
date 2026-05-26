/**
 * App entry point.
 *
 * React 18's createRoot replaces the old ReactDOM.render API. StrictMode
 * helps catch side-effect bugs in development by intentionally
 * double-invoking certain lifecycle hooks. It's a no-op in production.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import { App } from "./App.js";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root not found in index.html");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
