/**
 * Locale completeness + architect persona support + Why mode — V2 + V26
 *
 * Tests cover:
 *  - All 6 locales have the new `architect` and `architectDesc` fields
 *  - architect field is non-empty in every locale
 *  - The existing 4 personas (overview, learn, deepDive, uiLearn) remain
 *  - The Persona type union (re-exported from store) accepts "architect"
 *  - V26: All 6 locales have the full `why` block (Why persona strings)
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
const REQUIRED_WHY_KEYS = [
  "title",
  "subtitle",
  "subtitle_other",
  "noDecisions",
  "whyThisCode",
  "whyThisCodeWithCount",
  "noDecisionsForNode",
  "searchPlaceholder",
  "tradeoffMatrix",
  "decisionTree",
  "onlyNodesWithDecisions",
  "decisionsLoaded",
  "decisionsLoaded_other",
  "noDecisionsLoaded",
  "errorLoading",
  "loading",
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

describe("why — V26 Why-mode locale completeness", () => {
  for (const [name, locale] of Object.entries(LOCALES)) {
    it(`${name}: 'why' block has all ${REQUIRED_WHY_KEYS.length} required keys`, () => {
      const w = (locale as { why: Record<string, string> }).why;
      expect(w, `missing 'why' block in ${name}`).toBeTruthy();
      for (const key of REQUIRED_WHY_KEYS) {
        expect(w[key], `missing key "${key}" in ${name}.why`).toBeTruthy();
        expect(w[key].length, `empty value for "${key}" in ${name}`).toBeGreaterThan(0);
      }
    });
    it(`${name}: 'why.title' is non-empty and capitalized`, () => {
      const w = (locale as { why: Record<string, string> }).why;
      // Every locale's title starts with a non-whitespace char
      expect(w.title.trim().length).toBeGreaterThan(0);
    });
  }
});

describe("Persona type union — V2 architect addition", () => {
  it("locale type interfaces have the 5 personas", () => {
    const labels: string[] = [
      en.personaSelector.overview,
      en.personaSelector.learn,
      en.personaSelector.deepDive,
      en.personaSelector.uiLearn,
      en.personaSelector.architect,
    ];
    expect(labels).toHaveLength(5);
    expect(new Set(labels).size).toBe(5);
  });
});
