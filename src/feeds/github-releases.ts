import { XMLParser } from "fast-xml-parser";
import type { Advisory } from "./types.js";

const SECURITY_RE = /\b(security|cve|vulnerab|advisor|patch|exploit)/i;

interface ServiceRef {
  name: string;
  github: string;
}

interface AtomEntry {
  id?: string;
  title?: string;
  updated?: string;
  content?: { "#text"?: string; "@_type"?: string } | string;
  link?:
    | { "@_href"?: string; "@_rel"?: string }
    | Array<{ "@_href"?: string; "@_rel"?: string }>;
}

function entryText(e: AtomEntry): string {
  if (typeof e.content === "string") return e.content;
  return e.content?.["#text"] ?? "";
}

function entryLink(e: AtomEntry): string | null {
  const links = Array.isArray(e.link) ? e.link : e.link ? [e.link] : [];
  const alt = links.find((l) => l["@_rel"] === "alternate") ?? links[0];
  return alt?.["@_href"] ?? null;
}

interface Options {
  services: ServiceRef[];
  fetch?: typeof globalThis.fetch;
}

export async function queryGithubReleases({
  services,
  fetch = globalThis.fetch,
}: Options): Promise<Advisory[]> {
  const parser = new XMLParser({ ignoreAttributes: false });
  const all: Advisory[] = [];
  for (const svc of services) {
    const url = `https://github.com/${svc.github}/releases.atom`;
    let text: string;
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      text = await resp.text();
    } catch {
      continue;
    }
    const parsed = parser.parse(text) as { feed?: { entry?: AtomEntry | AtomEntry[] } };
    const entries = parsed.feed?.entry;
    const list = entries === undefined ? [] : Array.isArray(entries) ? entries : [entries];
    for (const e of list) {
      const title = e.title ?? "";
      const body = entryText(e);
      if (!SECURITY_RE.test(title) && !SECURITY_RE.test(body)) continue;
      all.push({
        source: "github-release",
        sourceId: e.id ?? `${svc.github}-${title}`,
        severity: "unknown",
        summary: `${svc.name}: ${title}`,
        details: body || null,
        affected: [],
        url: entryLink(e),
        publishedAt: e.updated ?? null,
      });
    }
  }
  return all;
}
