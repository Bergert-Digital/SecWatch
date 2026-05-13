import { describe, it, expect, vi } from "vitest";
import { createGithubClient, GithubRateLimitError } from "./github.js";

function mockOctokit(
  overrides: Partial<{
    repos: unknown[];
    files: Record<string, string>;
  }> = {},
) {
  return {
    paginate: vi.fn(async (..._args: unknown[]) => overrides.repos ?? []),
    rest: {
      repos: {
        listForOrg: { endpoint: vi.fn() },
        getContent: vi.fn(async ({ path }: { path: string }) => {
          const content = overrides.files?.[path];
          if (content === undefined)
            throw Object.assign(new Error("not found"), { status: 404 });
          return {
            data: { content: Buffer.from(content).toString("base64"), encoding: "base64", type: "file" },
          };
        }),
      },
    },
  };
}

describe("createGithubClient", () => {
  it("lists non-archived repos in the org", async () => {
    const oct = mockOctokit({
      repos: [
        { name: "a", full_name: "Bergert-Digital/a", default_branch: "main", private: false, archived: false },
        { name: "b", full_name: "Bergert-Digital/b", default_branch: "main", private: false, archived: true },
        { name: "c", full_name: "Bergert-Digital/c", default_branch: "main", private: false, archived: false },
      ],
    });
    const gh = createGithubClient({ token: "x", org: "Bergert-Digital", octokit: oct as never });
    const repos = await gh.listRepos();
    expect(repos.map((r) => r.name)).toEqual(["a", "c"]);
  });

  it("reads a file's text content via Contents API", async () => {
    const oct = mockOctokit({ files: { "package.json": `{"x":1}` } });
    const gh = createGithubClient({ token: "x", org: "Bergert-Digital", octokit: oct as never });
    const text = await gh.readFile("a", "package.json");
    expect(text).toBe(`{"x":1}`);
  });

  it("returns null when the file is missing (404)", async () => {
    const oct = mockOctokit({ files: {} });
    const gh = createGithubClient({ token: "x", org: "Bergert-Digital", octokit: oct as never });
    const text = await gh.readFile("a", "nope.json");
    expect(text).toBeNull();
  });

  it("throws GithubRateLimitError on 403 + rate-limit message", async () => {
    const reset = 1700000000;
    const oct = {
      paginate: vi.fn(),
      rest: {
        repos: {
          listForOrg: { endpoint: vi.fn() },
          getContent: vi.fn(async () => {
            throw Object.assign(new Error("API rate limit exceeded"), {
              status: 403,
              response: {
                headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) },
                data: { message: "API rate limit exceeded for user ID 1" },
              },
            });
          }),
        },
      },
    };
    const gh = createGithubClient({ token: "x", org: "Bergert-Digital", octokit: oct as never });
    await expect(gh.readFile("a", "package.json")).rejects.toBeInstanceOf(
      GithubRateLimitError,
    );
    try {
      await gh.readFile("a", "package.json");
    } catch (e) {
      expect((e as GithubRateLimitError).resetAt?.getTime()).toBe(reset * 1000);
    }
  });

  it("re-throws non-404, non-rate-limit errors", async () => {
    const oct = {
      paginate: vi.fn(),
      rest: {
        repos: {
          listForOrg: { endpoint: vi.fn() },
          getContent: vi.fn(async () => {
            throw Object.assign(new Error("server error"), { status: 500 });
          }),
        },
      },
    };
    const gh = createGithubClient({ token: "x", org: "Bergert-Digital", octokit: oct as never });
    await expect(gh.readFile("a", "package.json")).rejects.toThrow("server error");
  });
});
