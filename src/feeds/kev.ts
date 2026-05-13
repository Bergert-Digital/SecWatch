import type { Advisory } from "./types.js";

interface KevEntry {
  cveID: string;
  vendorProject?: string;
  product?: string;
  vulnerabilityName?: string;
  shortDescription?: string;
  dateAdded?: string;
}

interface Options {
  productNames: string[];
  fetch?: typeof globalThis.fetch;
}

const KEV_URL =
  "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";

export async function queryKev({
  productNames,
  fetch = globalThis.fetch,
}: Options): Promise<Advisory[]> {
  const resp = await fetch(KEV_URL);
  if (!resp.ok) throw new Error(`KEV fetch failed: ${resp.status}`);
  const body = (await resp.json()) as { vulnerabilities?: KevEntry[] };

  const needles = new Set(productNames.map((n) => n.toLowerCase()));
  const out: Advisory[] = [];
  for (const v of body.vulnerabilities ?? []) {
    const fields = [v.product, v.vendorProject].filter(Boolean).map((s) => s!.toLowerCase());
    const hit = fields.some((f) => {
      for (const needle of needles) {
        if (f === needle || f.includes(needle) || needle.includes(f)) return true;
      }
      return false;
    });
    if (!hit) continue;
    out.push({
      source: "kev",
      sourceId: v.cveID,
      severity: "critical",
      summary: v.vulnerabilityName ?? v.cveID,
      details: v.shortDescription ?? null,
      affected: [],
      url: `https://nvd.nist.gov/vuln/detail/${v.cveID}`,
      publishedAt: v.dateAdded ?? null,
    });
  }
  return out;
}
