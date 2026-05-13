import { describe, it, expect } from "vitest";
import { isAffected } from "./semver.js";

describe("isAffected (npm)", () => {
  const cases: Array<[string, string, string | undefined, boolean]> = [
    ["14.2.3", "0", "14.2.31", true],
    ["14.2.31", "0", "14.2.31", false],
    ["14.2.40", "0", "14.2.31", false],
    ["1.0.0", "2.0.0", undefined, false],
    ["2.5.0", "2.0.0", "3.0.0", true],
    ["^18.3.1", "0", "19.0.0", true],
  ];
  it.each(cases)("%s introduced=%s fixed=%s → %s", (installed, introduced, fixed, expected) => {
    expect(
      isAffected({
        installedVersion: installed,
        ranges: [{ type: "SEMVER", introduced, fixed }],
        ecosystem: "npm",
      }),
    ).toBe(expected);
  });

  it("returns true when versions[] contains installed exactly", () => {
    expect(
      isAffected({
        installedVersion: "1.2.3",
        ranges: [],
        versions: ["1.2.3", "1.2.4"],
        ecosystem: "npm",
      }),
    ).toBe(true);
  });
});
