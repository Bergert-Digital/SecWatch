import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { querySocket } from "./socket.js";

const body = readFileSync("tests/fixtures/socket/threats.atom", "utf-8");

describe("querySocket", () => {
  it("returns advisories only for npm packages in the inventory", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(body, {
          status: 200,
          headers: { "content-type": "application/atom+xml" },
        }),
    );
    const advisories = await querySocket({
      npmPackageNames: ["left-pad", "react"],
      fetch: fetchMock as never,
    });
    expect(advisories.length).toBe(1);
    expect(advisories[0]!.source).toBe("socket");
    expect(advisories[0]!.sourceId).toBe("socket:malware:left-pad@99.99.99");
    expect(advisories[0]!.severity).toBe("critical");
  });
});
