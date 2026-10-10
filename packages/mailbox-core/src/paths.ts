import path from "node:path";
import { fileURLToPath } from "node:url";
import type { MailboxPaths } from "./types";

export function normalizeWorkspace(workspace: string): string {
  return path.resolve(workspace);
}

export function getMailboxPaths(workspace: string): MailboxPaths {
  const normalized = normalizeWorkspace(workspace);
  const mailboxDir = path.join(normalized, ".codex-mailbox");

  return {
    workspace: normalized,
    mailboxDir,
    inbox: path.join(mailboxDir, "INBOX.md"),
    outbox: path.join(mailboxDir, "OUTBOX.md"),
    receipts: path.join(mailboxDir, "RECEIPTS.md"),
    appState: path.join(mailboxDir, "STATE.json"),
    hookState: path.join(mailboxDir, "HOOK_STATE.json"),
    readme: path.join(mailboxDir, "README.md"),
    gitignore: path.join(mailboxDir, ".gitignore")
  };
}

export function packageRootFromImportMeta(importMetaUrl: string): string {
  return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), "..");
}
