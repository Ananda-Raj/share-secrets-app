import { PutCommand, GetCommand, UpdateCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "./dynamoClient.js";
import { config } from "./config.js";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * The durable record of a share: survives the secret's own burn-after-read (the secrets
 * table still hard-deletes on confirm, unchanged). Never holds ciphertext, a password,
 * or an OTP — see logger.ts, which already redacts every field here from log output.
 *
 * Written by createSecret.ts (creation), updated by verifyOtp.ts (markClaimed) and
 * confirmBurn.ts (markConfirmed).
 */
export interface AuditRecord {
  secretId: string;
  senderEmail: string;
  recipientEmail: string;
  description: string;
  mode: "email-otp";
  isFile: boolean; // metadata only, same as description -- never the filename or content
  createdAt: number; // epoch seconds
  // The underlying secret's own share-link TTL (chosen at creation) -- separate from
  // this audit record's own expiresAt below. Lets History/Admin tell "still live" apart
  // from "expired unopened", which claimedAt/confirmedAt/revokedAt alone can't do.
  secretExpiresAt: number; // epoch seconds
  claimedAt?: number; // epoch seconds — set once, first successful OTP verification
  confirmedAt?: number; // epoch seconds — set on explicit post-decrypt confirmation
  revokedAt?: number; // epoch seconds — sender cancelled it before it was ever claimed
  notifyOnOpen?: boolean; // email the sender on first open
  expiresAt: number; // epoch seconds, DynamoDB TTL attribute — createdAt + 1 year
}

export async function getAuditRecord(secretId: string): Promise<AuditRecord | undefined> {
  const res = await docClient.send(new GetCommand({ TableName: config.auditTableName, Key: { secretId } }));
  return res.Item as AuditRecord | undefined;
}

export async function createAuditRecord(record: Omit<AuditRecord, "expiresAt">): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: config.auditTableName,
      Item: { ...record, expiresAt: record.createdAt + ONE_YEAR_SECONDS },
    })
  );
}

/** if_not_exists so a page refresh replaying the claim step doesn't overwrite the
 * original claim time with a later one. */
export async function markClaimed(secretId: string, claimedAt: number): Promise<AuditRecord | undefined> {
  const res = await docClient.send(
    new UpdateCommand({
      TableName: config.auditTableName,
      Key: { secretId },
      UpdateExpression: "SET claimedAt = if_not_exists(claimedAt, :claimedAt)",
      ExpressionAttributeValues: { ":claimedAt": claimedAt },
      ReturnValues: "ALL_NEW",
    })
  );
  return res.Attributes as AuditRecord | undefined;
}

export async function markConfirmed(secretId: string, confirmedAt: number): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: config.auditTableName,
      Key: { secretId },
      UpdateExpression: "SET confirmedAt = :confirmedAt",
      ExpressionAttributeValues: { ":confirmedAt": confirmedAt },
    })
  );
}

export async function markRevoked(secretId: string, revokedAt: number): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: config.auditTableName,
      Key: { secretId },
      UpdateExpression: "SET revokedAt = :revokedAt",
      ExpressionAttributeValues: { ":revokedAt": revokedAt },
    })
  );
}

/** "My history" — via the sender-index GSI, newest first. No scan needed. */
export async function getHistoryForSender(senderEmail: string): Promise<AuditRecord[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: config.auditTableName,
      IndexName: "sender-index",
      KeyConditionExpression: "senderEmail = :senderEmail",
      ExpressionAttributeValues: { ":senderEmail": senderEmail },
      ScanIndexForward: false,
    })
  );
  return (res.Items as AuditRecord[] | undefined) ?? [];
}

/**
 * Admin-only: every record in a date range, across all senders. A bounded Scan +
 * FilterExpression rather than a second data model of running counters — reasonable at
 * this volume (an internal company tool), and only worth revisiting with evidence that
 * it's actually slow, not upfront.
 */
export async function scanAuditRange(fromEpoch: number, toEpoch: number): Promise<AuditRecord[]> {
  const items: AuditRecord[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new ScanCommand({
        TableName: config.auditTableName,
        FilterExpression: "createdAt BETWEEN :from AND :to",
        ExpressionAttributeValues: { ":from": fromEpoch, ":to": toEpoch },
        ExclusiveStartKey: lastKey,
      })
    );
    items.push(...((res.Items as AuditRecord[] | undefined) ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}
