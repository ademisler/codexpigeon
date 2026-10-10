# Mailbox Protocol

CodexPigeon communicates with Codex agents through workspace-local files. This
keeps human guidance visible to the agent at safe checkpoints without sending
active chat steering.

## Directory

Each repo/worktree gets one mailbox:

```text
.codex-mailbox/
  INBOX.md
  OUTBOX.md
  RECEIPTS.md
  STATE.json
  HOOK_STATE.json
  README.md
  .gitignore
```

Use one mailbox per active thread/worktree:

```text
1 thread = 1 worktree = 1 .codex-mailbox/
```

## Ownership

| File              | Owner               | Purpose                               |
| ----------------- | ------------------- | ------------------------------------- |
| `INBOX.md`        | CodexPigeon app/CLI | Human messages to the agent           |
| `OUTBOX.md`       | Codex agent         | Human-readable replies from the agent |
| `RECEIPTS.md`     | Codex agent         | Acknowledgement and action status     |
| `STATE.json`      | CodexPigeon app/CLI | Technical app state                   |
| `HOOK_STATE.json` | Hook runtime        | Reminder throttle/runtime state       |

The app must never edit `OUTBOX.md` or `RECEIPTS.md`. The agent must never edit
`INBOX.md`.

## Message IDs

IDs are sortable:

```text
msg_YYYYMMDDTHHmmss_<ulid>
reply_YYYYMMDDTHHmmss_<ulid>
receipt_YYYYMMDDTHHmmss_<ulid>
auto_YYYYMMDDTHHmmss_<ulid>
```

Example:

```text
msg_20260520T153000_01HY4YF9F0Q2A3N4B5C6D7E8F9
```

The timestamp prefix gives a readable ordering clue. The ULID suffix prevents
collisions across rapid writes.

## INBOX.md

Written only by CodexPigeon.

```md
# Codex Mailbox - Inbox

Only the human companion app writes to this file.
The agent must not edit this file.

---

## msg_20260520T153000_01HY4YF9F0Q2A3N4B5C6D7E8F9

from: human
created_at: 2026-05-20T15:30:00.000Z
priority: normal
status: unread
scope: current_task

Message:
Do not touch the auth module during the billing refactor. If auth changes are
needed, ask in OUTBOX.md first.
```

`status: unread` is initial metadata only. The app does not rewrite the inbox
block later. Actual status is derived from receipts.

## OUTBOX.md

Written only by the agent.

```md
# Codex Mailbox - Outbox

Only the agent writes to this file.

---

## reply_20260520T153250_01HY4YJ9W9A2F33H4Y9N7DR5F0

from: agent
to: msg_20260520T153000_01HY4YF9F0Q2A3N4B5C6D7E8F9
created_at: 2026-05-20T15:32:50.000Z

Understood. I will avoid auth and ask here first if that changes.
```

`to` should reference an inbox message when the reply answers a specific
message.

## RECEIPTS.md

Written only by the agent.

```md
# Codex Mailbox - Receipts

Only the agent writes to this file.

---

## receipt_20260520T153245_01HY4YJ4Q8E2GHK2Z6MBWR6A1R

message_id: msg_20260520T153000_01HY4YF9F0Q2A3N4B5C6D7E8F9
seen_at: 2026-05-20T15:32:45.000Z
decision: accepted
action_status: applied
summary: Updated current plan to avoid auth module changes.
```

Receipts are the source of truth for UI status.

## STATE.json

Written only by CodexPigeon app/CLI.

`STATE.json` stores local technical state that should not be interpreted by the
agent. The current schema is:

```json
{
  "version": 1,
  "mode": "mailbox-only",
  "updatedAt": "2026-05-20T15:30:00.000Z",
  "automations": [
    {
      "id": "auto_20260520T153000_01HY4YF9F0Q2A3N4B5C6D7E8F9",
      "status": "active",
      "body": "Please keep checking the deploy gate.",
      "priority": "normal",
      "scope": "current_task",
      "intervalMs": 300000,
      "createdAt": "2026-05-20T15:30:00.000Z",
      "updatedAt": "2026-05-20T15:30:00.000Z",
      "nextRunAt": "2026-05-20T15:35:00.000Z",
      "lastSentAt": null,
      "sentCount": 0,
      "sourceMessageId": "msg_20260520T153000_01HY4YF9F0Q2A3N4B5C6D7E8F9",
      "allowWarnings": false
    }
  ]
}
```

Automations are optional. Each due run appends a fresh normal inbox message and
updates `lastSentAt`, `sentCount`, and `nextRunAt`. Stopping an automation marks
it `paused`; history is preserved.

## Status Derivation

The UI derives status from receipts:

| Receipt state                   | UI status            |
| ------------------------------- | -------------------- |
| no receipt                      | `unseen`             |
| `decision: accepted`            | `accepted`           |
| `decision: rejected`            | `rejected`           |
| `decision: deferred`            | `deferred`           |
| `decision: needs_confirmation`  | `needs_confirmation` |
| `action_status: applied`        | `applied`            |
| `action_status: not_applicable` | `not_applicable`     |
| `action_status: blocked`        | `blocked`            |

`action_status` is more specific than `decision` when both are present.

## Parser Rules

Mailbox Markdown is parsed with `remark-parse`/MDAST rather than ad hoc string
splitting.

Rules:

- Each message/reply/receipt starts at an H2 heading (`## id`).
- Metadata is read from initial `key: value` lines after the heading.
- Body text begins after metadata and blank separator lines.
- Unknown metadata is ignored by current UI code.
- Malformed blocks are skipped rather than rewritten.

## Write Semantics

CodexPigeon appends inbox messages with a cross-process lock through
`proper-lockfile`. It creates missing mailbox files before writes.

Repeated messages use the same append path and validation rules as manual
sends. The minimum interval is five seconds to avoid accidental hot loops during
development; normal human-facing presets should be minutes or hours.

Installer-created runtime files are intentionally ignored by Git:

```text
INBOX.md
OUTBOX.md
RECEIPTS.md
STATE.json
HOOK_STATE.json
*.lock
*.tmp
```

## Safe Checkpoints

Installed `AGENTS.md` asks the agent to check `INBOX.md`:

- before a major architectural decision
- after a meaningful implementation step
- after tests or a long shell command
- before final response

Hooks add reminders but are not the primary security boundary. The protocol
depends on `AGENTS.md`, file ownership, and the agent following safe checkpoint
instructions.

## Limitations

- A long-running blocking shell command cannot read new mailbox messages until
  control returns to the agent.
- Ignored mailbox runtime files may not move with some Git/worktree handoff
  workflows. The app and hook runtime recreate missing files when a workspace is
  selected or a session starts.
- Markdown is human-readable but not a transactional database. Keep messages
  reasonably small and append-only.
