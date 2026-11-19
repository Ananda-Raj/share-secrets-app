import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "./dynamoClient.js";
import { config } from "./config.js";
import { withDefaults, type AppSettings, type Branding, type SharingPolicy, type Reports } from "./settingsSchema.js";

// One item holds every admin setting.
const SETTINGS_ID = "app";

export async function getSettings(): Promise<AppSettings> {
  const res = await docClient.send(new GetCommand({ TableName: config.settingsTableName, Key: { id: SETTINGS_ID } }));
  return withDefaults(res.Item as Parameters<typeof withDefaults>[0]);
}

/** Replaces whichever sections are given and keeps the rest. */
export async function saveSettings(
  changes: { branding?: Branding; policy?: SharingPolicy; reports?: Reports },
  updatedBy: string
): Promise<AppSettings> {
  const current = await getSettings();
  const next: AppSettings = {
    branding: changes.branding ?? current.branding,
    policy: changes.policy ?? current.policy,
    reports: changes.reports ?? current.reports,
  };
  await docClient.send(
    new PutCommand({
      TableName: config.settingsTableName,
      Item: { id: SETTINGS_ID, ...next, updatedBy, updatedAt: Math.floor(Date.now() / 1000) },
    })
  );
  return next;
}
