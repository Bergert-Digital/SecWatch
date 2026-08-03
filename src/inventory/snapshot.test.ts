import { describe, it, expect, vi } from "vitest";
import { buildInventory } from "./snapshot.js";
import { GithubRateLimitError, type GithubClient } from "./github.js";

const fakeServices = `
- name: traefik
  docker_image: traefik
  current_version: "3.4"
`;

describe("buildInventory", () => {
  it("aggregates container images + services into a single list", async () => {
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
        if (path === "Dockerfile") return `FROM node:22.4.0-alpine\n`;
        if (path === "docker-compose.yml") return `services:\n  db:\n    image: postgres:16.4\n`;
        return null;
      }),
    };
    const items = await buildInventory({ gh, servicesYaml: fakeServices });
    expect(items.find((i) => i.ecosystem === "docker" && i.name === "node")?.version).toBe(
      "22.4.0-alpine",
    );
    expect(items.find((i) => i.ecosystem === "docker" && i.name === "postgres")?.version).toBe(
      "16.4",
    );
    expect(items.find((i) => i.ecosystem === "service" && i.name === "traefik")?.version).toBe(
      "3.4",
    );
  });

  it("ignores package manifests — those are Dependabot's job", async () => {
    const readFile = vi.fn(async (_repo: string, _path: string) => null);
    const gh: GithubClient = {
      listRepos: vi.fn(async () => [
        {
          name: "feldova",
          fullName: "Bergert-Digital/feldova",
          defaultBranch: "main",
          private: false,
        },
      ]),
      readFile,
    };
    await buildInventory({ gh, servicesYaml: "" });
    const requested = readFile.mock.calls.map((c) => c[1]);
    expect(requested).not.toContain("package.json");
    expect(requested).not.toContain("go.mod");
    expect(requested).toContain("Dockerfile");
  });

  it("continues past a repo whose readFile throws", async () => {
    const gh: GithubClient = {
      listRepos: vi.fn(async () => [
        { name: "a", fullName: "Bergert-Digital/a", defaultBranch: "main", private: false },
        { name: "b", fullName: "Bergert-Digital/b", defaultBranch: "main", private: false },
      ]),
      readFile: vi.fn(async (repo, path) => {
        if (repo === "a") throw new Error("boom");
        if (repo === "b" && path === "Dockerfile") return `FROM redis:7.4\n`;
        return null;
      }),
    };
    const items = await buildInventory({ gh, servicesYaml: "" });
    expect(items.find((i) => i.name === "redis")).toBeDefined();
  });

  it("aborts the file-read loop on GithubRateLimitError but still returns services", async () => {
    let calls = 0;
    const onRateLimit = vi.fn();
    const gh: GithubClient = {
      listRepos: vi.fn(async () => [
        { name: "a", fullName: "Bergert-Digital/a", defaultBranch: "main", private: false },
        { name: "b", fullName: "Bergert-Digital/b", defaultBranch: "main", private: false },
        { name: "c", fullName: "Bergert-Digital/c", defaultBranch: "main", private: false },
      ]),
      readFile: vi.fn(async () => {
        calls++;
        if (calls === 1) return `FROM redis:7.4\n`;
        throw new GithubRateLimitError(new Date("2026-05-13T13:00:00Z"));
      }),
    };
    const items = await buildInventory({
      gh,
      servicesYaml: `
- name: postgres
  docker_image: postgres
  current_version: "16.4"
`,
      onRateLimit,
    });
    expect(onRateLimit).toHaveBeenCalledOnce();
    expect(items.find((i) => i.name === "redis")).toBeDefined();
    expect(items.find((i) => i.name === "postgres")).toBeDefined();
    // The 3rd repo (c) should not have been touched after the rate-limit short-circuit.
    expect(calls).toBeLessThan(3 * 4); // 4 = MANIFESTS.length
  });
});
