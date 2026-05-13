export type Ecosystem = "npm" | "composer" | "pypi" | "go" | "docker" | "service";

export interface InventoryItem {
  ecosystem: Ecosystem;
  name: string;
  version: string | null;
  sourceRepo: string;
  sourceFile: string;
}
