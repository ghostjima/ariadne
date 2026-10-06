import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@ghostjima/stoa-tokens/tokens.css";
import "./styles.css";
import { App } from "./App";

// lang, dir and the theme were set before the first paint by the script
// in index.html; useAppPreferences reads the same choices.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
