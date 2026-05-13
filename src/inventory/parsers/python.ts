import type { InventoryItem } from "../types.js";

interface SourceMeta {
  sourceRepo: string;
  sourceFile: string;
}

const REQ_RE = /^([A-Za-z0-9_.\-]+)\s*(==|>=|<=|>|<|~=|!=)\s*(.+)$/;

export function parseRequirementsTxt(content: string, meta: SourceMeta): InventoryItem[] {
  const out: InventoryItem[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.split("#")[0]!.trim();
    if (!line) continue;
    if (line.startsWith("-")) continue;
    const match = line.match(/^([A-Za-z0-9_.\-]+)\s*(.+)$/);
    if (!match) continue;
    const [, name, rest] = match;
    if (!REQ_RE.test(line)) {
      out.push({ ecosystem: "pypi", name: name!, version: null, ...meta });
      continue;
    }
    const pinned = rest!.match(/^==\s*(\S+)$/);
    out.push({
      ecosystem: "pypi",
      name: name!,
      version: pinned ? pinned[1]! : rest!.trim(),
      ...meta,
    });
  }
  return out;
}

export function parsePyprojectToml(content: string, meta: SourceMeta): InventoryItem[] {
  const out: InventoryItem[] = [];
  const blocks: string[] = [];
  const sectionRe = /\[(project|project\.optional-dependencies)\]([\s\S]*?)(?=\n\[|\n*$)/g;
  let m: RegExpExecArray | null;
  while ((m = sectionRe.exec(content)) !== null) {
    const body = m[2]!;
    const arrayMatches = body.matchAll(/=\s*\[([\s\S]*?)\]/g);
    for (const am of arrayMatches) {
      blocks.push(am[1]!);
    }
  }
  for (const block of blocks) {
    for (const raw of block.split(/,\s*/)) {
      const s = raw.replace(/["']/g, "").trim();
      if (!s) continue;
      const match = s.match(/^([A-Za-z0-9_.\-]+)\s*(.+)?$/);
      if (!match) continue;
      const [, name, rest] = match;
      if (!rest) {
        out.push({ ecosystem: "pypi", name: name!, version: null, ...meta });
        continue;
      }
      const pinned = rest.match(/^==\s*(\S+)$/);
      out.push({
        ecosystem: "pypi",
        name: name!,
        version: pinned ? pinned[1]! : rest.trim(),
        ...meta,
      });
    }
  }
  return out;
}
