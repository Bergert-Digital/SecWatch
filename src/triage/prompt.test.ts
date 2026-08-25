import { describe, it, expect } from "vitest";
import { buildTriagePrompt } from "./prompt.js";

describe("buildTriagePrompt", () => {
  it("emits a self-contained prompt with one finding block per item", () => {
    const prompt = buildTriagePrompt([
      {
        findingId: 1,
        advisorySourceId: "CVE-2026-1",
        advisorySeverity: "critical",
        advisorySummary: "Traefik auth bypass",
        advisoryDetails: "Long details here",
        packageName: "traefik",
        matchedVersion: "3.4",
        ecosystem: "service",
        affected: [{ packageName: "traefik", versions: ["3.4", "3.3"] }],
        sourceRepo: "services.yaml",
        sourceFile: "services.yaml",
      },
    ]);
    expect(prompt).toContain("finding_id: 1");
    expect(prompt).toContain("CVE-2026-1");
    expect(prompt).toContain("traefik@3.4");
    expect(prompt).toContain("traefik: 3.4, 3.3");
    expect(prompt).toContain("Be conservative");
    expect(prompt).toMatch(/Output JSON:/);
  });

  it("says 'all versions' when the advisory gives no version list", () => {
    const prompt = buildTriagePrompt([
      {
        findingId: 1,
        advisorySourceId: "CVE-2026-2",
        advisorySeverity: null,
        advisorySummary: "x",
        advisoryDetails: null,
        packageName: "postgres",
        matchedVersion: null,
        ecosystem: "docker",
        affected: [{ packageName: "postgres" }],
        sourceRepo: "Bergert-Digital/feldova",
        sourceFile: "docker-compose.yml",
      },
    ]);
    expect(prompt).toContain("postgres: all versions");
    expect(prompt).toContain("postgres@(unpinned)");
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
        ecosystem: "docker",
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
        ecosystem: "service",
        affected: [],
        sourceRepo: "r",
        sourceFile: "f",
      },
    ]);
    expect(prompt).toContain("finding_id: 1");
    expect(prompt).toContain("finding_id: 2");
  });
});
