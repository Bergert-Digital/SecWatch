import { describe, it, expect } from "vitest";
import { openDb } from "./client.js";
import { runs, inventoryItems } from "./schema.js";
import { eq } from "drizzle-orm";

describe("schema", () => {
  it("can insert and query a run + inventory item + finding", () => {
    const db = openDb(":memory:");
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
    `);

    const [run] = db.insert(runs).values({ startedAt: "2026-05-13T05:00:00Z" }).returning().all();
    expect(run!.id).toBeGreaterThan(0);

    db.insert(inventoryItems)
      .values({
        runId: run!.id,
        ecosystem: "npm",
        name: "next",
        version: "14.2.3",
        sourceRepo: "Bergert-Digital/feldova",
        sourceFile: "package.json",
      })
      .run();

    const rows = db.select().from(inventoryItems).where(eq(inventoryItems.runId, run!.id)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("next");
  });
});
