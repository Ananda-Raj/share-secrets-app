import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

// Shared across every table-specific lib (dynamo.ts for secrets, roles.ts, audit.ts) —
// one client per Lambda execution environment rather than one per table.
export const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
