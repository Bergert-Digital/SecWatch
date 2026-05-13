import { describe, it, expect } from "vitest";
import { renderEmail, type EmailFinding } from "./render.js";

const f = (over: Partial<EmailFinding> = {}): EmailFinding => ({
  rank: "critical",
  advisorySourceId: "GHSA-x",
  advisorySummary: "Auth bypass",
  advisoryUrl: "https://example.com/x",
  severity: "high",
  packageName: "next",
  matchedVersion: "14.2.3",
  ecosystem: "npm",
  sourceRepo: "Bergert-Digital/feldova",
  sourceFile: "package.json",
  triageReason: "package used in auth",
  ...over,
});

describe("renderEmail", () => {
  it("daily subject reflects new count + critical count", () => {
    const { subject } = renderEmail({
      kind: "daily",
      findings: [
        f({ rank: "critical" }),
        f({ rank: "probably_relevant" }),
        f({ rank: "probably_relevant" }),
      ],
    });
    expect(subject).toBe("SecWatch: 3 new findings (1 critical)");
  });

  it("weekly heartbeat subject when zero findings", () => {
    const { subject } = renderEmail({ kind: "weekly_heartbeat", findings: [] });
    expect(subject).toBe("SecWatch: all clear this week");
  });

  it("weekly recap subject reflects week count", () => {
    const { subject } = renderEmail({
      kind: "weekly_recap",
      findings: [f(), f({ rank: "noise" })],
    });
    expect(subject).toBe("SecWatch: weekly summary — 2 findings, 1 critical");
  });

  it("HTML body groups by rank with critical fully expanded", () => {
    const { html, text } = renderEmail({
      kind: "daily",
      findings: [f({ rank: "critical" }), f({ rank: "noise", advisorySourceId: "CVE-2" })],
    });
    expect(html).toContain("CRITICAL");
    expect(html).toContain("GHSA-x");
    expect(html).toContain("hidden as noise");
    expect(text).toContain("CRITICAL");
    expect(text).toContain("CVE-2");
  });
});
