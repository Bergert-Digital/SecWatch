import type Anthropic from "@anthropic-ai/sdk";
import type { Transporter } from "nodemailer";
import { eq, gte, sql, and, isNull } from "drizzle-orm";
import { readFileSync, existsSync } from "node:fs";

import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { openDb, type DbHandle } from "./db/client.js";
import {
  runs as runsTable,
  inventoryItems as inventoryTable,
  advisories as advisoriesTable,
  findings as findingsTable,
  emailLog as emailLogTable,
} from "./db/schema.js";

import { createGithubClient, type GithubClient } from "./inventory/github.js";
import { buildInventory } from "./inventory/snapshot.js";
import { loadServiceEntries } from "./inventory/services.js";

import { queryOsv } from "./feeds/osv.js";
import { queryKev } from "./feeds/kev.js";
import { querySocket } from "./feeds/socket.js";
import { queryGithubReleases } from "./feeds/github-releases.js";
import type { Advisory } from "./feeds/types.js";

import { computeNewFindings } from "./match/findings.js";
import { triageFindings, type TriageResult } from "./triage/claude.js";
import { renderEmail, type EmailFinding } from "./notify/render.js";
import { createSmtpTransport, createSmtpSender } from "./notify/smtp.js";
import { decideEmailKind } from "./notify/policy.js";

interface PipelineCfg {
  notifyTo: string;
  githubOrg: string;
  servicesYaml: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    fromAddress: string;
    fromName: string;
  };
}

interface PipelineArgs {
  db: DbHandle;
  gh: GithubClient;
  sdk: Pick<Anthropic, "messages">;
  fetch: typeof globalThis.fetch;
  transport: Transporter;
  cfg: PipelineCfg;
  now: string;
}

async function persistAdvisories(
  db: DbHandle,
  advs: Advisory[],
  now: string,
): Promise<void> {
  for (const a of advs) {
    db.insert(advisoriesTable)
      .values({
        source: a.source,
        sourceId: a.sourceId,
        severity: a.severity,
        summary: a.summary,
        details: a.details,
        affectedJson: JSON.stringify(a.affected),
        url: a.url,
        publishedAt: a.publishedAt,
        fetchedAt: now,
      })
      .onConflictDoNothing()
      .run();
  }
}

export async function runPipeline(args: PipelineArgs): Promise<void> {
  const { db, gh, sdk, fetch, transport, cfg, now } = args;

  const [run] = db
    .insert(runsTable)
    .values({ startedAt: now, status: "running" })
    .returning()
    .all();

  try {
    const inventory = await buildInventory({ gh, servicesYaml: cfg.servicesYaml });
    for (const it of inventory) {
      db.insert(inventoryTable)
        .values({
          runId: run!.id,
          ecosystem: it.ecosystem,
          name: it.name,
          version: it.version,
          sourceRepo: it.sourceRepo,
          sourceFile: it.sourceFile,
        })
        .run();
    }

    const products = inventory.map((i) => i.name);
    const npmNames = inventory.filter((i) => i.ecosystem === "npm").map((i) => i.name);
    const services = cfg.servicesYaml.trim()
      ? loadServiceEntries(cfg.servicesYaml)
          .filter((s) => s.github)
          .map((s) => ({ name: s.name, github: s.github! }))
      : [];
    const [osvAdv, kevAdv, socketAdv, releaseAdv] = await Promise.all([
      queryOsv({ items: inventory, fetch }).catch(() => []),
      queryKev({ productNames: products, fetch }).catch(() => []),
      querySocket({ npmPackageNames: npmNames, fetch }).catch(() => []),
      queryGithubReleases({ services, fetch }).catch(() => []),
    ]);
    await persistAdvisories(db, [...osvAdv, ...kevAdv, ...socketAdv, ...releaseAdv], now);

    const newFindings = await computeNewFindings({ db, inventory, now });

    const triageInputs = newFindings.map((nf) => {
      const adv = db
        .select()
        .from(advisoriesTable)
        .where(eq(advisoriesTable.id, nf.advisoryId))
        .all()[0]!;
      return {
        findingId: nf.id,
        advisorySourceId: adv.sourceId,
        advisorySeverity: adv.severity,
        advisorySummary: adv.summary,
        advisoryDetails: adv.details,
        packageName: nf.packageName,
        matchedVersion: nf.matchedVersion,
        ecosystem: nf.ecosystem,
        affected: JSON.parse(adv.affectedJson),
        sourceRepo: nf.sourceRepo,
        sourceFile: nf.sourceFile,
      };
    });
    const ranks = await triageFindings({ sdk, findings: triageInputs });
    for (const nf of newFindings) {
      const r: TriageResult | undefined = ranks.get(nf.id);
      db.update(findingsTable)
        .set({
          triageRank: r?.rank ?? "untriaged",
          triageReason: r?.reason ?? null,
          triagedAt: now,
        })
        .where(eq(findingsTable.id, nf.id))
        .run();
    }

    const findingsInLastWeek = db
      .select({ c: sql<number>`count(*)` })
      .from(findingsTable)
      .where(
        gte(
          findingsTable.firstSeen,
          new Date(new Date(now).getTime() - 7 * 24 * 3600 * 1000).toISOString(),
        ),
      )
      .all()[0]!.c;

    const kind = decideEmailKind({
      now,
      newFindingsToday: newFindings.length,
      findingsInLastWeek,
    });

    if (kind) {
      const cutoff =
        kind === "daily"
          ? new Date(new Date(now).getTime() - 24 * 3600 * 1000).toISOString()
          : new Date(new Date(now).getTime() - 7 * 24 * 3600 * 1000).toISOString();
      const rows =
        kind === "weekly_heartbeat"
          ? []
          : db
              .select({ f: findingsTable, a: advisoriesTable })
              .from(findingsTable)
              .innerJoin(advisoriesTable, eq(advisoriesTable.id, findingsTable.advisoryId))
              .where(gte(findingsTable.firstSeen, cutoff))
              .all();

      const emailFindings: EmailFinding[] = rows.map(({ f, a }) => ({
        rank: (f.triageRank as EmailFinding["rank"]) ?? "untriaged",
        advisorySourceId: a.sourceId,
        advisorySummary: a.summary,
        advisoryUrl: a.url,
        severity: a.severity,
        packageName: f.packageName,
        matchedVersion: f.matchedVersion,
        ecosystem: f.ecosystem,
        sourceRepo: f.sourceRepo,
        sourceFile: f.sourceFile,
        triageReason: f.triageReason,
      }));

      const email = renderEmail({ kind, findings: emailFindings });
      const send = createSmtpSender({
        transport,
        fromAddress: cfg.smtp.fromAddress,
        fromName: cfg.smtp.fromName,
      });
      await send({
        to: cfg.notifyTo,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });

      db.insert(emailLogTable)
        .values({
          sentAt: now,
          kind,
          findingCount: emailFindings.length,
          toAddress: cfg.notifyTo,
        })
        .run();

      const todayIds = newFindings.map((nf) => nf.id);
      for (const id of todayIds) {
        db.update(findingsTable)
          .set({ notifiedAt: now })
          .where(and(eq(findingsTable.id, id), isNull(findingsTable.notifiedAt)))
          .run();
      }
    }

    db.update(runsTable)
      .set({ status: "ok", completedAt: now })
      .where(eq(runsTable.id, run!.id))
      .run();
  } catch (err) {
    db.update(runsTable)
      .set({
        status: "error",
        completedAt: now,
        errorText: err instanceof Error ? err.message + "\n" + err.stack : String(err),
      })
      .where(eq(runsTable.id, run!.id))
      .run();
    throw err;
  }
}

export async function main(): Promise<void> {
  const cfg = loadConfig();
  const log = createLogger({ level: cfg.logLevel });
  log.info("main", "secwatch starting");
  const db = openDb(cfg.dbPath);
  const gh = createGithubClient({ token: cfg.githubToken, org: cfg.githubOrg });
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const sdk = new Anthropic({ apiKey: cfg.anthropicKey });
  const transport = createSmtpTransport(cfg.smtp);
  const servicesYaml = existsSync("./services.yaml")
    ? readFileSync("./services.yaml", "utf-8")
    : "";

  try {
    await runPipeline({
      db,
      gh,
      sdk,
      fetch: globalThis.fetch,
      transport,
      cfg: {
        notifyTo: cfg.notifyTo,
        githubOrg: cfg.githubOrg,
        servicesYaml,
        smtp: cfg.smtp,
      },
      now: new Date().toISOString(),
    });
    log.info("main", "secwatch done");
  } catch (err) {
    log.error("main", "secwatch failed", { error: err });
    process.exitCode = 1;
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  await main();
}
