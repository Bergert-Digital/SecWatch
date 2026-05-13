import type { InventoryItem } from "../inventory/types.js";
import type { Advisory, AffectedRange } from "./types.js";

const ECOSYSTEM_MAP: Record<string, string | null> = {
  npm: "npm",
  composer: "Packagist",
  pypi: "PyPI",
  go: "Go",
  docker: null,
  service: null,
};

interface OsvVuln {
  id: string;
  summary?: string;
  details?: string;
  severity?: Array<{ type: string; score: string }>;
  affected?: Array<{
    package?: { name?: string; ecosystem?: string };
    ranges?: Array<{ type?: string; events?: Array<{ introduced?: string; fixed?: string }> }>;
    versions?: string[];
  }>;
  references?: Array<{ type?: string; url?: string }>;
  published?: string;
}

function cvssScoreToSeverity(score: string): Advisory["severity"] {
  const numeric = parseFloat(score);
  if (!Number.isNaN(numeric)) {
    if (numeric >= 9.0) return "critical";
    if (numeric >= 7.0) return "high";
    if (numeric >= 4.0) return "medium";
    if (numeric > 0) return "low";
    return "unknown";
  }
  if (/C:H.*I:H.*A:H/.test(score)) return "high";
  return "unknown";
}

interface Options {
  items: InventoryItem[];
  fetch?: typeof globalThis.fetch;
}

export async function queryOsv({
  items,
  fetch = globalThis.fetch,
}: Options): Promise<Advisory[]> {
  const queries = items
    .map((i) => {
      const eco = ECOSYSTEM_MAP[i.ecosystem];
      if (!eco || !i.version) return null;
      return { version: i.version, package: { name: i.name, ecosystem: eco } };
    })
    .filter((q): q is NonNullable<typeof q> => q !== null);

  if (queries.length === 0) return [];

  const resp = await fetch("https://api.osv.dev/v1/querybatch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ queries }),
  });
  if (!resp.ok) throw new Error(`OSV querybatch failed: ${resp.status}`);
  const body = (await resp.json()) as { results: Array<{ vulns?: OsvVuln[] }> };

  const seen = new Map<string, Advisory>();
  for (const r of body.results) {
    for (const v of r.vulns ?? []) {
      if (seen.has(v.id)) continue;
      const affected: AffectedRange[] = (v.affected ?? []).flatMap((a) => {
        if (!a.package?.name || !a.package.ecosystem) return [];
        return [
          {
            ecosystem: a.package.ecosystem,
            packageName: a.package.name,
            ranges: (a.ranges ?? []).map((rg) => ({
              type: (rg.type as "SEMVER" | "ECOSYSTEM" | "GIT") ?? "SEMVER",
              introduced: rg.events?.find((e) => e.introduced)?.introduced,
              fixed: rg.events?.find((e) => e.fixed)?.fixed,
            })),
            versions: a.versions,
          },
        ];
      });
      const severity = v.severity?.[0]?.score
        ? cvssScoreToSeverity(v.severity[0].score)
        : "unknown";
      seen.set(v.id, {
        source: "osv",
        sourceId: v.id,
        severity,
        summary: v.summary ?? v.id,
        details: v.details ?? null,
        affected,
        url: v.references?.find((r) => r.type === "ADVISORY")?.url ?? null,
        publishedAt: v.published ?? null,
      });
    }
  }
  return [...seen.values()];
}
