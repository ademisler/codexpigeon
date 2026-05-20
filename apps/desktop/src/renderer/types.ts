import type { CodexPigeonDesktopApi } from "../preload/preload";

declare global {
  interface Window {
    codexpigeon?: CodexPigeonDesktopApi;
  }
}

export type ThreadStatus =
  | { type: "notLoaded" }
  | { type: "idle" }
  | { type: "systemError" }
  | { type: "active"; activeFlags: string[] };

export type ThreadSummary = {
  id: string;
  name: string | null;
  preview: string;
  cwd: string;
  updatedAt: number;
  status: ThreadStatus;
  activity?: {
    kind: "running" | "idle";
    reason: string;
    lastSeenAt: number;
    detectionMode: string;
  };
};

export type InboxMessage = {
  id: string;
  createdAt: string;
  priority: "low" | "normal" | "high";
  scope: string;
  body: string;
};

export type OutboxReply = {
  id: string;
  to: string | null;
  createdAt: string | null;
  body: string;
};

export type Receipt = {
  id: string;
  messageId: string | null;
  seenAt: string | null;
  decision: string | null;
  actionStatus: string | null;
  summary: string | null;
  notes: string | null;
};

export type MessageAutomation = {
  id: string;
  status: "active" | "paused";
  body: string;
  priority: "low" | "normal" | "high";
  scope: string;
  intervalMs: number;
  createdAt: string;
  updatedAt: string;
  nextRunAt: string;
  lastSentAt: string | null;
  sentCount: number;
  sourceMessageId: string | null;
  allowWarnings: boolean;
};

export type MailboxSnapshot = {
  workspace: string;
  inbox: InboxMessage[];
  outbox: OutboxReply[];
  receipts: Receipt[];
  automations: MessageAutomation[];
  statuses: Record<string, string>;
  unreadMessageIds: string[];
};

export type Warning = {
  code: string;
  message: string;
};
