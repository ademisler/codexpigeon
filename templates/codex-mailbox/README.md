# Codex Mailbox

This folder is managed by CodexPigeon.

## Ownership

- `INBOX.md`: human companion app/CLI writes only.
- `OUTBOX.md`: Codex agent writes only.
- `RECEIPTS.md`: Codex agent writes only.
- `STATE.json`: app-owned runtime state.
- `HOOK_STATE.json`: hook-owned runtime state.

## Protocol

CodexPigeon appends human messages to `INBOX.md`. The agent checks the inbox at
safe checkpoints, appends acknowledgements to `RECEIPTS.md`, and writes
human-readable replies to `OUTBOX.md` when needed.

Optional repeated messages are tracked in `STATE.json` and are appended as
normal `INBOX.md` messages only while CodexPigeon is running.

Do not manually edit another owner’s file during normal use.

## Git

Do not commit runtime mailbox files. They are local collaboration state for a
thread/worktree.

This directory's `.gitignore` ignores:

- `INBOX.md`
- `OUTBOX.md`
- `RECEIPTS.md`
- `STATE.json`
- `HOOK_STATE.json`
- lock/temp files
