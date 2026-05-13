import { eq } from "drizzle-orm";
import type { DbHandle } from "../db/client.js";
import { advisories, findings } from "../db/schema.js";
import type { InventoryItem } from "../inventory/types.js";
import type { AffectedRange } from "../feeds/types.js";
import { isAffected } from "./semver.js";
import { isDockerAffected } from "./docker.js";

const OSV_ECO_MAP: Record<string, string> = {
  npm: "npm",
  composer: "Packagist",
  pypi: "PyPI",
  go: "Go",
};

interface Args {
  db: DbHandle;
  inventory: InventoryItem[];
  now: string;
}

export interface NewFinding {
  id: number;
  advisoryId: number;
  packageName: string;
  ecosystem: string;
  matchedVersion: string | null;
  sourceRepo: string;
  sourceFile: string;
}

export async function computeNewFindings({
  db,
  inventory,
  now,
}: Args): Promise<NewFinding[]> {
  const allAdvisories = db.select().from(advisories).all();
  const out: NewFinding[] = [];

  for (const adv of allAdvisories) {
    const affected = JSON.parse(adv.affectedJson) as AffectedRange[];
    for (const a of affected) {
      for (const item of inventory) {
        const expectedEco = OSV_ECO_MAP[item.ecosystem];
        let match = false;
        if (item.ecosystem === "docker") {
          if (a.packageName === item.name && item.version) {
            const versions = a.versions ?? [];
            match = isDockerAffected({
              installedName: item.name,
              installedVersion: item.version,
              affectedName: a.packageName,
              affectedVersions: versions,
            });
          }
        } else {
          if (!expectedEco || a.ecosystem !== expectedEco) continue;
          if (a.packageName !== item.name) continue;
          if (!item.version) continue;
          match = isAffected({
            installedVersion: item.version,
            ranges: a.ranges,
            versions: a.versions,
            ecosystem: item.ecosystem,
          });
        }
        if (!match) continue;

        const existing = db
          .select()
          .from(findings)
          .where(eq(findings.advisoryId, adv.id))
          .all()
          .find(
            (f) =>
              f.sourceRepo === item.sourceRepo &&
              f.sourceFile === item.sourceFile &&
              f.packageName === item.name,
          );
        if (existing) continue;
        const inserted = db
          .insert(findings)
          .values({
            advisoryId: adv.id,
            ecosystem: item.ecosystem,
            packageName: item.name,
            matchedVersion: item.version,
            sourceRepo: item.sourceRepo,
            sourceFile: item.sourceFile,
            firstSeen: now,
          })
          .returning()
          .all();
        const row = inserted[0]!;
        out.push({
          id: row.id,
          advisoryId: adv.id,
          packageName: item.name,
          ecosystem: item.ecosystem,
          matchedVersion: item.version,
          sourceRepo: item.sourceRepo,
          sourceFile: item.sourceFile,
        });
      }
    }
  }
  return out;
}
