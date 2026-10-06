// Before the bundle arrives, the script vite.config.ts inlines into
// index.html (Stoa's firstPaintScript over the desk's PREFERENCES) sets
// lang, dir and the theme. These run that script as the browser would and
// check it reads the choices the application reads: the link first, then
// the stored choice under the desk's keys, then Russian and the system
// theme.
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { firstPaintScript } from "@ghostjima/stoa-react/first-paint";
import { LANGUAGES } from "./i18n";
import { PREFERENCES } from "./preferences";

/** Runs the script with a link query and a stored value; returns lang,
 * dir and data-theme. */
function firstPaint(search: string, stored: Record<string, string> = {}, storage = true) {
  const attributes = new Map<string, string>();
  const root = {
    lang: "",
    dir: "",
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
  };
  runInNewContext(firstPaintScript(PREFERENCES), {
    location: { search },
    URLSearchParams,
    localStorage: storage
      ? { getItem: (key: string) => stored[key] ?? null }
      : {
          getItem: () => {
            throw new Error("storage is blocked");
          },
        },
    document: { documentElement: root, head: { appendChild: () => {} }, createElement: () => ({ setAttribute: () => {} }) },
  });
  return [root.lang, root.dir, attributes.get("data-theme") ?? "system"];
}

describe("the first-paint script", () => {
  it("opens in Russian, the default, left to right, on the system theme", () => {
    expect(LANGUAGES[0]).toBe("ru");
    expect(firstPaint("")).toEqual(["ru", "ltr", "system"]);
  });

  it("knows both languages of the desk, and nothing else", () => {
    for (const lang of LANGUAGES) expect(firstPaint(`?lang=${lang}`)[0]).toBe(lang);
    expect(firstPaint("?lang=ar")[0]).toBe("ru");
  });

  it("reads the stored choices under the desk's keys, after the link", () => {
    expect(PREFERENCES.language).toMatchObject({ storageKey: "ariadne.lang" });
    expect(firstPaint("", { "ariadne.lang": "en", "ariadne.theme": "dark" })).toEqual(["en", "ltr", "dark"]);
    expect(firstPaint("?lang=ru&theme=light", { "ariadne.lang": "en", "ariadne.theme": "dark" })).toEqual(["ru", "ltr", "light"]);
    // The keys of the apps before the merge are not read.
    expect(firstPaint("", { "argus-desk.lang": "en", "ariadne-agent.theme": "dark" })).toEqual(["ru", "ltr", "system"]);
  });

  it("falls back to the defaults with storage blocked", () => {
    expect(firstPaint("", {}, false)).toEqual(["ru", "ltr", "system"]);
    expect(firstPaint("?lang=en", {}, false)[0]).toBe("en");
  });
});
