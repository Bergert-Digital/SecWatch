import { sqliteTable, integer, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const runs = sqliteTable("runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  status: text("status").notNull().default("running"),
  errorText: text("error_text"),
});

export const inventoryItems = sqliteTable(
  "inventory_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: integer("run_id")
      .notNull()
      .references(() => runs.id),
    ecosystem: text("ecosystem").notNull(),
    name: text("name").notNull(),
    version: text("version"),
    sourceRepo: text("source_repo").notNull(),
    sourceFile: text("source_file").notNull(),
  },
  (t) => ({
    byEcoName: index("inv_eco_name").on(t.ecosystem, t.name),
  }),
);

export const advisories = sqliteTable(
  "advisories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    severity: text("severity"),
    summary: text("summary").notNull(),
    details: text("details"),
    affectedJson: text("affected_json").notNull(),
    url: text("url"),
    publishedAt: text("published_at"),
    fetchedAt: text("fetched_at").notNull(),
  },
  (t) => ({
    uqSourceId: uniqueIndex("adv_source_id").on(t.source, t.sourceId),
  }),
);

export const findings = sqliteTable(
  "findings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    advisoryId: integer("advisory_id")
      .notNull()
      .references(() => advisories.id),
    ecosystem: text("ecosystem").notNull(),
    packageName: text("package_name").notNull(),
    matchedVersion: text("matched_version"),
    sourceRepo: text("source_repo").notNull(),
    sourceFile: text("source_file").notNull(),
    firstSeen: text("first_seen").notNull(),
    triageRank: text("triage_rank"),
    triageReason: text("triage_reason"),
    triagedAt: text("triaged_at"),
    notifiedAt: text("notified_at"),
  },
  (t) => ({
    uqFinding: uniqueIndex("find_unique").on(
      t.advisoryId,
      t.sourceRepo,
      t.sourceFile,
      t.packageName,
    ),
  }),
);

export const emailLog = sqliteTable("email_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sentAt: text("sent_at").notNull(),
  kind: text("kind").notNull(),
  findingCount: integer("finding_count").notNull(),
  toAddress: text("to_address").notNull(),
});
