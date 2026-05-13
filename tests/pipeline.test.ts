import { describe, it, expect, vi } from "vitest";
import { runPipeline } from "../src/main.js";
import { openDb } from "../src/db/client.js";
import { runs, findings, emailLog, advisories } from "../src/db/schema.js";
import type { GithubClient } from "../src/inventory/github.js";

function applySchema(db: ReturnType<typeof openDb>): void {
  const sqlite = (db as unknown as { $client: { exec(s: string): void } }).$client;
  sqlite.exec(`
    CREATE TABLE runs (id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL,
      completed_at TEXT, status TEXT NOT NULL DEFAULT 'running', error_text TEXT);
    CREATE TABLE inventory_items (id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL, ecosystem TEXT NOT NULL, name TEXT NOT NULL,
      version TEXT, source_repo TEXT NOT NULL, source_file TEXT NOT NULL);
    CREATE TABLE advisories (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL,
      source_id TEXT NOT NULL, severity TEXT, summary TEXT NOT NULL, details TEXT,
      affected_json TEXT NOT NULL, url TEXT, published_at TEXT, fetched_at TEXT NOT NULL);
    CREATE UNIQUE INDEX adv_source_id ON advisories(source, source_id);
    CREATE TABLE findings (id INTEGER PRIMARY KEY AUTOINCREMENT, advisory_id INTEGER NOT NULL,
      ecosystem TEXT NOT NULL, package_name TEXT NOT NULL, matched_version TEXT,
      source_repo TEXT NOT NULL, source_file TEXT NOT NULL, first_seen TEXT NOT NULL,
      triage_rank TEXT, triage_reason TEXT, triaged_at TEXT, notified_at TEXT);
    CREATE UNIQUE INDEX find_unique ON findings(advisory_id, source_repo, source_file, package_name);
    CREATE TABLE email_log (id INTEGER PRIMARY KEY AUTOINCREMENT, sent_at TEXT NOT NULL,
      kind TEXT NOT NULL, finding_count INTEGER NOT NULL, to_address TEXT NOT NULL);
  `);
}

const fakeOsvBody = JSON.stringify({
  results: [
    {
      vulns: [
        {
          id: "GHSA-fake",
          summary: "Bad bug",
          details: "...",
          severity: [{ type: "CVSS_V3", score: "8.5" }],
          affected: [
            {
              package: { name: "next", ecosystem: "npm" },
              ranges: [
                { type: "SEMVER", events: [{ introduced: "0" }, { fixed: "14.2.31" }] },
              ],
            },
          ],
          references: [{ type: "ADVISORY", url: "https://example/x" }],
          published: "2026-05-12T00:00:00Z",
        },
      ],
    },
  ],
});

describe("runPipeline", () => {
  it("end-to-end: inventory → osv → match → triage → email", async () => {
    const db = openDb(":memory:");
    applySchema(db);

    const gh: GithubClient = {
      listRepos: vi.fn(async () => [
        {
          name: "feldova",
          fullName: "Bergert-Digital/feldova",
          defaultBranch: "main",
          private: false,
        },
      ]),
      readFile: vi.fn(async (_r, p) =>
        p === "package.json" ? `{"dependencies":{"next":"14.2.3"}}` : null,
      ),
    };

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("osv.dev")) return new Response(fakeOsvBody, { status: 200 });
      if (url.includes("cisa.gov"))
        return new Response(JSON.stringify({ vulnerabilities: [] }), { status: 200 });
      if (url.includes("socket.dev"))
        return new Response(
          `<feed xmlns="http://www.w3.org/2005/Atom"><title>x</title></feed>`,
          { status: 200 },
        );
      if (url.includes("github.com"))
        return new Response(
          `<feed xmlns="http://www.w3.org/2005/Atom"><title>x</title></feed>`,
          { status: 200 },
        );
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const sdk = {
      messages: {
        create: vi.fn(async () => ({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                rankings: [{ finding_id: 1, rank: "critical", reason: "auth path" }],
              }),
            },
          ],
        })),
      },
    } as never;

    const sendMail = vi.fn(async () => ({ messageId: "x" }));

    await runPipeline({
      db,
      gh,
      sdk,
      fetch: fetchMock as never,
      transport: { sendMail } as never,
      cfg: {
        notifyTo: "j@example.com",
        smtp: {
          host: "h",
          port: 587,
          secure: false,
          user: "u",
          pass: "p",
          fromAddress: "f@x",
          fromName: "SecWatch",
        },
        githubOrg: "Bergert-Digital",
        servicesYaml: "",
      },
      now: "2026-05-13T05:00:00Z",
    });

    expect(db.select().from(runs).all()[0]?.status).toBe("ok");
    expect(db.select().from(advisories).all()).toHaveLength(1);
    const fs = db.select().from(findings).all();
    expect(fs).toHaveLength(1);
    expect(fs[0]!.triageRank).toBe("critical");
    expect(fs[0]!.notifiedAt).not.toBeNull();
    expect(sendMail).toHaveBeenCalledOnce();
    expect(db.select().from(emailLog).all()[0]?.kind).toBe("daily");
  });
});
