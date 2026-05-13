import { Octokit } from "@octokit/rest";

export interface RepoSummary {
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
}

export interface GithubClient {
  listRepos(): Promise<RepoSummary[]>;
  readFile(repo: string, path: string): Promise<string | null>;
}

interface Options {
  token: string;
  org: string;
  octokit?: Octokit;
}

const SILENT_LOG = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export function createGithubClient(opts: Options): GithubClient {
  // Default log: silent. Octokit otherwise logs every 4xx to console (one line per missing
  // manifest = tens of thousands of lines per run, drowning out the actual errors we care about).
  const oct = opts.octokit ?? new Octokit({ auth: opts.token, log: SILENT_LOG });
  const org = opts.org;
  return {
    async listRepos() {
      const repos = await oct.paginate(oct.rest.repos.listForOrg, {
        org,
        per_page: 100,
        type: "all",
      });
      return repos
        .filter((r) => !r.archived)
        .map((r) => ({
          name: r.name,
          fullName: r.full_name,
          defaultBranch: r.default_branch ?? "main",
          private: r.private,
        }));
    },
    async readFile(repo, path) {
      try {
        const { data } = await oct.rest.repos.getContent({ owner: org, repo, path });
        if (Array.isArray(data) || data.type !== "file") return null;
        if (data.encoding !== "base64" || typeof data.content !== "string") return null;
        return Buffer.from(data.content, "base64").toString("utf-8");
      } catch (e: unknown) {
        if ((e as { status?: number }).status === 404) return null;
        throw e;
      }
    },
  };
}
