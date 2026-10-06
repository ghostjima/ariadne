// The language and the theme of the desk: one description, read before
// the first paint by the script vite.config.ts inlines into index.html,
// and at run time by useAppPreferences. Russian first, and the default.
// No React here, so the build can import it.
import type { FirstPaintConfig } from "@ghostjima/stoa-react/first-paint";

export const PREFERENCES: FirstPaintConfig = {
  languages: ["ru", "en"],
  language: { param: "lang", storageKey: "ariadne.lang" },
  theme: { param: "theme", storageKey: "ariadne.theme" },
};
