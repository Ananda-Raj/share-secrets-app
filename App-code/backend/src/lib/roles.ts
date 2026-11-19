import { GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "./dynamoClient.js";
import { config } from "./config.js";

export type Role = "admin" | "user";

export class ForbiddenError extends Error {}

/** Absence from the roles table means "user" — only admins get a row. */
export async function getRole(email: string): Promise<Role> {
  const res = await docClient.send(new GetCommand({ TableName: config.rolesTableName, Key: { email } }));
  return (res.Item?.role as Role | undefined) ?? "user";
}

/** Throws ForbiddenError unless the given email is an admin. */
export async function requireAdmin(email: string): Promise<void> {
  const role = await getRole(email);
  if (role !== "admin") throw new ForbiddenError("Admin access required");
}

/** All admin emails, lowercased -- for cross-referencing against another list (e.g. the
 * admin users list). Unpaginated, same reasoning as ensureFirstAdmin's scan below: this
 * table only ever holds a handful of admin rows plus the sentinel. */
export async function listAdminEmails(): Promise<Set<string>> {
  const res = await docClient.send(
    new ScanCommand({
      TableName: config.rolesTableName,
      FilterExpression: "#role = :admin",
      ExpressionAttributeNames: { "#role": "role" },
      ExpressionAttributeValues: { ":admin": "admin" },
    })
  );
  return new Set((res.Items ?? []).map((item) => (item.email as string).toLowerCase()));
}

const BOOTSTRAP_SENTINEL = "__bootstrap__";

/**
 * Called once per login (see handlers/getMe.ts): the first person to ever authenticate
 * on a fresh deployment becomes admin automatically. Race-safe via the sentinel row
 * below — only one concurrent claim can win a conditional PutItem, everyone else falls
 * through to "user". Existing deployments are unaffected: the admin-exists scan below
 * catches an admin row created by the old manual `dynamodb put-item` path too.
 */
export async function ensureFirstAdmin(email: string): Promise<Role> {
  const existing = await docClient.send(new GetCommand({ TableName: config.rolesTableName, Key: { email } }));
  if (existing.Item) return existing.Item.role as Role;

  // Unpaginated: this table only ever holds a handful of admin rows plus the sentinel.
  const adminScan = await docClient.send(
    new ScanCommand({
      TableName: config.rolesTableName,
      FilterExpression: "#role = :admin",
      ExpressionAttributeNames: { "#role": "role" },
      ExpressionAttributeValues: { ":admin": "admin" },
    })
  );
  if ((adminScan.Items?.length ?? 0) > 0) return "user"; // already bootstrapped

  try {
    await docClient.send(
      new PutCommand({
        TableName: config.rolesTableName,
        Item: { email: BOOTSTRAP_SENTINEL, claimedBy: email, claimedAt: Math.floor(Date.now() / 1000) },
        ConditionExpression: "attribute_not_exists(email)",
      })
    );
  } catch (err) {
    if ((err as { name?: string })?.name !== "ConditionalCheckFailedException") throw err;
    return "user"; // someone else won the race a moment ago
  }

  await docClient.send(new PutCommand({ TableName: config.rolesTableName, Item: { email, role: "admin" } }));
  return "admin";
}
