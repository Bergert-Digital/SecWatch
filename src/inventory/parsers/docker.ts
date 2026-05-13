import { parse as parseYaml } from "yaml";
import type { InventoryItem } from "../types.js";

interface SourceMeta {
  sourceRepo: string;
  sourceFile: string;
}

function splitImage(image: string): { name: string; version: string | null } {
  const noDigest = image.split("@")[0]!;
  const lastColon = noDigest.lastIndexOf(":");
  if (lastColon === -1 || noDigest.indexOf("/", lastColon) !== -1) {
    return { name: noDigest, version: null };
  }
  const name = noDigest.slice(0, lastColon);
  const tag = noDigest.slice(lastColon + 1);
  if (tag === "latest" || tag === "") return { name, version: null };
  return { name, version: tag };
}

export function parseDockerfile(content: string, meta: SourceMeta): InventoryItem[] {
  const out = new Map<string, InventoryItem>();
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!/^FROM\s+/i.test(line)) continue;
    const rest = line.replace(/^FROM\s+/i, "").trim();
    const image = rest.split(/\s+AS\s+/i)[0]!.trim();
    const { name, version } = splitImage(image);
    if (version === null) continue;
    const key = `${name}:${version}`;
    if (!out.has(key)) out.set(key, { ecosystem: "docker", name, version, ...meta });
  }
  return [...out.values()];
}

export function parseCompose(content: string, meta: SourceMeta): InventoryItem[] {
  const doc = parseYaml(content) as { services?: Record<string, { image?: string }> };
  const out: InventoryItem[] = [];
  if (!doc.services) return out;
  for (const svc of Object.values(doc.services)) {
    if (!svc.image) continue;
    const { name, version } = splitImage(svc.image);
    out.push({ ecosystem: "docker", name, version, ...meta });
  }
  return out;
}
