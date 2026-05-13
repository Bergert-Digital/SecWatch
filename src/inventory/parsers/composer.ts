import type { InventoryItem } from "../types.js";

interface SourceMeta {
  sourceRepo: string;
  sourceFile: string;
}

const PLATFORM_PREFIXES = ["php", "ext-", "lib-", "hhvm"];

function isPlatformPackage(name: string): boolean {
  return PLATFORM_PREFIXES.some((p) => name === p || name.startsWith(p + "-"));
}

export function parseComposerJson(content: string, meta: SourceMeta): InventoryItem[] {
  const json = JSON.parse(content) as {
    require?: Record<string, string>;
    "require-dev"?: Record<string, string>;
  };
  const out: InventoryItem[] = [];
  for (const section of [json.require, json["require-dev"]]) {
    if (!section) continue;
    for (const [name, version] of Object.entries(section)) {
      if (isPlatformPackage(name)) continue;
      out.push({ ecosystem: "composer", name, version, ...meta });
    }
  }
  return out;
}

export function parseComposerLock(content: string, meta: SourceMeta): InventoryItem[] {
  const json = JSON.parse(content) as {
    packages?: Array<{ name: string; version: string }>;
    "packages-dev"?: Array<{ name: string; version: string }>;
  };
  const out: InventoryItem[] = [];
  for (const arr of [json.packages, json["packages-dev"]]) {
    if (!arr) continue;
    for (const pkg of arr) {
      out.push({ ecosystem: "composer", name: pkg.name, version: pkg.version, ...meta });
    }
  }
  return out;
}
