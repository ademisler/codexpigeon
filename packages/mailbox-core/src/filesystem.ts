import fs from "node:fs/promises";
import path from "node:path";
import lockfile from "proper-lockfile";
import chokidar from "chokidar";
import { createMailboxId } from "./ids";
import {
  blockToInboxMessage,
  blockToOutboxReply,
  blockToReceipt,
  INBOX_HEADER,
  OUTBOX_HEADER,
  parseMailboxMarkdown,
  RECEIPTS_HEADER,
  renderInboxMessage,
} from "./markdown";
import { getMailboxPaths } from "./paths";
import { readMailboxAppState } from "./app-state";
import { enrichSnapshot } from "./state";
import type {
  InboxMessage,
  InboxMessageInput,
  MailboxPaths,
  MailboxSnapshot,
} from "./types";
import { validateInboxMessage } from "./validate";

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeIfMissing(
  filePath: string,
  content: string,
): Promise<boolean> {
  if (await exists(filePath)) {
    return false;
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
  return true;
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, filePath);
}

async function withFileLock<T>(
  filePath: string,
  fn: () => Promise<T>,
): Promise<T> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  if (!(await exists(filePath))) {
    await fs.writeFile(filePath, "", "utf8");
  }
  const release = await lockfile.lock(filePath, {
    retries: {
      retries: 8,
      factor: 1.4,
      minTimeout: 50,
      maxTimeout: 500,
    },
  });

  try {
    return await fn();
  } finally {
    await release();
  }
}

export async function ensureMailbox(workspace: string): Promise<MailboxPaths> {
  const paths = getMailboxPaths(workspace);
  await fs.mkdir(paths.mailboxDir, { recursive: true });
  await writeIfMissing(paths.inbox, `${INBOX_HEADER}\n`);
  await writeIfMissing(
    paths.appState,
    `${JSON.stringify({ version: 1, mode: "mailbox-only", updatedAt: new Date().toISOString(), automations: [] }, null, 2)}\n`,
  );
  return paths;
}

async function readMailboxFileOrHeader(
  filePath: string,
  header: string,
): Promise<string> {
  if (await exists(filePath)) {
    return fs.readFile(filePath, "utf8");
  }
  return `${header}\n`;
}

export async function appendInboxMessage(
  workspace: string,
  input: InboxMessageInput,
  options: { allowWarnings?: boolean } = {},
): Promise<{
  message: InboxMessage;
  warnings: ReturnType<typeof validateInboxMessage>;
}> {
  const body = input.body.trim();
  const warnings = validateInboxMessage(body);

  if (warnings.some((warning) => warning.code === "message_too_large")) {
    throw new Error(warnings.map((warning) => warning.message).join("\n"));
  }

  if (warnings.length > 0 && !options.allowWarnings) {
    throw new Error(warnings.map((warning) => warning.message).join("\n"));
  }

  const paths = await ensureMailbox(workspace);
  const createdAt = input.createdAt ?? new Date();
  const message: InboxMessage = {
    id: createMailboxId("msg", createdAt),
    from: "human",
    createdAt: createdAt.toISOString(),
    priority: input.priority ?? "normal",
    status: "unread",
    scope: input.scope ?? "current_task",
    body,
  };

  await withFileLock(paths.inbox, async () => {
    await fs.appendFile(paths.inbox, renderInboxMessage(message), "utf8");
  });

  return { message, warnings };
}

export async function readMailboxSnapshot(
  workspace: string,
): Promise<MailboxSnapshot> {
  const paths = await ensureMailbox(workspace);
  const [inboxRaw, outboxRaw, receiptsRaw] = await Promise.all([
    fs.readFile(paths.inbox, "utf8"),
    readMailboxFileOrHeader(paths.outbox, OUTBOX_HEADER),
    readMailboxFileOrHeader(paths.receipts, RECEIPTS_HEADER),
  ]);
  const appState = await readMailboxAppState(paths.workspace);

  return enrichSnapshot({
    workspace: paths.workspace,
    inbox: parseMailboxMarkdown(inboxRaw).map(blockToInboxMessage),
    outbox: parseMailboxMarkdown(outboxRaw).map(blockToOutboxReply),
    receipts: parseMailboxMarkdown(receiptsRaw).map(blockToReceipt),
    automations: appState.automations,
  });
}

export async function overwriteFileIfChanged(
  filePath: string,
  content: string,
): Promise<"created" | "updated" | "unchanged"> {
  if (!(await exists(filePath))) {
    await atomicWrite(filePath, content);
    return "created";
  }

  const previous = await fs.readFile(filePath, "utf8");
  if (previous === content) {
    return "unchanged";
  }

  await atomicWrite(filePath, content);
  return "updated";
}

export function watchMailbox(
  workspace: string,
  onChange: (snapshot: MailboxSnapshot) => void | Promise<void>,
): () => Promise<void> {
  const paths = getMailboxPaths(workspace);
  const watcher = chokidar.watch([paths.inbox, paths.outbox, paths.receipts], {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 25 },
  });

  const refresh = async () => {
    onChange(await readMailboxSnapshot(workspace));
  };

  void ensureMailbox(workspace)
    .then(refresh)
    .catch(() => undefined);
  watcher.on("add", refresh);
  watcher.on("change", refresh);

  return async () => {
    await watcher.close();
  };
}
