import { XMLParser } from "fast-xml-parser";
import type { Advisory } from "./types.js";

const SOCKET_URL = "https://socket.dev/feed";

interface AtomEntry {
  id?: string;
  title?: string;
  summary?: string;
  link?: { "@_href"?: string } | Array<{ "@_href"?: string }>;
  updated?: string;
}

function extractPackageName(idOrTitle: string): string | null {
  const m = idOrTitle.match(/^socket:[^:]+:([^@\s]+)@/);
  if (m) return m[1]!;
  const t = idOrTitle.match(/:\s*([^@\s]+)@/);
  return t ? t[1]! : null;
}

interface Options {
  npmPackageNames: string[];
  fetch?: typeof globalThis.fetch;
}

export async function querySocket({
  npmPackageNames,
  fetch = globalThis.fetch,
}: Options): Promise<Advisory[]> {
  const resp = await fetch(SOCKET_URL);
  if (!resp.ok) throw new Error(`Socket feed failed: ${resp.status}`);
  const text = await resp.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(text) as { feed?: { entry?: AtomEntry | AtomEntry[] } };
  const entries = parsed.feed?.entry;
  const list = entries === undefined ? [] : Array.isArray(entries) ? entries : [entries];

  const needles = new Set(npmPackageNames);
  const out: Advisory[] = [];
  for (const e of list) {
    const pkg = extractPackageName(e.id ?? e.title ?? "");
    if (!pkg || !needles.has(pkg)) continue;
    const link = Array.isArray(e.link) ? e.link[0]?.["@_href"] : e.link?.["@_href"];
    out.push({
      source: "socket",
      sourceId: e.id ?? `socket:${pkg}`,
      severity: "critical",
      summary: e.title ?? `Socket malware report for ${pkg}`,
      details: e.summary ?? null,
      affected: [],
      url: link ?? null,
      publishedAt: e.updated ?? null,
    });
  }
  return out;
}
