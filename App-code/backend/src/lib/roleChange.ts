import { setRole, type Role } from "./roles.js";
import { sendRoleChangeNotice } from "./ses.js";
import { getSettings } from "./settings.js";
import { log } from "./logger.js";

/** Applies a role change, then emails every admin and the person affected.
 * adminsBefore is the lowercased admin list from before the change. */
export async function changeRole(targetEmail: string, role: Role, changedBy: string, adminsBefore: Set<string>): Promise<void> {
  await setRole(targetEmail, role, changedBy);
  log("admin.role.changed", { target: targetEmail, role, changedBy });

  const { branding } = await getSettings();
  const recipients = new Set([...adminsBefore, targetEmail.toLowerCase()]);
  for (const to of recipients) {
    // A failed notice doesn't undo the change; the log above is the record.
    try {
      await sendRoleChangeNotice(to, targetEmail, role === "admin", changedBy, branding);
    } catch (err) {
      log("admin.role.notice.error", { error: String(err) });
    }
  }
}
