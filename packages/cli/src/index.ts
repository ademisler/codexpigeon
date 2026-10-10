#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { Command } from "commander";
import pc from "picocolors";
import {
  appendInboxMessage,
  createMessageAutomation,
  installCodexPigeonWorkspace,
  listMessageAutomations,
  readMailboxSnapshot,
  runDueMessageAutomations,
  stopMessageAutomation,
  validateInboxMessage,
  watchMailbox,
  type MessagePriority,
  type MessageScope,
} from "@codexpigeon/mailbox-core";
import { createCodexPigeonInstallAssets } from "@codexpigeon/hooks";

const program = new Command();

program
  .name("codexpigeon")
  .description("Non-interrupting mailbox companion for Codex worktrees")
  .version("0.1.0");

function parseDurationMs(value: string): number {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/i);
  if (!match) {
    throw new Error("Use a repeat duration like 5m, 1h, 30s, or 5000ms.");
  }
  const amount = Number(match[1]);
  const unit = (match[2] ?? "m").toLowerCase();
  const multiplier =
    unit === "h"
      ? 60 * 60 * 1000
      : unit === "m"
        ? 60 * 1000
        : unit === "s"
          ? 1000
          : 1;
  return Math.round(amount * multiplier);
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours}h`;
  }
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

program
  .command("send")
  .description("Append a human message to .codex-mailbox/INBOX.md")
  .requiredOption("-w, --workspace <path>", "repo or worktree path")
  .option("-p, --priority <priority>", "low, normal, or high", "normal")
  .option(
    "-s, --scope <scope>",
    "current_task, workspace, thread, or question",
    "current_task",
  )
  .option(
    "--repeat-every <duration>",
    "optionally resend this same message on an interval, e.g. 5m or 1h",
  )
  .option(
    "--allow-warnings",
    "send even when secret/risky warnings are detected",
  )
  .argument("<message...>", "message text")
  .action(
    async (
      messageParts: string[],
      options: {
        workspace: string;
        priority: string;
        scope: string;
        repeatEvery?: string;
        allowWarnings?: boolean;
      },
    ) => {
      const body = messageParts.join(" ").trim();
      if (!body) {
        throw new Error("Message is empty.");
      }
      const intervalMs = options.repeatEvery
        ? parseDurationMs(options.repeatEvery)
        : null;

      const warnings = validateInboxMessage(body);
      if (warnings.length > 0 && !options.allowWarnings) {
        for (const warning of warnings) {
          console.error(pc.yellow(`warning: ${warning.message}`));
        }
        console.error(pc.dim("Use --allow-warnings to send anyway."));
        process.exitCode = 1;
        return;
      }

      const { message } = await appendInboxMessage(
        options.workspace,
        {
          body,
          priority: options.priority as MessagePriority,
          scope: options.scope as MessageScope,
        },
        { allowWarnings: Boolean(options.allowWarnings) },
      );

      console.log(pc.green(`sent ${message.id}`));

      if (intervalMs !== null) {
        const { automation } = await createMessageAutomation(
          options.workspace,
          {
            body,
            priority: options.priority as MessagePriority,
            scope: options.scope as MessageScope,
            intervalMs,
            sourceMessageId: message.id,
            allowWarnings: Boolean(options.allowWarnings),
          },
        );
        console.log(
          pc.green(
            `scheduled ${automation.id} every ${formatDuration(intervalMs)}`,
          ),
        );
        console.log(
          pc.dim(
            "Run the desktop app or `codexpigeon automation run-due --workspace <path>` to dispatch due repeats.",
          ),
        );
      }
    },
  );

program
  .command("watch")
  .description("Watch mailbox files and print current status")
  .requiredOption("-w, --workspace <path>", "repo or worktree path")
  .option(
    "--run-automations",
    "also dispatch due repeated messages while watching",
  )
  .action(async (options: { workspace: string; runAutomations?: boolean }) => {
    let first = true;
    let automationTimer: NodeJS.Timeout | null = null;
    const stop = watchMailbox(options.workspace, (snapshot) => {
      if (!first) {
        console.log("");
      }
      first = false;
      console.log(pc.bold(`Mailbox: ${snapshot.workspace}`));
      console.log(
        `Inbox: ${snapshot.inbox.length} | Replies: ${snapshot.outbox.length} | Receipts: ${snapshot.receipts.length}`,
      );
      console.log(
        `Unread: ${snapshot.unreadMessageIds.length ? snapshot.unreadMessageIds.join(", ") : "none"}`,
      );
      const active = snapshot.automations.filter(
        (automation) => automation.status === "active",
      );
      console.log(`Automations: ${active.length} active`);
    });

    if (options.runAutomations) {
      automationTimer = setInterval(() => {
        void runDueMessageAutomations(options.workspace)
          .then((sent) => {
            for (const item of sent) {
              console.log(
                pc.dim(
                  `auto sent ${item.message.id} from ${item.automation.id}`,
                ),
              );
            }
          })
          .catch((error: unknown) => {
            const message =
              error instanceof Error ? error.message : String(error);
            console.error(pc.red(`automation failed: ${message}`));
          });
      }, 2000);
    }

    process.on("SIGINT", async () => {
      if (automationTimer) {
        clearInterval(automationTimer);
      }
      await stop();
      process.exit(0);
    });
  });

program
  .command("install")
  .description(
    "Install AGENTS.md, mailbox files, and Codex hooks into a workspace",
  )
  .requiredOption("-w, --workspace <path>", "repo or worktree path")
  .action(async (options: { workspace: string }) => {
    const result = await installCodexPigeonWorkspace(
      options.workspace,
      createCodexPigeonInstallAssets(),
    );
    console.log(pc.bold(`Installed CodexPigeon in ${result.workspace}`));
    console.log(pc.green(`created: ${result.created.length}`));
    console.log(pc.yellow(`updated: ${result.updated.length}`));
    console.log(pc.dim(`unchanged: ${result.unchanged.length}`));
  });

program
  .command("snapshot")
  .description("Print mailbox snapshot as JSON")
  .requiredOption("-w, --workspace <path>", "repo or worktree path")
  .action(async (options: { workspace: string }) => {
    const snapshot = await readMailboxSnapshot(options.workspace);
    console.log(JSON.stringify(snapshot, null, 2));
  });

const automation = program
  .command("automation")
  .description("List, stop, or dispatch optional repeated mailbox messages");

automation
  .command("list")
  .description("List repeated message automations")
  .requiredOption("-w, --workspace <path>", "repo or worktree path")
  .action(async (options: { workspace: string }) => {
    const automations = await listMessageAutomations(options.workspace);
    if (automations.length === 0) {
      console.log(pc.dim("no automations"));
      return;
    }

    for (const item of automations) {
      console.log(
        `${item.status === "active" ? pc.green("active") : pc.yellow("paused")} ${item.id}`,
      );
      console.log(
        pc.dim(
          `  every ${formatDuration(item.intervalMs)} | next ${item.nextRunAt} | sent ${item.sentCount}`,
        ),
      );
      console.log(`  ${item.body}`);
    }
  });

automation
  .command("stop")
  .description("Pause a repeated message automation")
  .requiredOption("-w, --workspace <path>", "repo or worktree path")
  .argument("<automation-id>", "automation id")
  .action(async (automationId: string, options: { workspace: string }) => {
    const stopped = await stopMessageAutomation(
      options.workspace,
      automationId,
    );
    console.log(pc.green(`paused ${stopped.id}`));
  });

automation
  .command("run-due")
  .description("Dispatch all currently due repeated messages once")
  .requiredOption("-w, --workspace <path>", "repo or worktree path")
  .action(async (options: { workspace: string }) => {
    const sent = await runDueMessageAutomations(options.workspace);
    if (sent.length === 0) {
      console.log(pc.dim("no due automations"));
      return;
    }
    for (const item of sent) {
      console.log(
        pc.green(`sent ${item.message.id} from ${item.automation.id}`),
      );
    }
  });

program
  .command("doctor")
  .description("Check local CodexPigeon prerequisites")
  .action(() => {
    const node = spawnSync("node", ["--version"], { encoding: "utf8" });
    const pnpm = spawnSync("pnpm", ["--version"], { encoding: "utf8" });
    const codex = spawnSync("codex", ["--version"], { encoding: "utf8" });
    const python = spawnSync("python3", ["--version"], { encoding: "utf8" });

    const rows = [
      ["node", node.status === 0, node.stdout.trim() || node.stderr.trim()],
      ["pnpm", pnpm.status === 0, pnpm.stdout.trim() || pnpm.stderr.trim()],
      ["codex", codex.status === 0, codex.stdout.trim() || codex.stderr.trim()],
      [
        "python3",
        python.status === 0,
        python.stdout.trim() || python.stderr.trim(),
      ],
    ] as const;

    for (const [name, ok, value] of rows) {
      console.log(
        `${ok ? pc.green("ok") : pc.red("missing")} ${name}${value ? pc.dim(` ${value}`) : ""}`,
      );
    }

    if (rows.some(([, ok]) => !ok)) {
      process.exitCode = 1;
    }
  });

const argv =
  process.argv[2] === "--"
    ? [
        process.argv[0] as string,
        process.argv[1] as string,
        ...process.argv.slice(3),
      ]
    : process.argv;

program.parseAsync(argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(pc.red(message));
  process.exitCode = 1;
});
