import type { MailboxSnapshot, MessageStatus, Receipt } from "./types";

export function deriveMessageStatus(receipt: Receipt | undefined): MessageStatus {
  if (!receipt) {
    return "unseen";
  }

  if (receipt.actionStatus && receipt.actionStatus !== "pending") {
    return receipt.actionStatus;
  }

  if (receipt.decision) {
    return receipt.decision;
  }

  return "seen";
}

export function enrichSnapshot(snapshot: Omit<MailboxSnapshot, "statuses" | "unreadMessageIds">): MailboxSnapshot {
  const receiptByMessageId = new Map<string, Receipt>();
  for (const receipt of snapshot.receipts) {
    if (receipt.messageId) {
      receiptByMessageId.set(receipt.messageId, receipt);
    }
  }

  const statuses: Record<string, MessageStatus> = {};
  const unreadMessageIds: string[] = [];

  for (const message of snapshot.inbox) {
    const status = deriveMessageStatus(receiptByMessageId.get(message.id));
    statuses[message.id] = status;
    if (status === "unseen") {
      unreadMessageIds.push(message.id);
    }
  }

  return {
    ...snapshot,
    statuses,
    unreadMessageIds
  };
}
