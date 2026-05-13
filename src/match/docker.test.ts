import { describe, it, expect } from "vitest";
import { isDockerAffected } from "./docker.js";

describe("isDockerAffected", () => {
  it("matches exact name + version", () => {
    expect(
      isDockerAffected({
        installedName: "postgres",
        installedVersion: "16.4",
        affectedName: "postgres",
        affectedVersions: ["16.4", "16.3"],
      }),
    ).toBe(true);
  });

  it("does not match different name", () => {
    expect(
      isDockerAffected({
        installedName: "postgres",
        installedVersion: "16.4",
        affectedName: "redis",
        affectedVersions: ["16.4"],
      }),
    ).toBe(false);
  });

  it("returns false when installed version is not in the list", () => {
    expect(
      isDockerAffected({
        installedName: "postgres",
        installedVersion: "16.5",
        affectedName: "postgres",
        affectedVersions: ["16.4", "16.3"],
      }),
    ).toBe(false);
  });

  it("matches when affectedVersions is empty (whole image affected)", () => {
    expect(
      isDockerAffected({
        installedName: "postgres",
        installedVersion: "16.4",
        affectedName: "postgres",
        affectedVersions: [],
      }),
    ).toBe(true);
  });
});
