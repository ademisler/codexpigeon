import fs from "node:fs/promises";
import path from "node:path";
import { ensureMailbox, overwriteFileIfChanged } from "./filesystem";
import { getMailboxPaths } from "./paths";
import type {
  InstallAssets,
  InstallResult,
  WorkspaceInstallStatus,
} from "./types";

const AGENTS_START = "<!-- CODEXPIGEON_MAILBOX_START -->";
const AGENTS_END = "<!-- CODEXPIGEON_MAILBOX_END -->";
const CODEXPIGEON_HOOK_SCRIPT = "codexpigeon_mailbox_hook.py";

function wrapAgentsSection(section: string): string {
  return `${AGENTS_START}\n${section.trim()}\n${AGENTS_END}`;
}

function inspectAgentsMarkers(content: string): {
  managedBlock: boolean;
  malformedManagedBlock: boolean;
} {
  const start = content.indexOf(AGENTS_START);
  const end = content.indexOf(AGENTS_END);
  return {
    managedBlock: start !== -1 && end !== -1 && end > start,
    malformedManagedBlock:
      (start === -1) !== (end === -1) || (start !== -1 && end <= start),
  };
}

function upsertSection(original: string, section: string): string {
  const wrapped = wrapAgentsSection(section);
  const start = original.indexOf(AGENTS_START);
  const end = original.indexOf(AGENTS_END);
  const markerState = inspectAgentsMarkers(original);

  if (markerState.malformedManagedBlock) {
    throw new Error(
      "AGENTS.md contains a malformed CodexPigeon managed block. Refusing to update it automatically.",
    );
  }

  if (markerState.managedBlock) {
    const before = original.slice(0, start).trimEnd();
    const after = original.slice(end + AGENTS_END.length).trimStart();
    return `${before}\n\n${wrapped}\n${after ? `\n${after}` : ""}`;
  }

  return `${original.trimEnd()}${original.trim() ? "\n\n" : ""}${wrapped}\n`;
}

function record(
  result: InstallResult,
  status: "created" | "updated" | "unchanged",
  filePath: string,
) {
  result[status].push(filePath);
}

export function previewAgentsUpdate(
  currentContent: string,
  agentsSection: string,
): string {
  return upsertSection(currentContent, agentsSection);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hookGroupBelongsToCodexPigeon(group: unknown): boolean {
  const record = asRecord(group);
  const hooks = Array.isArray(record.hooks) ? record.hooks : [];
  return hooks.some((hook) => {
    const hookRecord = asRecord(hook);
    return (
      String(hookRecord.command ?? "").includes(CODEXPIGEON_HOOK_SCRIPT) ||
      String(hookRecord.statusMessage ?? "").includes("CodexPigeon")
    );
  });
}

function parseJsonObject(
  content: string,
  fileName: string,
): Record<string, unknown> {
  try {
    return asRecord(JSON.parse(content));
  } catch (error) {
    throw new Error(
      `${fileName} is not valid JSON. Refusing to overwrite it automatically. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function mergeHooksJson(
  currentContent: string,
  codexPigeonHooksJson: string,
): string {
  const current = currentContent.trim()
    ? parseJsonObject(currentContent, ".codex/hooks.json")
    : {};
  const codexPigeon = parseJsonObject(
    codexPigeonHooksJson,
    "CodexPigeon hooks template",
  );
  const currentHooks = asRecord(current.hooks);
  const codexPigeonHooks = asRecord(codexPigeon.hooks);
  const nextHooks: Record<string, unknown> = { ...currentHooks };

  for (const [eventName, groups] of Object.entries(codexPigeonHooks)) {
    if (!Array.isArray(groups)) {
      throw new Error(
        `CodexPigeon hooks template has invalid '${eventName}' hooks.`,
      );
    }

    const existing = nextHooks[eventName];
    if (existing !== undefined && !Array.isArray(existing)) {
      throw new Error(
        `.codex/hooks.json has invalid '${eventName}' hooks. Refusing to overwrite it automatically.`,
      );
    }

    const existingGroups = Array.isArray(existing) ? existing : [];
    nextHooks[eventName] = [
      ...existingGroups.filter(
        (group) => !hookGroupBelongsToCodexPigeon(group),
      ),
      ...groups,
    ];
  }

  return `${JSON.stringify({ ...current, hooks: nextHooks }, null, 2)}\n`;
}

export async function inspectCodexPigeonWorkspace(
  workspace: string,
): Promise<WorkspaceInstallStatus> {
  const paths = getMailboxPaths(workspace);
  const agentsPath = path.join(paths.workspace, "AGENTS.md");
  const hooksJsonPath = path.join(paths.workspace, ".codex", "hooks.json");
  const hookScriptPath = path.join(
    paths.workspace,
    ".codex",
    "hooks",
    CODEXPIGEON_HOOK_SCRIPT,
  );

  const [
    agentsExists,
    hooksJsonExists,
    hookScriptExists,
    directoryExists,
    readmeExists,
    gitignoreExists,
    inboxExists,
    outboxExists,
    receiptsExists,
    stateExists,
  ] = await Promise.all([
    fileExists(agentsPath),
    fileExists(hooksJsonPath),
    fileExists(hookScriptPath),
    fileExists(paths.mailboxDir),
    fileExists(paths.readme),
    fileExists(paths.gitignore),
    fileExists(paths.inbox),
    fileExists(paths.outbox),
    fileExists(paths.receipts),
    fileExists(paths.appState),
  ]);

  const agentsContent = agentsExists
    ? await fs.readFile(agentsPath, "utf8").catch(() => "")
    : "";
  const agents = {
    exists: agentsExists,
    ...inspectAgentsMarkers(agentsContent),
  };

  const warnings: string[] = [];
  let codexPigeonHook = false;
  if (hooksJsonExists) {
    const hooksContent = await fs
      .readFile(hooksJsonPath, "utf8")
      .catch(() => "");
    try {
      codexPigeonHook = JSON.stringify(
        parseJsonObject(hooksContent, ".codex/hooks.json"),
      ).includes(CODEXPIGEON_HOOK_SCRIPT);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (agents.malformedManagedBlock) {
    warnings.push("AGENTS.md has malformed CodexPigeon managed markers.");
  }

  const missing: string[] = [];
  if (!agents.managedBlock) missing.push("AGENTS.md CodexPigeon block");
  if (!hooksJsonExists) missing.push(".codex/hooks.json");
  if (!codexPigeonHook) missing.push(".codex/hooks.json CodexPigeon hook");
  if (!hookScriptExists) {
    missing.push(`.codex/hooks/${CODEXPIGEON_HOOK_SCRIPT}`);
  }
  if (!directoryExists) missing.push(".codex-mailbox/");
  if (!readmeExists) missing.push(".codex-mailbox/README.md");
  if (!gitignoreExists) missing.push(".codex-mailbox/.gitignore");
  if (!inboxExists) missing.push(".codex-mailbox/INBOX.md");
  if (!stateExists) missing.push(".codex-mailbox/STATE.json");

  return {
    workspace: paths.workspace,
    installed:
      agents.managedBlock &&
      !agents.malformedManagedBlock &&
      hooksJsonExists &&
      codexPigeonHook &&
      hookScriptExists &&
      directoryExists &&
      readmeExists &&
      gitignoreExists &&
      inboxExists &&
      stateExists,
    agents,
    hooks: {
      hooksJsonExists,
      codexPigeonHook,
      hookScriptExists,
    },
    mailbox: {
      directoryExists,
      readmeExists,
      gitignoreExists,
      inboxExists,
      outboxExists,
      receiptsExists,
      stateExists,
    },
    missing,
    warnings,
  };
}

export async function installCodexPigeonWorkspace(
  workspace: string,
  assets: InstallAssets,
): Promise<InstallResult> {
  const paths = await ensureMailbox(workspace);
  const result: InstallResult = {
    workspace: paths.workspace,
    created: [],
    updated: [],
    unchanged: [],
  };

  const agentsPath = path.join(paths.workspace, "AGENTS.md");
  const currentAgents = await fs.readFile(agentsPath, "utf8").catch(() => "");
  const nextAgents = upsertSection(currentAgents, assets.agentsSection);
  record(
    result,
    await overwriteFileIfChanged(agentsPath, nextAgents),
    agentsPath,
  );

  const codexDir = path.join(paths.workspace, ".codex");
  const codexHooksDir = path.join(codexDir, "hooks");
  await fs.mkdir(codexHooksDir, { recursive: true });

  const hooksJsonPath = path.join(codexDir, "hooks.json");
  const hookScriptPath = path.join(
    codexHooksDir,
    "codexpigeon_mailbox_hook.py",
  );

  const currentHooksJson = await fs
    .readFile(hooksJsonPath, "utf8")
    .catch(() => "");
  const nextHooksJson = mergeHooksJson(currentHooksJson, assets.hooksJson);
  record(
    result,
    await overwriteFileIfChanged(hooksJsonPath, nextHooksJson),
    hooksJsonPath,
  );
  record(
    result,
    await overwriteFileIfChanged(hookScriptPath, assets.hookScript),
    hookScriptPath,
  );
  await fs.chmod(hookScriptPath, 0o755);

  record(
    result,
    await overwriteFileIfChanged(paths.readme, assets.mailboxReadme),
    paths.readme,
  );
  record(
    result,
    await overwriteFileIfChanged(paths.gitignore, assets.mailboxGitignore),
    paths.gitignore,
  );

  const mailboxPaths = getMailboxPaths(paths.workspace);
  result.unchanged.push(mailboxPaths.inbox, mailboxPaths.appState);

  return result;
}
