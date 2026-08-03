import { describe, it, expect, beforeEach } from "vitest";
import { openDb, type DbHandle } from "../db/client.js";
import { advisories, findings } from "../db/schema.js";
import type { AffectedProduct } from "../feeds/types.js";
import type { InventoryItem } from "../inventory/types.js";
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

const NOW = "2026-05-13T05:00:00Z";

const SERVICE_ITEM: InventoryItem = {
  ecosystem: "service",
  name: "traefik",
  version: "3.4",
  sourceRepo: "services.yaml",
  sourceFile: "services.yaml",
};

const DOCKER_ITEM: InventoryItem = {
  ecosystem: "docker",
  name: "postgres",
  version: "16.4",
  sourceRepo: "Bergert-Digital/feldova",
  sourceFile: "docker-compose.yml",
};

describe("computeNewFindings", () => {
  let db: DbHandle;

  function seedAdvisory(source: string, sourceId: string, affected: AffectedProduct[]): void {
    db.insert(advisories)
      .values({
        source,
        sourceId,
        severity: "critical",
        summary: `advisory ${sourceId}`,
        details: "...",
        affectedJson: JSON.stringify(affected),
        url: null,
        publishedAt: null,
        fetchedAt: NOW,
      })
      .run();
  }

  beforeEach(() => {
    db = openDb(":memory:");
    applySchema(db);
  });

  it("matches a KEV advisory against a self-hosted service", async () => {
    seedAdvisory("kev", "CVE-2026-1", [{ packageName: "traefik" }]);
    const newOnes = await computeNewFindings({ db, inventory: [SERVICE_ITEM], now: NOW });
    expect(newOnes).toHaveLength(1);
    expect(newOnes[0]!.packageName).toBe("traefik");
    expect(newOnes[0]!.ecosystem).toBe("service");
  });

  it("matches a security release advisory against a container image", async () => {
    seedAdvisory("github-release", "rel-1", [{ packageName: "postgres" }]);
    const newOnes = await computeNewFindings({ db, inventory: [DOCKER_ITEM], now: NOW });
    expect(newOnes).toHaveLength(1);
    expect(newOnes[0]!.sourceFile).toBe("docker-compose.yml");
  });

  it("does not match an unrelated product", async () => {
    seedAdvisory("kev", "CVE-2026-2", [{ packageName: "redis" }]);
    const newOnes = await computeNewFindings({
      db,
      inventory: [SERVICE_ITEM, DOCKER_ITEM],
      now: NOW,
    });
    expect(newOnes).toEqual([]);
  });

  it("respects an explicit affected-version list", async () => {
    seedAdvisory("kev", "CVE-2026-3", [{ packageName: "postgres", versions: ["16.3"] }]);
    const newOnes = await computeNewFindings({ db, inventory: [DOCKER_ITEM], now: NOW });
    expect(newOnes).toEqual([]);
  });

  it("reports the same product once per place it is installed", async () => {
    seedAdvisory("kev", "CVE-2026-4", [{ packageName: "postgres" }]);
    const other: InventoryItem = { ...DOCKER_ITEM, sourceRepo: "Bergert-Digital/show" };
    const newOnes = await computeNewFindings({
      db,
      inventory: [DOCKER_ITEM, other],
      now: NOW,
    });
    expect(newOnes).toHaveLength(2);
  });

  it("does not re-insert on a second run", async () => {
    seedAdvisory("kev", "CVE-2026-5", [{ packageName: "traefik" }]);
    const args = { db, inventory: [SERVICE_ITEM], now: NOW };
    await computeNewFindings(args);
    const second = await computeNewFindings(args);
    expect(second).toEqual([]);
    expect(db.select().from(findings).all()).toHaveLength(1);
  });
});
