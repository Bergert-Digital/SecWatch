// Repo dependency ecosystems (npm, composer, pypi, go) are Dependabot's job.
// SecWatch only tracks what Dependabot cannot see: container base images and
// self-hosted services declared in services.yaml.
export type Ecosystem = "docker" | "service";

export interface InventoryItem {
  ecosystem: Ecosystem;
  name: string;
  version: string | null;
  sourceRepo: string;
  sourceFile: string;
}
