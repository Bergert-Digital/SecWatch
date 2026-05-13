import type { Rank } from "../triage/claude.js";

export type EmailKind = "daily" | "weekly_recap" | "weekly_heartbeat";

export interface EmailFinding {
  rank: Rank | "untriaged";
  advisorySourceId: string;
  advisorySummary: string;
  advisoryUrl: string | null;
  severity: string | null;
  packageName: string;
  matchedVersion: string | null;
  ecosystem: string;
  sourceRepo: string;
  sourceFile: string;
  triageReason: string | null;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

interface Args {
  kind: EmailKind;
  findings: EmailFinding[];
}

function bySeverity(rank: EmailFinding["rank"]): number {
  return (
    { critical: 0, probably_relevant: 1, untriaged: 2, probably_not: 3, noise: 4 } as const
  )[rank];
}

function buildSubject(kind: EmailKind, findings: EmailFinding[]): string {
  const total = findings.length;
  const critical = findings.filter((f) => f.rank === "critical").length;
  if (kind === "weekly_heartbeat") return "SecWatch: all clear this week";
  if (kind === "weekly_recap")
    return `SecWatch: weekly summary — ${total} finding${total === 1 ? "" : "s"}, ${critical} critical`;
  return `SecWatch: ${total} new finding${total === 1 ? "" : "s"} (${critical} critical)`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fullDetail(f: EmailFinding): { html: string; text: string } {
  const link = f.advisoryUrl
    ? `<a href="${escapeHtml(f.advisoryUrl)}">${escapeHtml(f.advisorySourceId)}</a>`
    : escapeHtml(f.advisorySourceId);
  const html = `
    <div style="margin:14px 0;padding:12px;border-left:3px solid #c33;background:#fff;">
      <div style="font-family:monospace;font-size:13px;color:#555;">${link} &nbsp; ${escapeHtml(f.severity ?? "unknown")} severity</div>
      <div style="font-weight:600;font-size:14px;margin-top:4px;">${escapeHtml(f.packageName)}@${escapeHtml(f.matchedVersion ?? "?")} <span style="color:#666;font-weight:400">(${escapeHtml(f.sourceRepo)} / ${escapeHtml(f.sourceFile)})</span></div>
      <div style="margin-top:4px;">${escapeHtml(f.advisorySummary)}</div>
      ${f.triageReason ? `<div style="margin-top:4px;color:#444;font-style:italic">Triage: ${escapeHtml(f.triageReason)}</div>` : ""}
    </div>`.trim();
  const text = `${f.advisorySourceId}   ${f.severity ?? "unknown"} severity
${f.packageName}@${f.matchedVersion ?? "?"} (${f.sourceRepo} / ${f.sourceFile})
↳ ${f.advisorySummary}${f.triageReason ? `\n   Triage: ${f.triageReason}` : ""}
   ${f.advisoryUrl ?? ""}`;
  return { html, text };
}

function compactLine(f: EmailFinding): string {
  return `• ${f.advisorySourceId} ${f.packageName}@${f.matchedVersion ?? "?"} (${f.sourceRepo}) — ${f.triageReason ?? f.advisorySummary}`;
}

function section(title: string, count: number): { html: string; text: string } {
  const html = `<h3 style="margin:24px 0 8px 0;font-family:monospace;letter-spacing:0.05em;font-size:13px;color:#333;">${title} (${count})</h3><hr style="border:none;border-top:1px solid #ddd;margin:0;" />`;
  const text = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${title} (${count})\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  return { html, text };
}

export function renderEmail({ kind, findings }: Args): RenderedEmail {
  const subject = buildSubject(kind, findings);

  if (kind === "weekly_heartbeat") {
    return {
      subject,
      text: "SecWatch ran today. No new findings in the past week. The cron is alive.",
      html: `<p>SecWatch ran today. <strong>No new findings in the past week.</strong> The cron is alive.</p>`,
    };
  }

  const sorted = [...findings].sort((a, b) => bySeverity(a.rank) - bySeverity(b.rank));
  const groups = {
    critical: sorted.filter((f) => f.rank === "critical"),
    probably_relevant: sorted.filter((f) => f.rank === "probably_relevant"),
    untriaged: sorted.filter((f) => f.rank === "untriaged"),
    probably_not: sorted.filter((f) => f.rank === "probably_not"),
    noise: sorted.filter((f) => f.rank === "noise"),
  };

  let html = "";
  let text = "";

  for (const [name, items, fullDisplay] of [
    ["CRITICAL", groups.critical, true],
    ["PROBABLY RELEVANT", groups.probably_relevant, true],
    ["UNTRIAGED", groups.untriaged, true],
    ["PROBABLY NOT", groups.probably_not, false],
  ] as const) {
    if (items.length === 0) continue;
    const sec = section(name, items.length);
    html += sec.html;
    text += sec.text;
    if (fullDisplay) {
      for (const f of items) {
        const d = fullDetail(f);
        html += d.html;
        text += `\n${d.text}\n`;
      }
    } else {
      const lines = items.map(compactLine);
      html += `<div style="font-family:monospace;font-size:12px;color:#444;margin:8px 0;">${lines.map(escapeHtml).join("<br/>")}</div>`;
      text += `\n${lines.join("\n")}\n`;
    }
  }

  if (groups.noise.length > 0) {
    const ids = groups.noise.map((f) => f.advisorySourceId).join(", ");
    html += `<p style="color:#888;font-size:12px;margin-top:18px;">${groups.noise.length} items hidden as noise (${escapeHtml(ids)})</p>`;
    text += `\n\n${groups.noise.length} items hidden as noise (${ids})\n`;
  }

  return { subject, html, text };
}
