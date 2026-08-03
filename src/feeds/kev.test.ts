import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { queryKev } from "./kev.js";

const body = readFileSync("tests/fixtures/kev/known_exploited.json", "utf-8");

function kevBody(entries: Array<Record<string, string>>): string {
  return JSON.stringify({ vulnerabilities: entries });
}

function fetchReturning(text: string) {
  return vi.fn(async () => new Response(text, { status: 200 })) as never;
}

describe("queryKev", () => {
  it("returns advisories only for products that match inventory names (case-insensitive)", async () => {
    const advisories = await queryKev({
      productNames: ["postgres", "redis"],
      fetch: fetchReturning(body),
    });
    expect(advisories.length).toBe(1);
    expect(advisories[0]!.sourceId).toBe("CVE-2024-12345");
    expect(advisories[0]!.severity).toBe("critical");
  });

  it("names the matched inventory item in `affected` so the matcher can join on it", async () => {
    const advisories = await queryKev({
      productNames: ["postgres"],
      fetch: fetchReturning(body),
    });
    expect(advisories[0]!.affected).toEqual([{ packageName: "postgres" }]);
  });

  it("matches a needle at a word start (postgres → PostgreSQL)", async () => {
    const advisories = await queryKev({
      productNames: ["postgres"],
      fetch: fetchReturning(kevBody([{ cveID: "CVE-1", product: "PostgreSQL Server" }])),
    });
    expect(advisories.length).toBe(1);
  });

  it("does not match a needle in the middle of a word (go ≠ mongodb)", async () => {
    const advisories = await queryKev({
      productNames: ["go"],
      fetch: fetchReturning(kevBody([{ cveID: "CVE-2", product: "MongoDB" }])),
    });
    expect(advisories).toEqual([]);
  });

  it("matches a registry-qualified image by its last path segment", async () => {
    const advisories = await queryKev({
      productNames: ["ghcr.io/coollabsio/coolify"],
      fetch: fetchReturning(kevBody([{ cveID: "CVE-3", product: "Coolify" }])),
    });
    expect(advisories[0]!.affected).toEqual([
      { packageName: "ghcr.io/coollabsio/coolify" },
    ]);
  });

  it("lists every matching inventory item on a single advisory", async () => {
    const advisories = await queryKev({
      productNames: ["postgres", "postgresql"],
      fetch: fetchReturning(kevBody([{ cveID: "CVE-4", product: "PostgreSQL" }])),
    });
    expect(advisories).toHaveLength(1);
    expect(advisories[0]!.affected.map((a) => a.packageName).sort()).toEqual([
      "postgres",
      "postgresql",
    ]);
  });
});
