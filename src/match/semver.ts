import semver from "semver";

export interface Range {
  type: "SEMVER" | "ECOSYSTEM" | "GIT";
  introduced?: string;
  fixed?: string;
}

interface Args {
  installedVersion: string;
  ranges: Range[];
  versions?: string[];
  ecosystem: string;
}

function coerceForCompare(v: string): string | null {
  const s = v
    .trim()
    .replace(/^[=^~]/, "")
    .replace(/^[<>]=?/, "")
    .replace(/^v/, "");
  const r = semver.validRange(v);
  if (r) {
    const min = semver.minVersion(r);
    if (min) return min.version;
  }
  const parsed = semver.coerce(s);
  return parsed ? parsed.version : null;
}

export function isAffected({ installedVersion, ranges, versions }: Args): boolean {
  const installed = coerceForCompare(installedVersion);
  if (!installed) return false;

  if (versions && versions.length > 0) {
    if (versions.includes(installedVersion) || versions.includes(installed)) return true;
  }

  for (const r of ranges) {
    if (r.type === "GIT") continue;
    const lo = r.introduced && r.introduced !== "0" ? coerceForCompare(r.introduced) : "0.0.0";
    const hi = r.fixed ? coerceForCompare(r.fixed) : null;
    if (!lo) continue;
    if (semver.lt(installed, lo)) continue;
    if (hi && semver.gte(installed, hi)) continue;
    return true;
  }
  return false;
}
