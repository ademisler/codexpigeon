import { ulid } from "ulid";

export type MailboxIdKind = "msg" | "reply" | "receipt" | "auto";

export function formatMailboxTimestamp(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  const second = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hour}${minute}${second}`;
}

export function createMailboxId(
  kind: MailboxIdKind,
  date = new Date(),
): string {
  return `${kind}_${formatMailboxTimestamp(date)}_${ulid(date.getTime()).toLowerCase()}`;
}

export function isMailboxId(value: string, kind?: MailboxIdKind): boolean {
  const prefix = kind ? `${kind}_` : "(msg|reply|receipt|auto)_";
  return new RegExp(`^${prefix}\\d{8}T\\d{6}_[0-9a-hjkmnp-tv-z]{26}$`).test(
    value,
  );
}
