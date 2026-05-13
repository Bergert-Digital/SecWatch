import type { InventoryItem } from "../types.js";

interface SourceMeta {
  sourceRepo: string;
  sourceFile: string;
}

const LINE_RE = /^\s*([^\s]+)\s+([^\s]+)(\s+\/\/\s*indirect)?\s*$/;

export function parseGoMod(content: string, meta: SourceMeta): InventoryItem[] {
  const out: InventoryItem[] = [];
  const lines = content.split(/\r?\n/);
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line || line.startsWith("//")) continue;
    if (line.startsWith("require (")) {
      inBlock = true;
      continue;
    }
    if (line === ")" && inBlock) {
      inBlock = false;
      continue;
    }
    if (line.startsWith("require ") && !line.startsWith("require (")) {
      const rest = line.slice("require ".length).trim();
      const m = rest.match(/^(\S+)\s+(\S+)/);
      if (m) out.push({ ecosystem: "go", name: m[1]!, version: m[2]!, ...meta });
      continue;
    }
    if (inBlock) {
      const m = line.match(LINE_RE);
      if (m) out.push({ ecosystem: "go", name: m[1]!, version: m[2]!, ...meta });
    }
  }
  return out;
}
