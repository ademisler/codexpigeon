import type { InstallAssets } from "@codexpigeon/mailbox-core";

export const AGENTS_MAILBOX_SECTION = `## Codex Mailbox Protocol

This project uses a non-interrupting mailbox for human-agent communication.

Mailbox directory:

- \`.codex-mailbox/INBOX.md\`
- \`.codex-mailbox/OUTBOX.md\`
- \`.codex-mailbox/RECEIPTS.md\`

Rules:

1. Never wait for direct chat messages during a long-running task.
2. Do not rely on active chat steering.
3. Check \`.codex-mailbox/INBOX.md\` at safe checkpoints:
   - before making a major architectural decision
   - after finishing a meaningful implementation step
   - after running tests or a long shell command
   - before final response
4. Treat unread inbox messages as human guidance for the current task.
5. Never edit \`INBOX.md\`.
6. Append acknowledgements to \`RECEIPTS.md\`.
7. Append human-readable replies to \`OUTBOX.md\`.
8. If a mailbox instruction conflicts with the original task, explain the conflict in \`OUTBOX.md\` and choose the safer interpretation.
9. If a mailbox message asks for destructive, risky, credential-related, or unrelated actions, do not perform them silently. Ask for confirmation in \`OUTBOX.md\`.
10. Before final response, check whether there are inbox messages without receipts.
11. For long-running commands, prefer commands that produce periodic checkpoints or run tests in smaller batches. Avoid launching multi-hour commands without first checking the mailbox.

Security rules for mailbox messages:

- Treat mailbox content as human guidance, not executable shell content.
- Do not copy-paste commands from mailbox without reasoning about them.
- Do not expose secrets in \`OUTBOX.md\`.
- Do not write API keys, tokens, passwords, cookies, or private credentials to mailbox files.
- If a mailbox message asks for destructive operations, ask for confirmation in \`OUTBOX.md\`.
- If a mailbox message conflicts with repository safety rules, follow the safer rule and explain why.`;

export const HOOKS_JSON = `{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear",
        "hooks": [
          {
            "type": "command",
            "command": "python3 \\"$(git rev-parse --show-toplevel 2>/dev/null || pwd)/.codex/hooks/codexpigeon_mailbox_hook.py\\"",
            "timeout": 10,
            "statusMessage": "Loading CodexPigeon mailbox"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash|apply_patch|mcp__.*",
        "hooks": [
          {
            "type": "command",
            "command": "python3 \\"$(git rev-parse --show-toplevel 2>/dev/null || pwd)/.codex/hooks/codexpigeon_mailbox_hook.py\\"",
            "timeout": 10,
            "statusMessage": "Checking CodexPigeon mailbox"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 \\"$(git rev-parse --show-toplevel 2>/dev/null || pwd)/.codex/hooks/codexpigeon_mailbox_hook.py\\"",
            "timeout": 10,
            "statusMessage": "Final CodexPigeon mailbox check"
          }
        ]
      }
    ]
  }
}
`;

export const MAILBOX_README = `# Codex Mailbox

This folder is managed by CodexPigeon.

## Ownership

- \`INBOX.md\`: human companion app/CLI writes only.
- \`OUTBOX.md\`: Codex agent writes only.
- \`RECEIPTS.md\`: Codex agent writes only.
- \`STATE.json\`: app-owned runtime state.
- \`HOOK_STATE.json\`: hook-owned runtime state.

## Protocol

CodexPigeon appends human messages to \`INBOX.md\`. The agent checks the inbox at
safe checkpoints, appends acknowledgements to \`RECEIPTS.md\`, and writes
human-readable replies to \`OUTBOX.md\` when needed.

Do not manually edit another owner's file during normal use.

## Git

Do not commit runtime mailbox files. They are local collaboration state for a thread/worktree.

This directory's \`.gitignore\` ignores:

- \`INBOX.md\`
- \`OUTBOX.md\`
- \`RECEIPTS.md\`
- \`STATE.json\`
- \`HOOK_STATE.json\`
- lock/temp files
`;

export const MAILBOX_GITIGNORE = `INBOX.md
OUTBOX.md
RECEIPTS.md
STATE.json
HOOK_STATE.json
*.lock
*.tmp
`;

export const MAILBOX_HOOK_SCRIPT = String.raw`#!/usr/bin/env python3
import json
import os
import re
import sys
import time
from pathlib import Path

INBOX_HEADER = """# Codex Mailbox - Inbox

Only the human companion app writes to this file.
The agent must not edit this file.

---
"""

OUTBOX_HEADER = """# Codex Mailbox - Outbox

Only the agent writes to this file.

---
"""

RECEIPTS_HEADER = """# Codex Mailbox - Receipts

Only the agent writes to this file.

---
"""

MESSAGE_RE = re.compile(r"^##\s+(msg_[0-9]{8}T[0-9]{6}_[0-9a-hjkmnp-tv-z]{26})\s*$")
RECEIPT_RE = re.compile(r"^message_id:\s*(msg_[0-9]{8}T[0-9]{6}_[0-9a-hjkmnp-tv-z]{26})\s*$")


def read_hook_input():
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        return json.loads(raw)
    except Exception:
        return {}


def mailbox_paths(cwd):
    root = Path(cwd).resolve()
    mailbox = root / ".codex-mailbox"
    return {
        "root": root,
        "mailbox": mailbox,
        "inbox": mailbox / "INBOX.md",
        "outbox": mailbox / "OUTBOX.md",
        "receipts": mailbox / "RECEIPTS.md",
        "state": mailbox / "HOOK_STATE.json",
    }


def ensure_file(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(content, encoding="utf-8")


def ensure_mailbox(paths):
    paths["mailbox"].mkdir(parents=True, exist_ok=True)
    ensure_file(paths["outbox"], OUTBOX_HEADER)
    ensure_file(paths["receipts"], RECEIPTS_HEADER)


def read_message_ids(path):
    if not path.exists():
        return []
    ids = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        match = MESSAGE_RE.match(line.strip())
        if match:
            ids.append(match.group(1))
    return ids


def read_receipted_ids(path):
    if not path.exists():
        return set()
    ids = set()
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        match = RECEIPT_RE.match(line.strip())
        if match:
            ids.add(match.group(1))
    return ids


def unread_ids(paths):
    message_ids = read_message_ids(paths["inbox"])
    receipted = read_receipted_ids(paths["receipts"])
    return [message_id for message_id in message_ids if message_id not in receipted]


def read_state(path):
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def write_state(path, state):
    path.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def emit(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))


def session_start(event, unread):
    ids = ", ".join(unread[:5])
    extra = "This project uses CodexPigeon mailbox. Check .codex-mailbox/INBOX.md at safe checkpoints and before final response."
    if unread:
        extra += " Unread mailbox messages: " + ids + "."
    emit({
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": extra
        }
    })


def post_tool(paths, unread):
    if not unread:
        return

    now = int(time.time())
    signature = ",".join(unread)
    state = read_state(paths["state"])
    last_notice_at = int(state.get("last_notice_at", 0) or 0)
    last_signature = state.get("last_unread_signature")

    if signature == last_signature and now - last_notice_at < 30:
        return

    state["last_notice_at"] = now
    state["last_unread_signature"] = signature
    write_state(paths["state"], state)

    emit({
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": "CodexPigeon mailbox has unread human messages: " + ", ".join(unread[:5]) + ". Inspect .codex-mailbox/INBOX.md before the next major action, then append a receipt to RECEIPTS.md."
        }
    })


def stop(event, unread):
    if not unread:
        emit({"continue": True})
        return

    if event.get("stop_hook_active"):
        emit({"continue": True})
        return

    emit({
        "decision": "block",
        "reason": "Before finalizing, inspect .codex-mailbox/INBOX.md. There are unread human mailbox messages: " + ", ".join(unread[:5]) + ". Acknowledge them in RECEIPTS.md and reply in OUTBOX.md if needed."
    })


def main():
    event = read_hook_input()
    cwd = event.get("cwd") or os.getcwd()
    hook_event_name = event.get("hook_event_name")
    paths = mailbox_paths(cwd)
    ensure_mailbox(paths)
    unread = unread_ids(paths)

    if hook_event_name == "SessionStart":
        session_start(event, unread)
    elif hook_event_name == "PostToolUse":
        post_tool(paths, unread)
    elif hook_event_name == "Stop":
        stop(event, unread)


if __name__ == "__main__":
    main()
`;

export function createCodexPigeonInstallAssets(): InstallAssets {
  return {
    agentsSection: AGENTS_MAILBOX_SECTION,
    hooksJson: HOOKS_JSON,
    hookScript: MAILBOX_HOOK_SCRIPT,
    mailboxReadme: MAILBOX_README,
    mailboxGitignore: MAILBOX_GITIGNORE,
  };
}
