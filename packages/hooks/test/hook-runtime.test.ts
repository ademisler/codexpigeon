import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAILBOX_HOOK_SCRIPT } from "../src";

async function writeHookWorkspace() {
  const workspace = await fs.mkdtemp(
    path.join(os.tmpdir(), "codexpigeon-hook-"),
  );
  const script = path.join(workspace, "hook.py");
  await fs.writeFile(script, MAILBOX_HOOK_SCRIPT, "utf8");
  await fs.mkdir(path.join(workspace, ".codex-mailbox"), { recursive: true });
  await fs.writeFile(
    path.join(workspace, ".codex-mailbox", "INBOX.md"),
    "# Codex Mailbox - Inbox\n\n---\n\n## msg_20260520T120000_01jvt6kjs00000000000000000\n\nfrom: human\ncreated_at: 2026-05-20T12:00:00.000Z\npriority: normal\nstatus: unread\nscope: current_task\n\nMesaj:\nCheck this before final.\n",
    "utf8",
  );
  return { workspace, script };
}

describe("hook runtime", () => {
  it("adds SessionStart developer context", async () => {
    const { workspace, script } = await writeHookWorkspace();
    const result = spawnSync("python3", [script], {
      input: JSON.stringify({
        hook_event_name: "SessionStart",
        cwd: workspace,
      }),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(output.hookSpecificOutput.additionalContext).toContain(
      "CodexPigeon mailbox",
    );
  });

  it("blocks Stop once when unread messages exist", async () => {
    const { workspace, script } = await writeHookWorkspace();
    const result = spawnSync("python3", [script], {
      input: JSON.stringify({
        hook_event_name: "Stop",
        cwd: workspace,
        stop_hook_active: false,
      }),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.decision).toBe("block");
    expect(output.reason).toContain("Before finalizing");
  });

  it("does not create the app-owned inbox file", async () => {
    const workspace = await fs.mkdtemp(
      path.join(os.tmpdir(), "codexpigeon-hook-empty-"),
    );
    const script = path.join(workspace, "hook.py");
    await fs.writeFile(script, MAILBOX_HOOK_SCRIPT, "utf8");

    const result = spawnSync("python3", [script], {
      input: JSON.stringify({
        hook_event_name: "SessionStart",
        cwd: workspace,
      }),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    await expect(
      fs.access(path.join(workspace, ".codex-mailbox", "INBOX.md")),
    ).rejects.toThrow();
    await expect(
      fs.access(path.join(workspace, ".codex-mailbox", "OUTBOX.md")),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(workspace, ".codex-mailbox", "RECEIPTS.md")),
    ).resolves.toBeUndefined();
  });
});
