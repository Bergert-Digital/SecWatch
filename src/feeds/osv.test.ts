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
});
