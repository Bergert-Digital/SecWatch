import type { AffectedProduct } from "../feeds/types.js";

export interface TriageInput {
  findingId: number;
  advisorySourceId: string;
  advisorySeverity: string | null;
  advisorySummary: string;
  advisoryDetails: string | null;
  packageName: string;
  matchedVersion: string | null;
  ecosystem: string;
  affected: AffectedProduct[];
  sourceRepo: string;
  sourceFile: string;
}

function formatAffected(products: AffectedProduct[]): string {
  const parts = products.map((a) =>
    a.versions && a.versions.length > 0
      ? `${a.packageName}: ${a.versions.join(", ")}`
      : `${a.packageName}: all versions`,
  );
  return parts.length > 0 ? parts.join(" | ") : "(not stated; see details)";
}

export function buildTriagePrompt(items: TriageInput[]): string {
  const blocks = items.map((it) =>
    `
---
finding_id: ${it.findingId}
advisory: ${it.advisorySourceId} (${it.advisorySeverity ?? "unknown"}) — ${it.advisorySummary}
product: ${it.packageName}@${it.matchedVersion ?? "(unpinned)"} (${it.ecosystem})
where: ${it.sourceRepo} / ${it.sourceFile}
affected versions: ${formatAffected(it.affected)}
details: ${(it.advisoryDetails ?? "").slice(0, 800)}
`.trim(),
  );

  return `You are a security triage assistant. Each finding below is a container image or a self-hosted service we run, paired with an advisory that may affect it. Rank how relevant each one is to us.

Ranks:
- critical: Actively exploited, or RCE/auth-bypass/data-leak in a service we expose. Anything from CISA KEV that plausibly matches our deployment starts here.
- probably_relevant: Real vulnerability that likely applies to how we run this image or service.
- probably_not: Vulnerability exists but unlikely to apply (affects a component or configuration we do not use, requires local access to a container we do not expose, etc.).
- noise: Name collision between the advisory's product and ours, version clearly unaffected, or the advisory is too vague to act on.

Product names were matched by name, not by a machine-readable version range, so name collisions are the most common false positive — say so plainly when you see one.

Be conservative. When unsure between two ranks, pick the higher one.

Output JSON: { "rankings": [ { "finding_id": <int>, "rank": <one of: critical | probably_relevant | probably_not | noise>, "reason": <one short sentence> } ] }

Findings:
${blocks.join("\n\n")}
`;
}
