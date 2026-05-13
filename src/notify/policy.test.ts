import { describe, it, expect } from "vitest";
import { decideEmailKind } from "./policy.js";

describe("decideEmailKind", () => {
  const mondayBerlin = "2026-05-11T05:00:00Z";
  const tuesdayBerlin = "2026-05-12T05:00:00Z";

  it("Monday, no findings this week → weekly_heartbeat", () => {
    expect(
      decideEmailKind({ now: mondayBerlin, newFindingsToday: 0, findingsInLastWeek: 0 }),
    ).toBe("weekly_heartbeat");
  });

  it("Monday, findings in past week → weekly_recap (no daily)", () => {
    expect(
      decideEmailKind({ now: mondayBerlin, newFindingsToday: 0, findingsInLastWeek: 3 }),
    ).toBe("weekly_recap");
  });

  it("Monday with new findings today → weekly_recap (not daily)", () => {
    expect(
      decideEmailKind({ now: mondayBerlin, newFindingsToday: 2, findingsInLastWeek: 2 }),
    ).toBe("weekly_recap");
  });

  it("Tuesday with new findings → daily", () => {
    expect(
      decideEmailKind({ now: tuesdayBerlin, newFindingsToday: 1, findingsInLastWeek: 1 }),
    ).toBe("daily");
  });

  it("Tuesday with no findings → null (no email)", () => {
    expect(
      decideEmailKind({ now: tuesdayBerlin, newFindingsToday: 0, findingsInLastWeek: 0 }),
    ).toBe(null);
  });
});
