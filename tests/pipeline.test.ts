import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
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

const kevBody = readFileSync("tests/fixtures/kev/known_exploited.json", "utf-8");
const releasesBody = readFileSync("tests/fixtures/github/coolify-releases.atom", "utf-8");

const servicesYaml = `
- name: coolify
  github: coollabsio/coolify
  current_version: 4.0.0-beta.420
`;

const SMTP = {
  host: "h",
  port: 587,
  secure: false,
  user: "u",
  pass: "p",
  fromAddress: "f@x",
  fromName: "SecWatch",
};

describe("runPipeline", () => {
  it("end-to-end: images + services → kev/releases → match → triage → email", async () => {
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
        p === "docker-compose.yml" ? `services:\n  db:\n    image: postgres:16.4\n` : null,
      ),
    };

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("cisa.gov")) return new Response(kevBody, { status: 200 });
      if (url.includes("github.com")) return new Response(releasesBody, { status: 200 });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const sdk = {
      messages: {
        create: vi.fn(async () => ({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                rankings: [
                  { finding_id: 1, rank: "critical", reason: "exploited in the wild" },
                  { finding_id: 2, rank: "probably_relevant", reason: "security release" },
                ],
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
        smtp: SMTP,
        githubOrg: "Bergert-Digital",
        servicesYaml,
      },
      now: "2026-05-13T05:00:00Z",
    });

    expect(db.select().from(runs).all()[0]?.status).toBe("ok");

    // One KEV advisory (PostgreSQL) + one security release (coolify).
    expect(db.select().from(advisories).all()).toHaveLength(2);

    const fs = db.select().from(findings).all();
    expect(fs.map((f) => f.packageName).sort()).toEqual(["coolify", "postgres"]);
    expect(fs.every((f) => f.notifiedAt !== null)).toBe(true);
    expect(fs.find((f) => f.packageName === "postgres")?.ecosystem).toBe("docker");
    expect(fs.find((f) => f.packageName === "coolify")?.ecosystem).toBe("service");

    expect(sendMail).toHaveBeenCalledOnce();
    expect(db.select().from(emailLog).all()[0]?.kind).toBe("daily");
  });

  it("never asks GitHub for package manifests", async () => {
    const db = openDb(":memory:");
    applySchema(db);

    const readFile = vi.fn(async (_repo: string, _path: string) => null);
    const gh: GithubClient = {
      listRepos: vi.fn(async () => [
        {
          name: "feldova",
          fullName: "Bergert-Digital/feldova",
          defaultBranch: "main",
          private: false,
        },
      ]),
      readFile,
    };

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("cisa.gov"))
        return new Response(JSON.stringify({ vulnerabilities: [] }), { status: 200 });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await runPipeline({
      db,
      gh,
      sdk: { messages: { create: vi.fn() } } as never,
      fetch: fetchMock as never,
      transport: { sendMail: vi.fn(async () => ({ messageId: "x" })) } as never,
      cfg: {
        notifyTo: "j@example.com",
        smtp: SMTP,
        githubOrg: "Bergert-Digital",
        servicesYaml: "",
      },
      now: "2026-05-13T05:00:00Z",
    });

    const requested = readFile.mock.calls.map((c) => c[1]);
    expect(requested).toEqual([
      "Dockerfile",
      "docker-compose.yml",
      "docker-compose.yaml",
      "compose.yaml",
    ]);
    // osv.dev / socket.dev are gone — any call to them would have thrown above.
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
