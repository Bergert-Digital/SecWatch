import { describe, it, expect } from "vitest";
import { loadServices } from "./services.js";

const yaml = `
- name: coolify
  github: coollabsio/coolify
  current_version: 4.0.0-beta.420
- name: postgres
  docker_image: postgres
  current_version: "16.4"
`;

describe("loadServices", () => {
  it("returns InventoryItems for each service", () => {
    const items = loadServices(yaml);
    expect(items).toEqual([
      {
        ecosystem: "service",
        name: "coolify",
        version: "4.0.0-beta.420",
        sourceRepo: "services.yaml",
        sourceFile: "services.yaml",
      },
      {
        ecosystem: "service",
        name: "postgres",
        version: "16.4",
        sourceRepo: "services.yaml",
        sourceFile: "services.yaml",
      },
    ]);
  });

  it("rejects entries missing current_version", () => {
    expect(() => loadServices(`- name: foo`)).toThrow();
  });
});
