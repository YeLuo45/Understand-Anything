/**
 * Locale completeness + architect persona support — V2 Direction A
 *
 * Tests cover:
 *  - All 6 locales have the new `architect` and `architectDesc` fields
 *  - architect field is non-empty in every locale
 *  - The existing 4 personas (overview, learn, deepDive, uiLearn) remain
 *  - The Persona type union (re-exported from store) accepts "architect"
 */
import { describe, it, expect } from "vitest";
import en from "../../locales/en";
import zh from "../../locales/zh";
import zhTW from "../../locales/zh-TW";
import ja from "../../locales/ja";
import ko from "../../locales/ko";
import ru from "../../locales/ru";

const LOCALES = { en, zh, "zh-TW": zhTW, ja, ko, ru } as const;
const REQUIRED_KEYS = ["overview", "learn", "deepDive", "uiLearn", "architect"] as const;
const REQUIRED_DESC_KEYS = [
  "overviewDesc",
  "learnDesc",
  "deepDiveDesc",
  "uiLearnDesc",
  "architectDesc",
] as const;

describe("personaSelector — V2 architect addition", () => {
  for (const [name, locale] of Object.entries(LOCALES)) {
    it(`${name}: personaSelector has all 5 required labels`, () => {
      const ps = locale.personaSelector as Record<string, string>;
      for (const key of REQUIRED_KEYS) {
        expect(ps[key], `missing key "${key}" in ${name}.personaSelector`).toBeTruthy();
        expect(ps[key].length, `empty value for "${key}" in ${name}`).toBeGreaterThan(0);
      }
    });
    it(`${name}: personaSelector has all 5 required descriptions`, () => {
      const ps = locale.personaSelector as Record<string, string>;
      for (const key of REQUIRED_DESC_KEYS) {
        expect(ps[key], `missing key "${key}" in ${name}.personaSelector`).toBeTruthy();
        expect(ps[key].length, `empty value for "${key}" in ${name}`).toBeGreaterThan(0);
      }
    });
    it(`${name}: architect label is distinct from the other 4 personas`, () => {
      const ps = locale.personaSelector as Record<string, string>;
      expect(ps.architect).not.toBe(ps.overview);
      expect(ps.architect).not.toBe(ps.learn);
      expect(ps.architect).not.toBe(ps.deepDive);
      expect(ps.architect).not.toBe(ps.uiLearn);
    });
  }
});

describe("Persona type union — V2 architect addition", () => {
  // We can't `import type { Persona }` here because store.ts pulls in
  // zustand + heavy React deps. Instead, we rely on the literal list
  // exercised by PersonaSelector.tsx being valid TS at build time. The
  // V2 contract is: the union has 5 members including "architect".
  it("locale type interfaces have the 5 personas", () => {
    // Spot check one locale — if the union ever drops "architect" the
    // Locale type would compile-error elsewhere, but we still want a
    // runtime smoke test.
    const labels: string[] = [
      en.personaSelector.overview,
      en.personaSelector.learn,
      en.personaSelector.deepDive,
      en.personaSelector.uiLearn,
      en.personaSelector.architect,
    ];
    expect(labels).toHaveLength(5);
    // No duplicates
    expect(new Set(labels).size).toBe(5);
  });
});
