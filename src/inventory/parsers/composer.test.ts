import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseComposerJson, parseComposerLock } from "./composer.js";

const json = readFileSync("tests/fixtures/composer/composer.json", "utf-8");
const lock = readFileSync("tests/fixtures/composer/composer.lock", "utf-8");

describe("parseComposerJson", () => {
  it("returns require + require-dev, skips 'php' constraint", () => {
    const items = parseComposerJson(json, {
      sourceRepo: "Bergert-Digital/wp",
      sourceFile: "composer.json",
    });
    expect(items.find((i) => i.name === "php")).toBeUndefined();
    expect(items.find((i) => i.name === "symfony/console")?.version).toBe("^7.0");
    expect(items.find((i) => i.name === "phpunit/phpunit")?.version).toBe("^11.0");
  });
});

describe("parseComposerLock", () => {
  it("returns flat resolved versions from packages + packages-dev", () => {
    const items = parseComposerLock(lock, {
      sourceRepo: "Bergert-Digital/wp",
      sourceFile: "composer.lock",
    });
    expect(items.find((i) => i.name === "symfony/console")?.version).toBe("v7.1.5");
    expect(items.find((i) => i.name === "phpunit/phpunit")?.version).toBe("11.3.0");
    expect(items.length).toBe(3);
  });
});
