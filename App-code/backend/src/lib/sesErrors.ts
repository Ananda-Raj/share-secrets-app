/** True when SES refused the address itself, e.g. an unverified recipient while in the sandbox. */
export function isRecipientRejected(err: unknown): boolean {
  return (err as { name?: unknown } | null)?.name === "MessageRejected";
}
