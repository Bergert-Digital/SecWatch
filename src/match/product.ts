interface Args {
  installedName: string;
  installedVersion: string | null;
  affectedName: string;
  affectedVersions?: string[];
}

/**
 * Name-based matching for container images and self-hosted services.
 *
 * Neither KEV nor a release-notes feed gives machine-readable version ranges, so
 * there is no semver comparison to do here: the feeds tell us "this product is
 * affected", optionally with an explicit version list. When we cannot tell (no
 * version list, or a floating image tag), we report and let triage decide.
 */
export function isProductAffected({
  installedName,
  installedVersion,
  affectedName,
  affectedVersions,
}: Args): boolean {
  if (installedName !== affectedName) return false;
  if (!affectedVersions || affectedVersions.length === 0) return true;
  if (installedVersion === null) return true;
  return affectedVersions.includes(installedVersion);
}
