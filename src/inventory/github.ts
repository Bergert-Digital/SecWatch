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

export class GithubRateLimitError extends Error {
  constructor(public readonly resetAt: Date | null) {
    super(
      resetAt
        ? `GitHub rate limit exceeded, resets at ${resetAt.toISOString()}`
        : "GitHub rate limit exceeded",
    );
    this.name = "GithubRateLimitError";
  }
}

interface OctokitRequestError {
  status?: number;
  response?: {
    headers?: Record<string, unknown>;
    data?: { message?: string };
  };
}

function isRateLimited(e: unknown): boolean {
  const err = e as OctokitRequestError;
  if (err.status !== 403) return false;
  const rem = err.response?.headers?.["x-ratelimit-remaining"];
  if (rem === "0" || rem === 0) return true;
  const msg = err.response?.data?.message;
  return typeof msg === "string" && /rate limit/i.test(msg);
}

function rateLimitResetAt(e: unknown): Date | null {
  const err = e as OctokitRequestError;
  const raw = err.response?.headers?.["x-ratelimit-reset"];
  const epoch = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  return Number.isFinite(epoch) ? new Date(epoch * 1000) : null;
}

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
        if (isRateLimited(e)) throw new GithubRateLimitError(rateLimitResetAt(e));
        throw e;
      }
    },
  };
}
