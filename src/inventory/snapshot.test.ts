import { describe, it, expect, vi } from "vitest";
import { buildInventory } from "./snapshot.js";
import type { GithubClient } from "./github.js";

const fakeServices = `
- name: traefik
  docker_image: traefik
  current_version: "3.4"
`;

describe("buildInventory", () => {
  it("aggregates parsed manifests + services into a single list", async () => {
    const gh: GithubClient = {
      listRepos: vi.fn(async () => [
        {
          name: "feldova",
          fullName: "Bergert-Digital/feldova",
          defaultBranch: "main",
          private: false,
        },
      ]),
      readFile: vi.fn(async (_repo, path) => {
        if (path === "package.json") return `{"dependencies": {"next": "14.2.3"}}`;
        if (path === "Dockerfile") return `FROM node:22.4.0-alpine\n`;
        return null;
      }),
    };
    const items = await buildInventory({ gh, servicesYaml: fakeServices });
    expect(items.find((i) => i.ecosystem === "npm" && i.name === "next")?.version).toBe("14.2.3");
    expect(items.find((i) => i.ecosystem === "docker" && i.name === "node")?.version).toBe(
      "22.4.0-alpine",
    );
    expect(items.find((i) => i.ecosystem === "service" && i.name === "traefik")?.version).toBe(
      "3.4",
    );
  });

  it("continues past a repo whose readFile throws", async () => {
    const gh: GithubClient = {
      listRepos: vi.fn(async () => [
        { name: "a", fullName: "Bergert-Digital/a", defaultBranch: "main", private: false },
        { name: "b", fullName: "Bergert-Digital/b", defaultBranch: "main", private: false },
      ]),
      readFile: vi.fn(async (repo, path) => {
        if (repo === "a") throw new Error("boom");
        if (repo === "b" && path === "package.json") return `{"dependencies": {"react": "18"}}`;
        return null;
      }),
    };
    const items = await buildInventory({ gh, servicesYaml: "" });
    expect(items.find((i) => i.name === "react")).toBeDefined();
  });
});
