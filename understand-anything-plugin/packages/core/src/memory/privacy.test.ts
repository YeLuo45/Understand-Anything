/**
 * Privacy Classifier Tests (V23/30 — Direction A R1)
 */

import { describe, it, expect } from "vitest";
import { PrivacyClassifier } from "./privacy.js";

describe("PrivacyClassifier — detect PII", () => {
  const pc = new PrivacyClassifier();

  it("detects email addresses", () => {
    const m = pc.detect("Contact me at user@example.com please");
    expect(m.length).toBe(1);
    expect(m[0]?.type).toBe("email");
    expect(m[0]?.value).toBe("user@example.com");
  });

  it("detects multiple emails", () => {
    const m = pc.detect("a@b.com and c@d.org");
    expect(m.length).toBe(2);
  });

  it("detects phone numbers", () => {
    const m = pc.detect("Call 555-123-4567 or (555) 987-6543");
    expect(m.some((x) => x.type === "phone")).toBe(true);
  });

  it("detects SSN", () => {
    const m = pc.detect("SSN: 123-45-6789");
    expect(m.some((x) => x.type === "ssn")).toBe(true);
  });

  it("detects credit card numbers", () => {
    const m = pc.detect("Card: 4111 1111 1111 1111");
    expect(m.some((x) => x.type === "creditcard")).toBe(true);
  });

  it("detects IPv4", () => {
    const m = pc.detect("Server at 192.168.1.1");
    expect(m.some((x) => x.type === "ipv4")).toBe(true);
  });

  it("detects API keys", () => {
    const m = pc.detect("Key: sk-abcdefghijklmnopqrstuvwxyz1234567890");
    expect(m.some((x) => x.type === "apikey")).toBe(true);
  });

  it("detects URLs", () => {
    const m = pc.detect("Visit https://example.com/path");
    expect(m.some((x) => x.type === "url")).toBe(true);
  });

  it("returns empty for clean text", () => {
    expect(pc.detect("hello world")).toEqual([]);
  });
});

describe("PrivacyClassifier — classify", () => {
  const pc = new PrivacyClassifier();

  it("classifies clean text as public", () => {
    expect(pc.classify("hello world")).toBe("public");
  });

  it("classifies email as confidential", () => {
    expect(pc.classify("user@example.com")).toBe("confidential");
  });

  it("classifies phone as confidential", () => {
    expect(pc.classify("555-123-4567")).toBe("confidential");
  });

  it("classifies SSN as restricted", () => {
    expect(pc.classify("123-45-6789")).toBe("restricted");
  });

  it("classifies credit card as restricted", () => {
    expect(pc.classify("4111 1111 1111 1111")).toBe("restricted");
  });

  it("classifies API key as restricted", () => {
    expect(pc.classify("sk-abcdefghijklmnopqrstuvwxyz1234567890")).toBe("restricted");
  });

  it("classifies IP as internal", () => {
    expect(pc.classify("192.168.1.1")).toBe("internal");
  });

  it("restricted wins over confidential (highest severity)", () => {
    expect(pc.classify("user@example.com 123-45-6789")).toBe("restricted");
  });
});

describe("PrivacyClassifier — redact", () => {
  const pc = new PrivacyClassifier();

  it("redacts emails", () => {
    expect(pc.redact("contact user@example.com")).toBe("contact [REDACTED_EMAIL]");
  });

  it("redacts multiple PII", () => {
    const r = pc.redact("Email: a@b.com, IP: 1.2.3.4");
    expect(r).toContain("[REDACTED_EMAIL]");
    expect(r).toContain("[REDACTED_IPV4]");
  });

  it("returns text unchanged when no PII", () => {
    expect(pc.redact("hello")).toBe("hello");
  });

  it("preserves non-PII text around redactions", () => {
    const r = pc.redact("see user@example.com for details");
    expect(r.startsWith("see ")).toBe(true);
    expect(r.endsWith(" for details")).toBe(true);
  });
});

describe("PrivacyClassifier — custom patterns", () => {
  it("supports custom pattern", () => {
    const pc = new PrivacyClassifier();
    pc.addPattern("ssn", /EMP-\d{6}/g);
    const m = pc.detect("Employee EMP-123456");
    expect(m.some((x) => x.value === "EMP-123456")).toBe(true);
  });
});
