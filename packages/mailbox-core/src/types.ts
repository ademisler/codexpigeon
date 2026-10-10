export type MailboxFile = "INBOX.md" | "OUTBOX.md" | "RECEIPTS.md";

export type MailboxPaths = {
  workspace: string;
  mailboxDir: string;
  inbox: string;
  outbox: string;
  receipts: string;
  appState: string;
  hookState: string;
  readme: string;
  gitignore: string;
};

export type MessagePriority = "low" | "normal" | "high";
export type MessageScope = "current_task" | "workspace" | "thread" | "question";
export type InboxStatus = "unread" | "cancelled";

export type ReceiptDecision =
  | "accepted"
  | "rejected"
  | "deferred"
  | "needs_confirmation";
export type ActionStatus = "applied" | "not_applicable" | "blocked" | "pending";

export type MailboxBlock = {
  id: string;
  metadata: Record<string, string>;
  body: string;
  rawBody: string;
};

export type InboxMessageInput = {
  body: string;
  priority?: MessagePriority;
  scope?: MessageScope;
  createdAt?: Date;
};

export type MessageAutomationStatus = "active" | "paused";

export type MessageAutomation = {
  id: string;
  status: MessageAutomationStatus;
  body: string;
  priority: MessagePriority;
  scope: MessageScope;
  intervalMs: number;
  createdAt: string;
  updatedAt: string;
  nextRunAt: string;
  lastSentAt: string | null;
  sentCount: number;
  sourceMessageId: string | null;
  allowWarnings: boolean;
};

export type MessageAutomationInput = {
  body: string;
  priority?: MessagePriority;
  scope?: MessageScope;
  intervalMs: number;
  createdAt?: Date;
  nextRunAt?: Date;
  sourceMessageId?: string | null;
  allowWarnings?: boolean;
};

export type MailboxAppState = {
  version: 1;
  mode: "mailbox-only";
  updatedAt: string;
  automations: MessageAutomation[];
};

export type InboxMessage = {
  id: string;
  from: "human";
  createdAt: string;
  priority: MessagePriority;
  status: InboxStatus;
  scope: MessageScope;
  body: string;
};

export type OutboxReply = {
  id: string;
  to: string | null;
  from: "agent";
  createdAt: string | null;
  body: string;
};

export type Receipt = {
  id: string;
  messageId: string | null;
  seenAt: string | null;
  decision: ReceiptDecision | null;
  actionStatus: ActionStatus | null;
  summary: string | null;
  notes: string | null;
};

export type MessageStatus = "unseen" | "seen" | ReceiptDecision | ActionStatus;

export type MailboxSnapshot = {
  workspace: string;
  inbox: InboxMessage[];
  outbox: OutboxReply[];
  receipts: Receipt[];
  automations: MessageAutomation[];
  statuses: Record<string, MessageStatus>;
  unreadMessageIds: string[];
};

export type ValidationWarning = {
  code: "message_too_large" | "possible_secret" | "risky_instruction";
  message: string;
};

export type InstallAssets = {
  agentsSection: string;
  hooksJson: string;
  hookScript: string;
  mailboxReadme: string;
  mailboxGitignore: string;
};

export type InstallResult = {
  workspace: string;
  created: string[];
  updated: string[];
  unchanged: string[];
};

export type WorkspaceInstallStatus = {
  workspace: string;
  installed: boolean;
  agents: {
    exists: boolean;
    managedBlock: boolean;
    malformedManagedBlock: boolean;
  };
  hooks: {
    hooksJsonExists: boolean;
    codexPigeonHook: boolean;
    hookScriptExists: boolean;
  };
  mailbox: {
    directoryExists: boolean;
    readmeExists: boolean;
    gitignoreExists: boolean;
    inboxExists: boolean;
    outboxExists: boolean;
    receiptsExists: boolean;
    stateExists: boolean;
  };
  missing: string[];
  warnings: string[];
};
