import type { Advisory, AffectedProduct } from "./types.js";

interface KevEntry {
  cveID: string;
  vendorProject?: string;
  product?: string;
  vulnerabilityName?: string;
  shortDescription?: string;
  dateAdded?: string;
}

interface Options {
  /** Inventory item names — container image names and services.yaml entries. */
  productNames: string[];
  fetch?: typeof globalThis.fetch;
}

const KEV_URL =
  "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";

const USER_AGENT = "SecWatch/0.1.0 (+https://github.com/Bergert-Digital/SecWatch)";

/** Needles shorter than this only ever match a KEV field exactly. */
const MIN_FUZZY_LENGTH = 3;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `ghcr.io/coollabsio/coolify` should also match KEV's plain "Coolify", so each
 * product contributes its full name and its last path segment as needles.
 */
function needlesFor(name: string): string[] {
  const lower = name.toLowerCase();
  const last = lower.split("/").pop()!;
  return last === lower ? [lower] : [lower, last];
}

/**
 * Matches at a word start but not a word end, so "postgres" still finds
 * "PostgreSQL". Matching mid-word in either direction (the previous behaviour)
 * made "go" match "mongodb" and similar.
 */
function fieldMatches(field: string, needle: string): boolean {
  if (field === needle) return true;
  if (needle.length < MIN_FUZZY_LENGTH) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}`).test(field);
}

export async function queryKev({
  productNames,
  fetch = globalThis.fetch,
}: Options): Promise<Advisory[]> {
  const resp = await fetch(KEV_URL, { headers: { "user-agent": USER_AGENT } });
  if (!resp.ok) throw new Error(`KEV fetch failed: ${resp.status}`);
  const body = (await resp.json()) as { vulnerabilities?: KevEntry[] };

  // needle -> the inventory names it stands for, so `affected` can name the
  // inventory item verbatim (that is what the matcher joins on).
  const byNeedle = new Map<string, Set<string>>();
  for (const name of productNames) {
    for (const needle of needlesFor(name)) {
      const set = byNeedle.get(needle) ?? new Set<string>();
      set.add(name);
      byNeedle.set(needle, set);
    }
  }

  const out: Advisory[] = [];
  for (const v of body.vulnerabilities ?? []) {
    const fields = [v.product, v.vendorProject]
      .filter((s): s is string => Boolean(s))
      .map((s) => s.toLowerCase());

    const matched = new Set<string>();
    for (const [needle, names] of byNeedle) {
      if (fields.some((f) => fieldMatches(f, needle))) {
        for (const n of names) matched.add(n);
      }
    }
    if (matched.size === 0) continue;

    const affected: AffectedProduct[] = [...matched].map((packageName) => ({ packageName }));
    out.push({
      source: "kev",
      sourceId: v.cveID,
      severity: "critical",
      summary: v.vulnerabilityName ?? v.cveID,
      details: v.shortDescription ?? null,
      affected,
      url: `https://nvd.nist.gov/vuln/detail/${v.cveID}`,
      publishedAt: v.dateAdded ?? null,
    });
  }
  return out;
}
