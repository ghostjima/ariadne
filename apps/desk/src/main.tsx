import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyLanguage, applyTheme, readLanguage, readThemeChoice } from "@ghostjima/stoa-react";
import "@ghostjima/stoa-tokens/tokens.css";
import "./styles.css";
import { App, LANGUAGE_STORE, THEME_STORE } from "./App";
import { LANGUAGES } from "./i18n";

// Before the first paint, so a dark page does not flash light and an
// Arabic one does not flash left to right.
applyTheme(readThemeChoice(THEME_STORE));
applyLanguage(readLanguage(LANGUAGES, LANGUAGE_STORE));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
