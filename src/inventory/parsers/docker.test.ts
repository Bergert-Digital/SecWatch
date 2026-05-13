import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseDockerfile, parseCompose } from "./docker.js";

const dockerfile = readFileSync("tests/fixtures/docker/Dockerfile", "utf-8");
const compose = readFileSync("tests/fixtures/docker/docker-compose.yml", "utf-8");

describe("parseDockerfile", () => {
  it("extracts unique pinned base images", () => {
    const items = parseDockerfile(dockerfile, {
      sourceRepo: "Bergert-Digital/x",
      sourceFile: "Dockerfile",
    });
    expect(items).toEqual([
      {
        ecosystem: "docker",
        name: "node",
        version: "22.4.0-alpine",
        sourceRepo: "Bergert-Digital/x",
        sourceFile: "Dockerfile",
      },
    ]);
  });
});

describe("parseCompose", () => {
  it("extracts pinned images, returns null version for floating", () => {
    const items = parseCompose(compose, {
      sourceRepo: "Bergert-Digital/x",
      sourceFile: "docker-compose.yml",
    });
    expect(items.find((i) => i.name === "postgres")?.version).toBe("16.4");
    expect(items.find((i) => i.name === "redis")?.version).toBe("7.4-alpine");
    expect(items.find((i) => i.name === "traefik")?.version).toBe(null);
  });
});
