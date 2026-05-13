import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { queryOsv } from "./osv.js";

const responseBody = readFileSync("tests/fixtures/osv/querybatch-response.json", "utf-8");

describe("queryOsv", () => {
  it("batches the inventory into ecosystem-appropriate queries and parses advisories", async () => {
    const fetchMock = vi.fn(async () => new Response(responseBody, { status: 200 }));
    const advisories = await queryOsv({
      items: [
        {
          ecosystem: "npm",
          name: "next",
          version: "14.2.3",
          sourceRepo: "Bergert-Digital/feldova",
          sourceFile: "package.json",
        },
        {
          ecosystem: "go",
          name: "github.com/gin-gonic/gin",
          version: "v1.10.0",
          sourceRepo: "Bergert-Digital/x",
          sourceFile: "go.mod",
        },
      ],
      fetch: fetchMock as never,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(advisories.length).toBe(1);
    expect(advisories[0]!.source).toBe("osv");
    expect(advisories[0]!.sourceId).toBe("GHSA-7gfc-8cq8-jh5f");
    expect(advisories[0]!.severity).toBe("high");
    expect(advisories[0]!.affected[0]!.packageName).toBe("next");
  });

  it("chunks queries when inventory exceeds batchSize", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as { queries: unknown[] };
      // Each batch posts <= batchSize queries; we'll fake an empty vulns response per batch
      const results = body.queries.map(() => ({ vulns: [] }));
      return new Response(JSON.stringify({ results }), { status: 200 });
    });
    // 2500 items @ batchSize=1000 → 3 calls
    const items = Array.from({ length: 2500 }, (_, i) => ({
      ecosystem: "npm" as const,
      name: `pkg-${i}`,
      version: "1.0.0",
      sourceRepo: "r",
      sourceFile: "package.json",
    }));
    await queryOsv({ items, fetch: fetchMock as never, batchSize: 1000 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const callSizes = fetchMock.mock.calls.map((c) => {
      const body = JSON.parse((c[1] as RequestInit).body as string) as { queries: unknown[] };
      return body.queries.length;
    });
    expect(callSizes).toEqual([1000, 1000, 500]);
  });

  it("deduplicates advisories across batches", async () => {
    const dupBody = JSON.stringify({
      results: [{ vulns: [{ id: "GHSA-dup", summary: "x", affected: [] }] }],
    });
    const fetchMock = vi.fn(async () => new Response(dupBody, { status: 200 }));
    const items = Array.from({ length: 2 }, (_, i) => ({
      ecosystem: "npm" as const,
      name: `pkg-${i}`,
      version: "1.0.0",
      sourceRepo: "r",
      sourceFile: "package.json",
    }));
    const advisories = await queryOsv({ items, fetch: fetchMock as never, batchSize: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(advisories.length).toBe(1);
  });
});
