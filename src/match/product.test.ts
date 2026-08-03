import { describe, it, expect } from "vitest";
import { isProductAffected } from "./product.js";

describe("isProductAffected", () => {
  it("matches exact name + version", () => {
    expect(
      isProductAffected({
        installedName: "postgres",
        installedVersion: "16.4",
        affectedName: "postgres",
        affectedVersions: ["16.4", "16.3"],
      }),
    ).toBe(true);
  });

  it("does not match a different name", () => {
    expect(
      isProductAffected({
        installedName: "postgres",
        installedVersion: "16.4",
        affectedName: "redis",
        affectedVersions: ["16.4"],
      }),
    ).toBe(false);
  });

  it("returns false when the installed version is not in the list", () => {
    expect(
      isProductAffected({
        installedName: "postgres",
        installedVersion: "16.5",
        affectedName: "postgres",
        affectedVersions: ["16.4", "16.3"],
      }),
    ).toBe(false);
  });

  it("matches when no version list is given (whole product affected)", () => {
    expect(
      isProductAffected({
        installedName: "postgres",
        installedVersion: "16.4",
        affectedName: "postgres",
      }),
    ).toBe(true);
  });

  it("matches an unknown installed version rather than dropping it silently", () => {
    expect(
      isProductAffected({
        installedName: "traefik",
        installedVersion: null,
        affectedName: "traefik",
        affectedVersions: ["3.4"],
      }),
    ).toBe(true);
  });
});
