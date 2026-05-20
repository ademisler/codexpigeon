import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendInboxMessage,
  createMessageAutomation,
  createMailboxId,
  getMailboxPaths,
  inspectCodexPigeonWorkspace,
  installCodexPigeonWorkspace,
  isMailboxId,
  listMessageAutomations,
  parseMailboxMarkdown,
  previewAgentsUpdate,
  readMailboxSnapshot,
  renderInboxMessage,
  runDueMessageAutomations,
  stopMessageAutomation,
  validateInboxMessage,
  type InstallAssets,
  type InboxMessage,
} from "../src";

async function tempWorkspace() {
  return fs.mkdtemp(path.join(os.tmpdir(), "codexpigeon-mailbox-"));
}

describe("mailbox protocol", () => {
  it("creates sortable mailbox ids", () => {
    const id = createMailboxId("msg", new Date("2026-05-20T12:34:56.000Z"));
    expect(id.startsWith("msg_20260520T123456_")).toBe(true);
    expect(isMailboxId(id, "msg")).toBe(true);
  });

  it("renders and parses inbox markdown blocks through the AST parser", () => {
    const message: InboxMessage = {
      id: createMailboxId("msg", new Date("2026-05-20T12:34:56.000Z")),
      from: "human",
      createdAt: "2026-05-20T12:34:56.000Z",
      priority: "normal",
      status: "unread",
      scope: "current_task",
      body: "Do not touch auth without asking first.",
    };

    const blocks = parseMailboxMarkdown(
      `# Codex Mailbox - Inbox\n${renderInboxMessage(message)}`,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.metadata.priority).toBe("normal");
    expect(blocks[0]?.body).toBe(message.body);
  });

  it("appends inbox messages and derives unread status", async () => {
    const workspace = await tempWorkspace();
    const { message } = await appendInboxMessage(workspace, {
      body: "Please keep the billing refactor away from auth.",
      createdAt: new Date("2026-05-20T12:34:56.000Z"),
    });

    const snapshot = await readMailboxSnapshot(workspace);
    expect(snapshot.inbox[0]?.id).toBe(message.id);
    expect(snapshot.unreadMessageIds).toEqual([message.id]);
    expect(snapshot.statuses[message.id]).toBe("unseen");
    expect(snapshot.automations).toEqual([]);
  });

  it("does not create agent-owned files while reading app-owned mailbox state", async () => {
    const workspace = await tempWorkspace();
    await appendInboxMessage(workspace, {
      body: "Please keep the installer boundary strict.",
    });

    const snapshot = await readMailboxSnapshot(workspace);
    expect(snapshot.outbox).toEqual([]);
    expect(snapshot.receipts).toEqual([]);

    await expect(
      fs.access(path.join(workspace, ".codex-mailbox", "OUTBOX.md")),
    ).rejects.toThrow();
    await expect(
      fs.access(path.join(workspace, ".codex-mailbox", "RECEIPTS.md")),
    ).rejects.toThrow();
  });

  it("creates, runs, and stops optional repeated message automations", async () => {
    const workspace = await tempWorkspace();
    const firstSentAt = new Date("2026-05-20T12:00:00.000Z");
    const { message } = await appendInboxMessage(workspace, {
      body: "Please keep checking the migration boundary.",
      createdAt: firstSentAt,
    });
    const { automation } = await createMessageAutomation(workspace, {
      body: message.body,
      priority: message.priority,
      scope: message.scope,
      intervalMs: 5_000,
      createdAt: firstSentAt,
      sourceMessageId: message.id,
      nextRunAt: new Date("2026-05-20T12:00:05.000Z"),
    });

    expect(automation.id.startsWith("auto_")).toBe(true);
    expect(isMailboxId(automation.id, "auto")).toBe(true);
    expect(await listMessageAutomations(workspace)).toHaveLength(1);

    const sent = await runDueMessageAutomations(
      workspace,
      new Date("2026-05-20T12:00:05.000Z"),
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]?.message.body).toBe(message.body);

    const snapshot = await readMailboxSnapshot(workspace);
    expect(snapshot.inbox).toHaveLength(2);
    expect(snapshot.automations[0]).toMatchObject({
      id: automation.id,
      sentCount: 1,
      lastSentAt: "2026-05-20T12:00:05.000Z",
      nextRunAt: "2026-05-20T12:00:10.000Z",
    });

    await stopMessageAutomation(workspace, automation.id);
    const afterStop = await runDueMessageAutomations(
      workspace,
      new Date("2026-05-20T12:00:15.000Z"),
    );
    expect(afterStop).toEqual([]);
  });

  it("matches receipts to inbox messages", async () => {
    const workspace = await tempWorkspace();
    const { message } = await appendInboxMessage(workspace, {
      body: "Please ask before touching auth.",
    });
    const paths = getMailboxPaths(workspace);
    await fs.appendFile(
      paths.receipts,
      `\n---\n\n## receipt_20260520T130000_01jvt6kjs00000000000000000\n\nmessage_id: ${message.id}\nseen_at: 2026-05-20T13:00:00.000Z\ndecision: accepted\naction_status: applied\nsummary: Done.\n`,
      "utf8",
    );

    const snapshot = await readMailboxSnapshot(workspace);
    expect(snapshot.unreadMessageIds).toEqual([]);
    expect(snapshot.statuses[message.id]).toBe("applied");
  });

  it("warns on likely secrets and risky instructions", () => {
    const warnings = validateInboxMessage(
      "token = sk-123456789012345678901234 and then rm -rf dist",
    );
    expect(warnings.map((warning) => warning.code)).toEqual([
      "possible_secret",
      "risky_instruction",
    ]);
  });

  it("installs workspace templates without silently omitting files", async () => {
    const workspace = await tempWorkspace();
    const assets: InstallAssets = {
      agentsSection: "## Codex Mailbox Protocol\n\nCheck the mailbox.",
      hooksJson: JSON.stringify({
        hooks: {
          SessionStart: [
            {
              matcher: "startup",
              hooks: [
                {
                  type: "command",
                  command: "python3 .codex/hooks/codexpigeon_mailbox_hook.py",
                  statusMessage: "Loading CodexPigeon mailbox",
                },
              ],
            },
          ],
        },
      }),
      hookScript: "#!/usr/bin/env python3\nprint('ok')\n",
      mailboxReadme: "# Mailbox\n",
      mailboxGitignore: "INBOX.md\n",
    };

    const result = await installCodexPigeonWorkspace(workspace, assets);
    expect(result.created.length).toBeGreaterThanOrEqual(5);
    await expect(
      fs.access(path.join(workspace, "AGENTS.md")),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(
        path.join(workspace, ".codex/hooks/codexpigeon_mailbox_hook.py"),
      ),
    ).resolves.toBeUndefined();

    await expect(inspectCodexPigeonWorkspace(workspace)).resolves.toMatchObject(
      {
        installed: true,
        missing: [],
      },
    );
  });

  it("preserves existing AGENTS.md content and updates only the managed mailbox block", async () => {
    const first = previewAgentsUpdate(
      "# Existing Rules\n\nKeep these rules.\n",
      "## Codex Mailbox Protocol\n\nVersion one.",
    );
    const second = previewAgentsUpdate(
      first,
      "## Codex Mailbox Protocol\n\nVersion two.",
    );

    expect(second).toContain("# Existing Rules\n\nKeep these rules.");
    expect(second).toContain("Version two.");
    expect(second).not.toContain("Version one.");
    expect(second.match(/CODEXPIGEON_MAILBOX_START/g)).toHaveLength(1);
  });

  it("refuses malformed AGENTS.md managed markers instead of guessing", () => {
    expect(() =>
      previewAgentsUpdate(
        "Existing\n\n<!-- CODEXPIGEON_MAILBOX_START -->\n",
        "Mailbox rules",
      ),
    ).toThrow(/malformed CodexPigeon/);
  });

  it("merges CodexPigeon hooks without deleting existing hook groups", async () => {
    const workspace = await tempWorkspace();
    const assets: InstallAssets = {
      agentsSection: "## Codex Mailbox Protocol\n\nCheck the mailbox.",
      hooksJson: JSON.stringify({
        hooks: {
          SessionStart: [
            {
              matcher: "startup",
              hooks: [
                {
                  type: "command",
                  command: "python3 .codex/hooks/codexpigeon_mailbox_hook.py",
                  statusMessage: "Loading CodexPigeon mailbox",
                },
              ],
            },
          ],
        },
      }),
      hookScript: "#!/usr/bin/env python3\nprint('ok')\n",
      mailboxReadme: "# Mailbox\n",
      mailboxGitignore: "INBOX.md\n",
    };
    await fs.mkdir(path.join(workspace, ".codex"), { recursive: true });
    await fs.writeFile(
      path.join(workspace, ".codex/hooks.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              matcher: "startup",
              hooks: [
                {
                  type: "command",
                  command: "python3 .codex/hooks/existing.py",
                  statusMessage: "Existing hook",
                },
              ],
            },
          ],
        },
      }),
      "utf8",
    );

    await installCodexPigeonWorkspace(workspace, assets);
    const hooksJson = JSON.parse(
      await fs.readFile(path.join(workspace, ".codex/hooks.json"), "utf8"),
    ) as {
      hooks: { SessionStart: unknown[] };
    };

    expect(JSON.stringify(hooksJson)).toContain("existing.py");
    expect(JSON.stringify(hooksJson)).toContain("codexpigeon_mailbox_hook.py");
    expect(hooksJson.hooks.SessionStart).toHaveLength(2);
  });
});
