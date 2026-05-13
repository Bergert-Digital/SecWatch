import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseGoMod } from "./go.js";

const mod = readFileSync("tests/fixtures/go/go.mod", "utf-8");

describe("parseGoMod", () => {
  it("parses require blocks and single-line requires", () => {
    const items = parseGoMod(mod, { sourceRepo: "Bergert-Digital/x", sourceFile: "go.mod" });
    expect(items.find((i) => i.name === "github.com/gin-gonic/gin")?.version).toBe("v1.10.0");
    expect(items.find((i) => i.name === "github.com/stretchr/testify")?.version).toBe("v1.9.0");
    expect(items.find((i) => i.name === "github.com/go-redis/redis/v9")?.version).toBe("v9.5.0");
    expect(items.length).toBe(3);
  });
});
