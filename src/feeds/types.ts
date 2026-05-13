export type AdvisorySource = "osv" | "kev" | "socket" | "github-release";

export interface Advisory {
  source: AdvisorySource;
  sourceId: string;
  severity: "critical" | "high" | "medium" | "low" | "unknown" | null;
  summary: string;
  details: string | null;
  affected: AffectedRange[];
  url: string | null;
  publishedAt: string | null;
}

export interface AffectedRange {
  ecosystem: string;
  packageName: string;
  ranges: Array<{ type: "ECOSYSTEM" | "SEMVER" | "GIT"; introduced?: string; fixed?: string }>;
  versions?: string[];
}
