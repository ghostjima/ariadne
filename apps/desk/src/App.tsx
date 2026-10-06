import { useLayoutEffect } from "react";
import { AppHeader, I18nProvider, LanguageSwitch, PageShell, ThemeSwitch, useAppPreferences, useBreakpoint } from "@ghostjima/stoa-react";
import { Desk } from "./desk/Desk";
import { LANGUAGES, LOCALES, isLang, strings } from "./i18n";
import { PREFERENCES } from "./preferences";

export function App() {
  const { language, theme } = useAppPreferences(PREFERENCES);
  const narrow = useBreakpoint() === "narrow";
  const lang = isLang(language.language) ? language.language : "ru";
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
            // On a phone the subtitle would take the header two more
            // lines; the title names the desk.
            subtitle={narrow ? undefined : t.subtitle}
            actions={
              <>
                <ThemeSwitch value={theme.choice} onChange={theme.setChoice} />
                <LanguageSwitch languages={LANGUAGES} value={lang} onChange={language.setLanguage} />
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
