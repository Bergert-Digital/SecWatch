import type { InventoryItem } from "../types.js";

interface SourceMeta {
  sourceRepo: string;
  sourceFile: string;
}

export function parsePackageJson(content: string, meta: SourceMeta): InventoryItem[] {
  const json = JSON.parse(content) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  const result: InventoryItem[] = [];
  const sections = [json.dependencies, json.devDependencies, json.optionalDependencies];
  for (const section of sections) {
    if (!section) continue;
    for (const [name, version] of Object.entries(section)) {
      result.push({ ecosystem: "npm", name, version, ...meta });
    }
  }
  return result;
}

export function parsePackageLock(content: string, meta: SourceMeta): InventoryItem[] {
  const json = JSON.parse(content) as {
    packages?: Record<string, { name?: string; version?: string }>;
  };
  const result: InventoryItem[] = [];
  if (!json.packages) return result;
  for (const [path, info] of Object.entries(json.packages)) {
    if (path === "" || !info.version) continue;
    const name = info.name ?? path.replace(/^.*node_modules\//, "");
    result.push({ ecosystem: "npm", name, version: info.version, ...meta });
  }
  return result;
}
