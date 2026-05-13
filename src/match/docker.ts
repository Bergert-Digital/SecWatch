interface Args {
  installedName: string;
  installedVersion: string;
  affectedName: string;
  affectedVersions: string[];
}

export function isDockerAffected({
  installedName,
  installedVersion,
  affectedName,
  affectedVersions,
}: Args): boolean {
  if (installedName !== affectedName) return false;
  if (affectedVersions.length === 0) return true;
  return affectedVersions.includes(installedVersion);
}
