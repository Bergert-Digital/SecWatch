import { describe, it, expect } from "vitest";
import { createLogger } from "./logger.js";

describe("createLogger", () => {
  it("emits JSON lines with timestamp, level, phase, message", () => {
    const writes: string[] = [];
    const log = createLogger({ level: "info", write: (s) => writes.push(s) });
    log.info("inventory", "started");
    expect(writes.length).toBe(1);
    const entry = JSON.parse(writes[0]!);
    expect(entry.level).toBe("info");
    expect(entry.phase).toBe("inventory");
    expect(entry.message).toBe("started");
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("filters by level", () => {
    const writes: string[] = [];
    const log = createLogger({ level: "warn", write: (s) => writes.push(s) });
    log.info("a", "skip");
    log.warn("a", "keep");
    expect(writes.length).toBe(1);
    expect(JSON.parse(writes[0]!).message).toBe("keep");
  });

  it("serializes Error objects", () => {
    const writes: string[] = [];
    const log = createLogger({ level: "info", write: (s) => writes.push(s) });
    log.error("feeds", "kev fetch failed", { error: new Error("boom") });
    const entry = JSON.parse(writes[0]!);
    expect(entry.error.message).toBe("boom");
    expect(entry.error.stack).toBeTypeOf("string");
  });
});
