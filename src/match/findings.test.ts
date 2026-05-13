import { describe, it, expect, beforeEach } from "vitest";
import { openDb, type DbHandle } from "../db/client.js";
import { advisories, findings } from "../db/schema.js";
import { computeNewFindings } from "./findings.js";

function applySchema(db: DbHandle): void {
  const sqlite = (db as unknown as { $client: { exec(s: string): void } }).$client;
  sqlite.exec(`
    CREATE TABLE advisories (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL,
      source_id TEXT NOT NULL, severity TEXT, summary TEXT NOT NULL, details TEXT,
      affected_json TEXT NOT NULL, url TEXT, published_at TEXT, fetched_at TEXT NOT NULL);
    CREATE UNIQUE INDEX adv_source_id ON advisories(source, source_id);
    CREATE TABLE findings (id INTEGER PRIMARY KEY AUTOINCREMENT, advisory_id INTEGER NOT NULL,
      ecosystem TEXT NOT NULL, package_name TEXT NOT NULL, matched_version TEXT,
      source_repo TEXT NOT NULL, source_file TEXT NOT NULL, first_seen TEXT NOT NULL,
      triage_rank TEXT, triage_reason TEXT, triaged_at TEXT, notified_at TEXT);
    CREATE UNIQUE INDEX find_unique ON findings(advisory_id, source_repo, source_file, package_name);
  `);
}

describe("computeNewFindings", () => {
  let db: DbHandle;
  beforeEach(() => {
    db = openDb(":memory:");
    applySchema(db);
    db.insert(advisories)
      .values({
        source: "osv",
        sourceId: "GHSA-test",
        severity: "high",
        summary: "Bad bug in next",
        details: "...",
        affectedJson: JSON.stringify([
          {
            ecosystem: "npm",
            packageName: "next",
            ranges: [{ type: "SEMVER", introduced: "0", fixed: "14.2.31" }],
          },
        ]),
        url: null,
        publishedAt: null,
        fetchedAt: "2026-05-13T05:00:00Z",
      })
      .run();
  });

  it("inserts new findings and returns them", async () => {
    const newOnes = await computeNewFindings({
      db,
      inventory: [
        {
          ecosystem: "npm",
          name: "next",
          version: "14.2.3",
          sourceRepo: "Bergert-Digital/feldova",
          sourceFile: "package.json",
        },
      ],
      now: "2026-05-13T05:00:00Z",
    });
    expect(newOnes.length).toBe(1);
    expect(newOnes[0]!.packageName).toBe("next");
    expect(db.select().from(findings).all()).toHaveLength(1);
  });

  it("does not re-insert on a second run", async () => {
    const args = {
      db,
      inventory: [
        {
          ecosystem: "npm" as const,
          name: "next",
          version: "14.2.3",
          sourceRepo: "Bergert-Digital/feldova",
          sourceFile: "package.json",
        },
      ],
      now: "2026-05-13T05:00:00Z",
    };
    await computeNewFindings(args);
    const second = await computeNewFindings(args);
    expect(second.length).toBe(0);
    expect(db.select().from(findings).all()).toHaveLength(1);
  });

  it("does not match when version is patched", async () => {
    const newOnes = await computeNewFindings({
      db,
      inventory: [
        {
          ecosystem: "npm",
          name: "next",
          version: "14.2.31",
          sourceRepo: "Bergert-Digital/feldova",
          sourceFile: "package.json",
        },
      ],
      now: "2026-05-13T05:00:00Z",
    });
    expect(newOnes.length).toBe(0);
  });
});
