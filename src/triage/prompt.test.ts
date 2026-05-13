import { describe, it, expect } from "vitest";
import { buildTriagePrompt } from "./prompt.js";

describe("buildTriagePrompt", () => {
  it("emits a self-contained prompt with one finding block per item", () => {
    const prompt = buildTriagePrompt([
      {
        findingId: 1,
        advisorySourceId: "GHSA-x",
        advisorySeverity: "high",
        advisorySummary: "Auth bypass",
        advisoryDetails: "Long details here",
        packageName: "next",
        matchedVersion: "14.2.3",
        ecosystem: "npm",
        affected: [
          {
            ecosystem: "npm",
            packageName: "next",
            ranges: [{ type: "SEMVER", introduced: "0", fixed: "14.2.31" }],
          },
        ],
        sourceRepo: "Bergert-Digital/feldova",
        sourceFile: "package.json",
      },
    ]);
    expect(prompt).toContain("finding_id: 1");
    expect(prompt).toContain("GHSA-x");
    expect(prompt).toContain("next@14.2.3");
    expect(prompt).toContain("Be conservative");
    expect(prompt).toMatch(/Output JSON:/);
  });

  it("includes all findings in one prompt", () => {
    const prompt = buildTriagePrompt([
      {
        findingId: 1,
        advisorySourceId: "A",
        advisorySeverity: null,
        advisorySummary: "x",
        advisoryDetails: null,
        packageName: "a",
        matchedVersion: "1",
        ecosystem: "npm",
        affected: [],
        sourceRepo: "r",
        sourceFile: "f",
      },
      {
        findingId: 2,
        advisorySourceId: "B",
        advisorySeverity: null,
        advisorySummary: "y",
        advisoryDetails: null,
        packageName: "b",
        matchedVersion: "2",
        ecosystem: "npm",
        affected: [],
        sourceRepo: "r",
        sourceFile: "f",
      },
    ]);
    expect(prompt).toContain("finding_id: 1");
    expect(prompt).toContain("finding_id: 2");
  });
});
