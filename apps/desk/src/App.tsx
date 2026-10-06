import { useLayoutEffect } from "react";
import {
  AppHeader,
  I18nProvider,
  LanguageSwitch,
  PageShell,
  ThemeSwitch,
  useLanguagePreference,
  useThemePreference,
} from "@ghostjima/stoa-react";
import { Desk } from "./desk/Desk";
import { LANGUAGES, LOCALES, isLang, strings } from "./i18n";

export const THEME_STORE = { param: "theme", storageKey: "argus-desk.theme" };
export const LANGUAGE_STORE = { param: "lang", storageKey: "argus-desk.lang" };

export function App() {
  const theme = useThemePreference(THEME_STORE);
  const { language, setLanguage } = useLanguagePreference({ languages: LANGUAGES, ...LANGUAGE_STORE });
  const lang = isLang(language) ? language : "en";
  const t = strings[lang];

  useLayoutEffect(() => {
    document.title = t.title;
  }, [t]);

  // React Aria (and Stoa through it) takes its locale, words, digits and
  // keyboard direction from here, not from the browser.
  return (
    <I18nProvider locale={LOCALES[lang]}>
      <PageShell
        header={
          <AppHeader
            title={t.title}
            subtitle={t.subtitle}
            actions={
              <>
                <ThemeSwitch value={theme.choice} onChange={theme.setChoice} />
                <LanguageSwitch languages={LANGUAGES} value={lang} onChange={setLanguage} />
              </>
            }
          />
        }
      >
        <Desk lang={lang} t={t} />
      </PageShell>
    </I18nProvider>
  );
}
