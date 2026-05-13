export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(phase: string, message: string, meta?: Record<string, unknown>): void;
  info(phase: string, message: string, meta?: Record<string, unknown>): void;
  warn(phase: string, message: string, meta?: Record<string, unknown>): void;
  error(phase: string, message: string, meta?: Record<string, unknown>): void;
}

interface LoggerOptions {
  level: LogLevel;
  write?: (line: string) => void;
}

function serializeMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = v instanceof Error ? { message: v.message, stack: v.stack } : v;
  }
  return out;
}

export function createLogger(opts: LoggerOptions): Logger {
  const threshold = ORDER[opts.level];
  const write = opts.write ?? ((line: string) => process.stdout.write(line + "\n"));
  function emit(
    level: LogLevel,
    phase: string,
    message: string,
    meta?: Record<string, unknown>,
  ) {
    if (ORDER[level] < threshold) return;
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      phase,
      message,
    };
    if (meta) Object.assign(entry, serializeMeta(meta));
    write(JSON.stringify(entry));
  }
  return {
    debug: (p, m, meta) => emit("debug", p, m, meta),
    info: (p, m, meta) => emit("info", p, m, meta),
    warn: (p, m, meta) => emit("warn", p, m, meta),
    error: (p, m, meta) => emit("error", p, m, meta),
  };
}
