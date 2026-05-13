import type { EmailKind } from "./render.js";

interface Args {
  now: string;
  newFindingsToday: number;
  findingsInLastWeek: number;
}

function isMondayInBerlin(iso: string): boolean {
  const fmt = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "Europe/Berlin",
  });
  return fmt.format(new Date(iso)) === "Mon";
}

export function decideEmailKind({
  now,
  newFindingsToday,
  findingsInLastWeek,
}: Args): EmailKind | null {
  if (isMondayInBerlin(now)) {
    if (findingsInLastWeek === 0 && newFindingsToday === 0) return "weekly_heartbeat";
    return "weekly_recap";
  }
  return newFindingsToday > 0 ? "daily" : null;
}
