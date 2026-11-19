import { PutCommand, GetCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { docClient as client } from "./dynamoClient.js";
import { config } from "./config.js";
import type { SecretItem } from "../types.js";

export async function putSecret(item: SecretItem): Promise<void> {
  await client.send(
    new PutCommand({
      TableName: config.tableName,
      Item: item,
      ConditionExpression: "attribute_not_exists(id)", // guards against id collisions
    })
  );
}

export async function getSecret(id: string): Promise<SecretItem | undefined> {
  const res = await client.send(new GetCommand({ TableName: config.tableName, Key: { id } }));
  return res.Item as SecretItem | undefined;
}

export async function deleteSecret(id: string): Promise<void> {
  await client.send(new DeleteCommand({ TableName: config.tableName, Key: { id } }));
}

/**
 * Deletes only a secret that has already been claimed. Used by the client's explicit
 * "I successfully decrypted this" confirmation, so that anyone who merely has the link
 * (without having actually retrieved/decrypted it themselves) can't grief the real
 * recipient by burning it pre-emptively. A no-op (not an error) if nothing matches —
 * the caller only ever calls this after its own successful decrypt, so "already gone"
 * just means another tab/request beat it to the same confirmation.
 */
export async function confirmDelete(id: string): Promise<void> {
  try {
    await client.send(
      new DeleteCommand({
        TableName: config.tableName,
        Key: { id },
        ConditionExpression: "attribute_exists(claimedAt)",
      })
    );
  } catch (err) {
    if ((err as { name?: string })?.name !== "ConditionalCheckFailedException") throw err;
  }
}

export type RevokeSecretResult = "revoked" | "not_found" | "already_claimed";

/**
 * The sender's own "undo" for a mistaken send -- atomically deletes the secret, but only
 * if it hasn't been claimed yet, so a revoke can't race a legitimate in-progress claim
 * and grief the real recipient. Same attempt-then-diagnose shape as claimSecret/resendOtp:
 * a failed condition doesn't say which part failed, so a follow-up read distinguishes
 * "gone already" from "someone just claimed it" for a useful error message.
 */
export async function revokeSecret(id: string): Promise<RevokeSecretResult> {
  try {
    await client.send(
      new DeleteCommand({
        TableName: config.tableName,
        Key: { id },
        ConditionExpression: "attribute_exists(id) AND attribute_not_exists(claimedAt)",
      })
    );
    return "revoked";
  } catch (err) {
    if ((err as { name?: string })?.name !== "ConditionalCheckFailedException") throw err;
    const item = await getSecret(id);
    return item ? "already_claimed" : "not_found";
  }
}

export type ClaimResult = "claimed" | "in-grace" | "expired";

/**
 * Atomically claims a secret on first access instead of deleting it outright, so a
 * mistyped password/OTP (checked client-side, after this call) doesn't destroy the
 * secret before the real recipient succeeds. First caller "wins" the claim and gets
 * a short grace window to retry locally; a second, different claimant is rejected.
 */
export async function claimSecret(id: string, nowSeconds: number, graceSeconds: number): Promise<ClaimResult> {
  try {
    await client.send(
      new UpdateCommand({
        TableName: config.tableName,
        Key: { id },
        UpdateExpression: "SET claimedAt = :now, expiresAt = :graceExpiry",
        ConditionExpression: "attribute_not_exists(claimedAt)",
        ExpressionAttributeValues: {
          ":now": nowSeconds,
          ":graceExpiry": nowSeconds + graceSeconds,
        },
      })
    );
    return "claimed";
  } catch (err) {
    if ((err as { name?: string })?.name !== "ConditionalCheckFailedException") throw err;
    const item = await getSecret(id);
    if (!item || item.expiresAt < nowSeconds) return "expired";
    return "in-grace"; // same claimant retrying (e.g. a page refresh) within the window
  }
}

export type ResendResult = "sent" | "not_found" | "already_claimed" | "too_many_resends" | "cooldown";

/**
 * Atomically checks (not yet claimed, under the resend cap, past the cooldown) and
 * installs a fresh OTP in one conditional update, so two concurrent resend clicks can't
 * race past the cap/cooldown check. Same attempt-then-diagnose shape as claimSecret:
 * a failed condition doesn't say *which* part failed, so a follow-up read distinguishes
 * "already claimed" from "too many resends" from "too soon" for a useful error message.
 */
export async function resendOtp(
  id: string,
  nowSeconds: number,
  newOtpHash: string,
  newOtpSalt: string,
  otpExpiresAt: number,
  maxResends: number,
  cooldownSeconds: number
): Promise<ResendResult> {
  try {
    await client.send(
      new UpdateCommand({
        TableName: config.tableName,
        Key: { id },
        UpdateExpression:
          "SET otpHash = :hash, otpSalt = :salt, otpExpiresAt = :otpExp, otpAttempts = :zero, " +
          "otpResendCount = if_not_exists(otpResendCount, :zero) + :one, lastOtpSentAt = :now",
        ConditionExpression:
          "attribute_exists(id) AND attribute_not_exists(claimedAt) AND " +
          "(attribute_not_exists(otpResendCount) OR otpResendCount < :maxResends) AND " +
          "(attribute_not_exists(lastOtpSentAt) OR lastOtpSentAt < :cooldownCutoff)",
        ExpressionAttributeValues: {
          ":hash": newOtpHash,
          ":salt": newOtpSalt,
          ":otpExp": otpExpiresAt,
          ":zero": 0,
          ":one": 1,
          ":now": nowSeconds,
          ":maxResends": maxResends,
          ":cooldownCutoff": nowSeconds - cooldownSeconds,
        },
      })
    );
    return "sent";
  } catch (err) {
    if ((err as { name?: string })?.name !== "ConditionalCheckFailedException") throw err;
    const item = await getSecret(id);
    if (!item) return "not_found";
    if (item.claimedAt) return "already_claimed";
    if ((item.otpResendCount ?? 0) >= maxResends) return "too_many_resends";
    return "cooldown";
  }
}

export async function incrementOtpAttempts(id: string): Promise<number> {
  const res = await client.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { id },
      UpdateExpression: "SET otpAttempts = if_not_exists(otpAttempts, :zero) + :one",
      ExpressionAttributeValues: { ":zero": 0, ":one": 1 },
      ReturnValues: "UPDATED_NEW",
    })
  );
  return (res.Attributes?.otpAttempts as number) ?? 0;
}
