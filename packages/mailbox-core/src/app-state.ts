import fs from "node:fs/promises";
import path from "node:path";
import lockfile from "proper-lockfile";
import { z } from "zod";
import { createMailboxId } from "./ids";
import { getMailboxPaths } from "./paths";
import type {
  MailboxAppState,
  MessageAutomation,
  MessageAutomationInput,
  ValidationWarning,
} from "./types";
import { validateInboxMessage } from "./validate";

export const MIN_AUTOMATION_INTERVAL_MS = 5_000;

const automationSchema = z.object({
  id: z.string(),
  status: z.enum(["active", "paused"]),
  body: z.string(),
  priority: z.enum(["low", "normal", "high"]),
  scope: z.enum(["current_task", "workspace", "thread", "question"]),
  intervalMs: z.number().int().min(MIN_AUTOMATION_INTERVAL_MS),
  createdAt: z.string(),
  updatedAt: z.string(),
  nextRunAt: z.string(),
  lastSentAt: z.string().nullable(),
  sentCount: z.number().int().min(0),
  sourceMessageId: z.string().nullable(),
  allowWarnings: z.boolean(),
});

const stateSchema = z.object({
  version: z.literal(1),
  mode: z.literal("mailbox-only"),
  updatedAt: z.string(),
  automations: z.array(automationSchema).default([]),
});

function defaultState(now = new Date()): MailboxAppState {
  return {
    version: 1,
    mode: "mailbox-only",
    updatedAt: now.toISOString(),
    automations: [],
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureStateFile(workspace: string): Promise<string> {
  const paths = getMailboxPaths(workspace);
  await fs.mkdir(paths.mailboxDir, { recursive: true });
  if (!(await exists(paths.appState))) {
    await fs.writeFile(
      paths.appState,
      `${JSON.stringify(defaultState(), null, 2)}\n`,
      "utf8",
    );
  }
  return paths.appState;
}

function parseState(raw: string): MailboxAppState {
  if (!raw.trim()) {
    return defaultState();
  }

  const parsed = JSON.parse(raw) as unknown;
  const result = stateSchema.safeParse(parsed);
  if (result.success) {
    return result.data;
  }

  const record =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  const automations = Array.isArray(record.automations)
    ? record.automations.flatMap((item) => {
        const automation = automationSchema.safeParse(item);
        return automation.success ? [automation.data] : [];
      })
    : [];

  return {
    ...defaultState(),
    automations,
  };
}

async function readStateFile(filePath: string): Promise<MailboxAppState> {
  const raw = await fs.readFile(filePath, "utf8").catch(() => "");
  return parseState(raw);
}

async function writeStateFile(
  filePath: string,
  state: MailboxAppState,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await fs.rename(tmp, filePath);
}

async function withStateLock<T>(
  workspace: string,
  fn: (state: MailboxAppState) => Promise<{ state: MailboxAppState; value: T }>,
): Promise<T> {
  const statePath = await ensureStateFile(workspace);
  const release = await lockfile.lock(statePath, {
    retries: {
      retries: 8,
      factor: 1.4,
      minTimeout: 50,
      maxTimeout: 500,
    },
  });

  try {
    const current = await readStateFile(statePath);
    const { state, value } = await fn(current);
    await writeStateFile(statePath, {
      ...state,
      updatedAt: new Date().toISOString(),
    });
    return value;
  } finally {
    await release();
  }
}

export function normalizeAutomationIntervalMs(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("Automation interval must be a finite number.");
  }
  const intervalMs = Math.round(value);
  if (intervalMs < MIN_AUTOMATION_INTERVAL_MS) {
    throw new Error(
      `Automation interval must be at least ${MIN_AUTOMATION_INTERVAL_MS / 1000} seconds.`,
    );
  }
  return intervalMs;
}

export async function readMailboxAppState(
  workspace: string,
): Promise<MailboxAppState> {
  return readStateFile(await ensureStateFile(workspace));
}

export async function listMessageAutomations(
  workspace: string,
): Promise<MessageAutomation[]> {
  const state = await readMailboxAppState(workspace);
  return state.automations;
}

export async function createMessageAutomation(
  workspace: string,
  input: MessageAutomationInput,
): Promise<{
  automation: MessageAutomation;
  warnings: ValidationWarning[];
}> {
  const body = input.body.trim();
  const warnings = validateInboxMessage(body);

  if (warnings.some((warning) => warning.code === "message_too_large")) {
    throw new Error(warnings.map((warning) => warning.message).join("\n"));
  }

  if (warnings.length > 0 && !input.allowWarnings) {
    throw new Error(warnings.map((warning) => warning.message).join("\n"));
  }

  const createdAt = input.createdAt ?? new Date();
  const intervalMs = normalizeAutomationIntervalMs(input.intervalMs);
  const nextRunAt =
    input.nextRunAt ?? new Date(createdAt.getTime() + intervalMs);
  const automation: MessageAutomation = {
    id: createMailboxId("auto", createdAt),
    status: "active",
    body,
    priority: input.priority ?? "normal",
    scope: input.scope ?? "current_task",
    intervalMs,
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
    nextRunAt: nextRunAt.toISOString(),
    lastSentAt: null,
    sentCount: 0,
    sourceMessageId: input.sourceMessageId ?? null,
    allowWarnings: Boolean(input.allowWarnings),
  };

  await withStateLock(workspace, async (state) => ({
    state: {
      ...state,
      automations: [...state.automations, automation],
    },
    value: undefined,
  }));

  return { automation, warnings };
}

export async function stopMessageAutomation(
  workspace: string,
  automationId: string,
): Promise<MessageAutomation> {
  return withStateLock(workspace, async (state) => {
    let stopped: MessageAutomation | null = null;
    const now = new Date().toISOString();
    const automations = state.automations.map((automation) => {
      if (automation.id !== automationId) {
        return automation;
      }
      stopped = {
        ...automation,
        status: "paused",
        updatedAt: now,
      };
      return stopped;
    });

    if (!stopped) {
      throw new Error(`Automation '${automationId}' was not found.`);
    }

    return {
      state: {
        ...state,
        automations,
      },
      value: stopped,
    };
  });
}

export async function updateMessageAutomationAfterSend(
  workspace: string,
  automationId: string,
  sentAt: Date,
): Promise<MessageAutomation | null> {
  return withStateLock(workspace, async (state) => {
    let updated: MessageAutomation | null = null;
    const automations = state.automations.map((automation) => {
      if (automation.id !== automationId || automation.status !== "active") {
        return automation;
      }

      updated = {
        ...automation,
        lastSentAt: sentAt.toISOString(),
        sentCount: automation.sentCount + 1,
        updatedAt: sentAt.toISOString(),
        nextRunAt: new Date(
          sentAt.getTime() + automation.intervalMs,
        ).toISOString(),
      };
      return updated;
    });

    return {
      state: {
        ...state,
        automations,
      },
      value: updated,
    };
  });
}
