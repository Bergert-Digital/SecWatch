import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseRequirementsTxt, parsePyprojectToml } from "./python.js";

const reqs = readFileSync("tests/fixtures/python/requirements.txt", "utf-8");
const proj = readFileSync("tests/fixtures/python/pyproject.toml", "utf-8");

describe("parseRequirementsTxt", () => {
  it("parses pinned and range entries, skips comments and editables", () => {
    const items = parseRequirementsTxt(reqs, {
      sourceRepo: "Bergert-Digital/x",
      sourceFile: "requirements.txt",
    });
    expect(items.find((i) => i.name === "django")?.version).toBe("4.2.7");
    expect(items.find((i) => i.name === "requests")?.version).toBe("2.32.0");
    expect(items.find((i) => i.name === "fastapi")?.version).toBe(">=0.110,<0.120");
    expect(items.find((i) => i.name === "foo")).toBeUndefined();
  });
});

describe("parsePyprojectToml", () => {
  it("returns project deps + optional dev deps", () => {
    const items = parsePyprojectToml(proj, {
      sourceRepo: "Bergert-Digital/x",
      sourceFile: "pyproject.toml",
    });
    expect(items.find((i) => i.name === "httpx")?.version).toBe("0.27.0");
    expect(items.find((i) => i.name === "pydantic")?.version).toBe(">=2.5");
    expect(items.find((i) => i.name === "pytest")?.version).toBe("8.0.0");
  });
});
