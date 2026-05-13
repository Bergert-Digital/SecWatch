import type { AffectedRange } from "../feeds/types.js";

export interface TriageInput {
  findingId: number;
  advisorySourceId: string;
  advisorySeverity: string | null;
  advisorySummary: string;
  advisoryDetails: string | null;
  packageName: string;
  matchedVersion: string | null;
  ecosystem: string;
  affected: AffectedRange[];
  sourceRepo: string;
  sourceFile: string;
}

function formatAffected(ranges: AffectedRange[]): string {
  const parts = ranges.map((a) => {
    const r = a.ranges
      .map((rr) => `>=${rr.introduced ?? "0"}${rr.fixed ? `, <${rr.fixed}` : ""}`)
      .join(" ");
    return `${a.ecosystem}/${a.packageName}: ${r}`;
  });
  return parts.length > 0 ? parts.join(" | ") : "(no machine-readable range; see details)";
}

export function buildTriagePrompt(items: TriageInput[]): string {
  const blocks = items.map((it) =>
    `
---
finding_id: ${it.findingId}
advisory: ${it.advisorySourceId} (${it.advisorySeverity ?? "unknown"}) — ${it.advisorySummary}
package: ${it.packageName}@${it.matchedVersion ?? "(unknown)"} (${it.ecosystem})
where: ${it.sourceRepo} / ${it.sourceFile}
affected versions: ${formatAffected(it.affected)}
details: ${(it.advisoryDetails ?? "").slice(0, 800)}
`.trim(),
  );

  return `You are a security triage assistant. For each finding below, rank how relevant the vulnerability is to this codebase.

Ranks:
- critical: Active exploit, RCE/auth-bypass/data-leak, or the package is used in a security-sensitive way in this repo.
- probably_relevant: Real vulnerability that likely applies to how the package is used.
- probably_not: Vulnerability exists but unlikely to apply (dev-only dependency, CLI-only flag affected, server-side issue on client-only code, etc.).
- noise: False positive, version range does not actually affect us, or advisory is too vague to act on.

Be conservative. When unsure between two ranks, pick the higher one.

Output JSON: { "rankings": [ { "finding_id": <int>, "rank": <one of: critical | probably_relevant | probably_not | noise>, "reason": <one short sentence> } ] }

Findings:
${blocks.join("\n\n")}
`;
}
