import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parsePackageJson, parsePackageLock } from "./npm.js";

const pkg = readFileSync("tests/fixtures/npm/feldova-package.json", "utf-8");
const lock = readFileSync("tests/fixtures/npm/feldova-package-lock.json", "utf-8");

describe("parsePackageJson", () => {
  it("returns direct deps with declared specifiers as version", () => {
    const items = parsePackageJson(pkg, {
      sourceRepo: "Bergert-Digital/feldova",
      sourceFile: "package.json",
    });
    expect(items).toEqual(
      expect.arrayContaining([
        {
          ecosystem: "npm",
          name: "next",
          version: "14.2.3",
          sourceRepo: "Bergert-Digital/feldova",
          sourceFile: "package.json",
        },
        {
          ecosystem: "npm",
          name: "react",
          version: "^18.3.1",
          sourceRepo: "Bergert-Digital/feldova",
          sourceFile: "package.json",
        },
        {
          ecosystem: "npm",
          name: "typescript",
          version: "5.6.0",
          sourceRepo: "Bergert-Digital/feldova",
          sourceFile: "package.json",
        },
      ]),
    );
    expect(items.length).toBe(3);
  });
});

describe("parsePackageLock", () => {
  it("returns flat resolved versions including transitives", () => {
    const items = parsePackageLock(lock, {
      sourceRepo: "Bergert-Digital/feldova",
      sourceFile: "package-lock.json",
    });
    expect(items).toEqual(
      expect.arrayContaining([
        {
          ecosystem: "npm",
          name: "next",
          version: "14.2.3",
          sourceRepo: "Bergert-Digital/feldova",
          sourceFile: "package-lock.json",
        },
        {
          ecosystem: "npm",
          name: "react",
          version: "18.3.1",
          sourceRepo: "Bergert-Digital/feldova",
          sourceFile: "package-lock.json",
        },
        {
          ecosystem: "npm",
          name: "react-dom",
          version: "18.3.1",
          sourceRepo: "Bergert-Digital/feldova",
          sourceFile: "package-lock.json",
        },
        {
          ecosystem: "npm",
          name: "typescript",
          version: "5.6.2",
          sourceRepo: "Bergert-Digital/feldova",
          sourceFile: "package-lock.json",
        },
      ]),
    );
  });
});
