import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";

const baseEnv = {
  GITHUB_TOKEN: "ghp_x",
  ANTHROPIC_API_KEY: "sk-ant-x",
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "587",
  SMTP_USER: "u",
  SMTP_PASS: "p",
  SMTP_FROM_ADDRESS: "from@example.com",
  SMTP_FROM_NAME: "SecWatch",
  NOTIFY_TO: "to@example.com",
};

describe("loadConfig", () => {
  it("parses a valid env", () => {
    const c = loadConfig(baseEnv);
    expect(c.githubToken).toBe("ghp_x");
    expect(c.smtp.port).toBe(587);
    expect(c.smtp.secure).toBe(false);
    expect(c.smtp.fromName).toBe("SecWatch");
    expect(c.githubOrg).toBe("Bergert-Digital");
    expect(c.dbPath).toBe("/data/secwatch.db");
  });

  it("defaults SMTP_SECURE to true on port 465", () => {
    const c = loadConfig({ ...baseEnv, SMTP_PORT: "465" });
    expect(c.smtp.secure).toBe(true);
  });

  it("respects explicit SMTP_SECURE=true on port 587", () => {
    const c = loadConfig({ ...baseEnv, SMTP_SECURE: "true" });
    expect(c.smtp.secure).toBe(true);
  });

  it("throws on missing required var", () => {
    const { GITHUB_TOKEN, ...rest } = baseEnv;
    expect(() => loadConfig(rest)).toThrow(/GITHUB_TOKEN/);
  });

  it("throws on non-numeric SMTP_PORT", () => {
    expect(() => loadConfig({ ...baseEnv, SMTP_PORT: "nope" })).toThrow();
  });
});
