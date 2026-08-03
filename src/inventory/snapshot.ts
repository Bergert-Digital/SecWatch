import { GithubRateLimitError, type GithubClient } from "./github.js";
import type { InventoryItem } from "./types.js";
import { parseDockerfile, parseCompose } from "./parsers/docker.js";
import { loadServices } from "./services.js";

interface ManifestSpec {
  path: string;
  parse: (
    content: string,
    meta: { sourceRepo: string; sourceFile: string },
  ) => InventoryItem[];
}

// Package manifests are deliberately absent: Dependabot reads those from the
// dependency graph. Container base images are what it cannot alert on.
const MANIFESTS: ManifestSpec[] = [
  { path: "Dockerfile", parse: parseDockerfile },
  { path: "docker-compose.yml", parse: parseCompose },
  { path: "docker-compose.yaml", parse: parseCompose },
  { path: "compose.yaml", parse: parseCompose },
];

interface Options {
  gh: GithubClient;
  servicesYaml: string;
  onError?: (repo: string, file: string, error: unknown) => void;
  onRateLimit?: (err: GithubRateLimitError) => void;
}

export async function buildInventory({
  gh,
  servicesYaml,
  onError,
  onRateLimit,
}: Options): Promise<InventoryItem[]> {
  const out: InventoryItem[] = [];
  const repos = await gh.listRepos();
  outer: for (const repo of repos) {
    for (const manifest of MANIFESTS) {
      try {
        const content = await gh.readFile(repo.name, manifest.path);
        if (content === null) continue;
        const items = manifest.parse(content, {
          sourceRepo: repo.fullName,
          sourceFile: manifest.path,
        });
        out.push(...items);
      } catch (e) {
        if (e instanceof GithubRateLimitError) {
          onRateLimit?.(e);
          break outer;
        }
        onError?.(repo.name, manifest.path, e);
      }
    }
  }
  if (servicesYaml.trim()) {
    out.push(...loadServices(servicesYaml));
  }
  return out;
}
