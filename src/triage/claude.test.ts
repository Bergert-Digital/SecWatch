import { describe, it, expect, vi } from "vitest";
import { triageFindings } from "./claude.js";

describe("triageFindings", () => {
  it("calls the Anthropic SDK once with the prompt and parses rankings", async () => {
    const create = vi.fn(async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            rankings: [
              { finding_id: 1, rank: "critical", reason: "auth path" },
              { finding_id: 2, rank: "noise", reason: "dev dep" },
            ],
          }),
        },
      ],
    }));
    const sdk = { messages: { create } } as never;
    const result = await triageFindings({
      sdk,
      findings: [
        {
          findingId: 1,
          advisorySourceId: "A",
          advisorySeverity: "high",
          advisorySummary: "x",
          advisoryDetails: null,
          packageName: "p",
          matchedVersion: "1",
          ecosystem: "npm",
          affected: [],
          sourceRepo: "r",
          sourceFile: "f",
        },
        {
          findingId: 2,
          advisorySourceId: "B",
          advisorySeverity: "low",
          advisorySummary: "y",
          advisoryDetails: null,
          packageName: "q",
          matchedVersion: "2",
          ecosystem: "npm",
          affected: [],
          sourceRepo: "r",
          sourceFile: "f",
        },
      ],
    });
    expect(create).toHaveBeenCalledOnce();
    expect(result.get(1)).toEqual({ rank: "critical", reason: "auth path" });
    expect(result.get(2)).toEqual({ rank: "noise", reason: "dev dep" });
  });

  it("returns empty map on malformed response", async () => {
    const create = vi.fn(async () => ({ content: [{ type: "text", text: "not json" }] }));
    const sdk = { messages: { create } } as never;
    const result = await triageFindings({
      sdk,
      findings: [
        {
          findingId: 1,
          advisorySourceId: "A",
          advisorySeverity: null,
          advisorySummary: "x",
          advisoryDetails: null,
          packageName: "p",
          matchedVersion: "1",
          ecosystem: "npm",
          affected: [],
          sourceRepo: "r",
          sourceFile: "f",
        },
      ],
    });
    expect(result.size).toBe(0);
  });

  it("returns empty map when given no findings (no API call)", async () => {
    const create = vi.fn();
    const sdk = { messages: { create } } as never;
    const result = await triageFindings({ sdk, findings: [] });
    expect(create).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });
});
