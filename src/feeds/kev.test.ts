import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { queryKev } from "./kev.js";

const body = readFileSync("tests/fixtures/kev/known_exploited.json", "utf-8");

describe("queryKev", () => {
  it("returns advisories only for products that match inventory names (case-insensitive)", async () => {
    const fetchMock = vi.fn(async () => new Response(body, { status: 200 }));
    const advisories = await queryKev({
      productNames: ["postgres", "next", "redis"],
      fetch: fetchMock as never,
    });
    expect(advisories.length).toBe(1);
    expect(advisories[0]!.sourceId).toBe("CVE-2024-12345");
    expect(advisories[0]!.severity).toBe("critical");
  });
});
