import { z } from "zod";

const Schema = z.object({
  GITHUB_TOKEN: z.string().min(1),
  GITHUB_ORG: z.string().default("Bergert-Digital"),
  ANTHROPIC_API_KEY: z.string().min(1),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_SECURE: z.enum(["true", "false"]).optional(),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  SMTP_FROM_ADDRESS: z.string().email(),
  SMTP_FROM_NAME: z.string().min(1),
  NOTIFY_TO: z.string().email(),
  DB_PATH: z.string().default("/data/secwatch.db"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export interface Config {
  githubToken: string;
  githubOrg: string;
  anthropicKey: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    fromAddress: string;
    fromName: string;
  };
  notifyTo: string;
  dbPath: string;
  logLevel: "debug" | "info" | "warn" | "error";
}

export function loadConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): Config {
  const parsed = Schema.parse(env);
  const secure =
    parsed.SMTP_SECURE === undefined
      ? parsed.SMTP_PORT === 465
      : parsed.SMTP_SECURE === "true";
  return {
    githubToken: parsed.GITHUB_TOKEN,
    githubOrg: parsed.GITHUB_ORG,
    anthropicKey: parsed.ANTHROPIC_API_KEY,
    smtp: {
      host: parsed.SMTP_HOST,
      port: parsed.SMTP_PORT,
      secure,
      user: parsed.SMTP_USER,
      pass: parsed.SMTP_PASS,
      fromAddress: parsed.SMTP_FROM_ADDRESS,
      fromName: parsed.SMTP_FROM_NAME,
    },
    notifyTo: parsed.NOTIFY_TO,
    dbPath: parsed.DB_PATH,
    logLevel: parsed.LOG_LEVEL,
  };
}
