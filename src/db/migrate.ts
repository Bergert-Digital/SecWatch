import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { loadConfig } from "../config.js";
import { createLogger } from "../logger.js";

const cfg = loadConfig();
const log = createLogger({ level: cfg.logLevel });
const sqlite = new Database(cfg.dbPath);
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite);
log.info("migrate", "running migrations", { path: cfg.dbPath });
migrate(db, { migrationsFolder: "./src/db/migrations" });
log.info("migrate", "done");
sqlite.close();
