export type AdvisorySource = "kev" | "github-release";

export interface Advisory {
  source: AdvisorySource;
  sourceId: string;
  severity: "critical" | "high" | "medium" | "low" | "unknown" | null;
  summary: string;
  details: string | null;
  /**
   * Which inventory products this advisory concerns. Feeds resolve this against
   * the inventory at fetch time — an advisory with an empty list matches nothing
   * and will never produce a finding.
   */
  affected: AffectedProduct[];
  url: string | null;
  publishedAt: string | null;
}

export interface AffectedProduct {
  /** Must equal an InventoryItem.name verbatim — that is what the matcher joins on. */
  packageName: string;
  /** Absent or empty means every installed version is affected. */
  versions?: string[];
}
