/**
 * Privacy Classification — PII detector + redaction (V23/30)
 *
 * Detects common PII patterns in memory content:
 *   - email addresses
 *   - phone numbers
 *   - credit card numbers
 *   - SSN-like (XXX-XX-XXXX)
 *   - IPv4 addresses
 *
 * Borrowed from agentmemory's `privacy.ts` function.
 */

export type SensitivityLevel = "public" | "internal" | "confidential" | "restricted";

export interface PIIMatch {
  type: "email" | "phone" | "creditcard" | "ssn" | "ipv4" | "apikey" | "url";
  value: string;
  start: number;
  end: number;
}

const PATTERNS: Array<{ type: PIIMatch["type"]; re: RegExp }> = [
  { type: "email", re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { type: "phone", re: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}/g },
  { type: "creditcard", re: /\b(?:\d[ -]*?){13,19}\b/g },
  { type: "ssn", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: "ipv4", re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  { type: "apikey", re: /\b(?:sk-|pk-|ghp_|api_)[a-zA-Z0-9_-]{20,}\b/g },
  { type: "url", re: /https?:\/\/[^\s<>"']+/g },
];

export class PrivacyClassifier {
  private customPatterns: Array<{ type: PIIMatch["type"]; re: RegExp }> = [];

  addPattern(type: PIIMatch["type"], re: RegExp): void {
    this.customPatterns.push({ type, re });
  }

  detect(text: string): PIIMatch[] {
    const out: PIIMatch[] = [];
    const all = [...PATTERNS, ...this.customPatterns];
    for (const { type, re } of all) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        out.push({ type, value: m[0], start: m.index, end: m.index + m[0].length });
        if (m[0].length === 0) re.lastIndex++;
      }
    }
    out.sort((a, b) => a.start - b.start);
    return out;
  }

  /** Determine sensitivity level based on detected PII. */
  classify(text: string): SensitivityLevel {
    const matches = this.detect(text);
    if (matches.some((m) => m.type === "creditcard" || m.type === "ssn" || m.type === "apikey")) {
      return "restricted";
    }
    if (matches.some((m) => m.type === "email" || m.type === "phone")) {
      return "confidential";
    }
    if (matches.some((m) => m.type === "ipv4" || m.type === "url")) {
      return "internal";
    }
    return "public";
  }

  /** Redact detected PII, replacing with type-tagged placeholder. */
  redact(text: string): string {
    const matches = this.detect(text);
    if (matches.length === 0) return text;
    let out = "";
    let cursor = 0;
    for (const m of matches) {
      out += text.slice(cursor, m.start);
      out += `[REDACTED_${m.type.toUpperCase()}]`;
      cursor = m.end;
    }
    out += text.slice(cursor);
    return out;
  }
}
