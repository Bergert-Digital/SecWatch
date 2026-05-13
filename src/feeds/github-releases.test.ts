import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { queryGithubReleases } from "./github-releases.js";

const body = readFileSync("tests/fixtures/github/coolify-releases.atom", "utf-8");

describe("queryGithubReleases", () => {
  it("returns only entries whose title/content matches security keywords", async () => {
    const fetchMock = vi.fn(async () => new Response(body, { status: 200 }));
    const advisories = await queryGithubReleases({
      services: [{ name: "coolify", github: "coollabsio/coolify" }],
      fetch: fetchMock as never,
    });
    expect(advisories.length).toBe(1);
    expect(advisories[0]!.sourceId).toContain("v4.0.0-beta.425");
    expect(advisories[0]!.summary).toContain("Security");
  });
});
