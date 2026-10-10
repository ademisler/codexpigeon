import { unified } from "unified";
import remarkParse from "remark-parse";
import { toString } from "mdast-util-to-string";
import type { InboxMessage, MailboxBlock, OutboxReply, Receipt } from "./types";

type MdNode = {
  type: string;
  depth?: number;
  children?: MdNode[];
  position?: {
    start: { line: number };
    end: { line: number };
  };
};

export const INBOX_HEADER = `# Codex Mailbox - Inbox

Only the human companion app writes to this file.
The agent must not edit this file.

---`;

export const OUTBOX_HEADER = `# Codex Mailbox - Outbox

Only the agent writes to this file.

---`;

export const RECEIPTS_HEADER = `# Codex Mailbox - Receipts

Only the agent writes to this file.

---`;

export function parseMailboxMarkdown(content: string): MailboxBlock[] {
  const tree = unified().use(remarkParse).parse(content) as MdNode;
  const lines = content.split(/\r?\n/);
  const headings = (tree.children ?? []).filter(
    (node) => node.type === "heading" && node.depth === 2 && node.position
  );

  return headings.map((heading, index) => {
    const next = headings[index + 1];
    const id = toString(heading as never).trim();
    const startLine = heading.position?.end.line ?? 1;
    const endLine = (next?.position?.start.line ?? lines.length + 1) - 1;
    const rawBody = lines.slice(startLine, endLine).join("\n").trim();
    const { metadata, body } = splitMetadataAndBody(rawBody);

    return { id, metadata, body, rawBody };
  });
}

export function splitMetadataAndBody(rawBody: string): {
  metadata: Record<string, string>;
  body: string;
} {
  const lines = rawBody.split(/\r?\n/);
  const metadata: Record<string, string> = {};
  let bodyStart = 0;
  let sawMetadata = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      if (sawMetadata) {
        bodyStart = i + 1;
      }
      continue;
    }

    const metadataMatch = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(trimmed);
    if (metadataMatch) {
      sawMetadata = true;
      metadata[metadataMatch[1] as string] = metadataMatch[2] ?? "";
      bodyStart = i + 1;
      continue;
    }

    if (/^(Mesaj|Message):$/i.test(trimmed)) {
      bodyStart = i + 1;
      break;
    }

    bodyStart = i;
    break;
  }

  return {
    metadata,
    body: lines.slice(bodyStart).join("\n").trim()
  };
}

export function renderMetadata(metadata: Record<string, string | null | undefined>): string {
  return Object.entries(metadata)
    .filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== null)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

export function renderInboxMessage(message: InboxMessage): string {
  return [
    "",
    "---",
    "",
    `## ${message.id}`,
    "",
    renderMetadata({
      from: message.from,
      created_at: message.createdAt,
      priority: message.priority,
      status: message.status,
      scope: message.scope
    }),
    "",
    "Mesaj:",
    message.body.trim(),
    ""
  ].join("\n");
}

export function blockToInboxMessage(block: MailboxBlock): InboxMessage {
  return {
    id: block.id,
    from: "human",
    createdAt: block.metadata.created_at ?? "",
    priority: (block.metadata.priority as InboxMessage["priority"]) || "normal",
    status: (block.metadata.status as InboxMessage["status"]) || "unread",
    scope: (block.metadata.scope as InboxMessage["scope"]) || "current_task",
    body: block.body
  };
}

export function blockToOutboxReply(block: MailboxBlock): OutboxReply {
  return {
    id: block.id,
    from: "agent",
    to: block.metadata.to || null,
    createdAt: block.metadata.created_at || null,
    body: block.body
  };
}

export function blockToReceipt(block: MailboxBlock): Receipt {
  return {
    id: block.id,
    messageId: block.metadata.message_id || null,
    seenAt: block.metadata.seen_at || null,
    decision: (block.metadata.decision as Receipt["decision"]) || null,
    actionStatus: (block.metadata.action_status as Receipt["actionStatus"]) || null,
    summary: block.metadata.summary || null,
    notes: block.metadata.notes || null
  };
}
