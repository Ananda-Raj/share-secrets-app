// Pure rules for changing someone's admin role, so they're unit-tested without AWS.

export type RoleChangeProblem = "cannot_change_self" | "last_admin";

/** Why this change isn't allowed, or null if it is. admins holds lowercased emails. */
export function roleChangeProblem(
  targetEmail: string,
  callerEmail: string,
  makeAdmin: boolean,
  admins: Set<string>
): RoleChangeProblem | null {
  const target = targetEmail.toLowerCase();
  if (target === callerEmail.toLowerCase()) return "cannot_change_self";
  if (!makeAdmin && admins.has(target) && admins.size <= 1) return "last_admin";
  return null;
}
