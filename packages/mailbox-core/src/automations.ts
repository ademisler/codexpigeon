import { appendInboxMessage } from "./filesystem";
import {
  listMessageAutomations,
  updateMessageAutomationAfterSend,
} from "./app-state";
import type { InboxMessage, MessageAutomation } from "./types";

export type RunDueMessageAutomationsResult = {
  automation: MessageAutomation;
  message: InboxMessage;
};

export async function runDueMessageAutomations(
  workspace: string,
  now = new Date(),
  options: { limit?: number } = {},
): Promise<RunDueMessageAutomationsResult[]> {
  const limit = options.limit ?? 10;
  const automations = await listMessageAutomations(workspace);
  const due = automations
    .filter(
      (automation) =>
        automation.status === "active" &&
        new Date(automation.nextRunAt).getTime() <= now.getTime(),
    )
    .slice(0, limit);

  const sent: RunDueMessageAutomationsResult[] = [];

  for (const automation of due) {
    const { message } = await appendInboxMessage(
      workspace,
      {
        body: automation.body,
        priority: automation.priority,
        scope: automation.scope,
        createdAt: now,
      },
      { allowWarnings: automation.allowWarnings },
    );
    const updated = await updateMessageAutomationAfterSend(
      workspace,
      automation.id,
      now,
    );

    if (updated) {
      sent.push({ automation: updated, message });
    }
  }

  return sent;
}
