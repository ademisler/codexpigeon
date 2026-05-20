# Security

CodexPigeon is designed to avoid active Codex chat steering. The app writes
repo-local mailbox input, observes Codex read-only status, and relies on
project instructions/hooks to make the agent check the mailbox at safe points.

## Data You Should Not Share

- Codex state databases.
- Codex log databases.
- Shell snapshots.
- Private `AGENTS.md` content.
- Runtime `.codex-mailbox/INBOX.md`, `OUTBOX.md`, `RECEIPTS.md`, `STATE.json`,
  or `HOOK_STATE.json` files from private workspaces.
- Screenshots that reveal private project names, branch names, customer names,
  mailbox messages, or credentials.

## Trust Boundaries

| Boundary           | Rule                                               |
| ------------------ | -------------------------------------------------- |
| App/CLI to mailbox | May append to `INBOX.md` and maintain `STATE.json` |
| Agent to mailbox   | May append to `OUTBOX.md` and `RECEIPTS.md`        |
| App Server         | Read/status/discovery methods only                 |
| Hook runtime       | Reminder/context helper, not a security sandbox    |
| Mailbox content    | Human guidance, not executable content             |

## Explicitly Disallowed App Server Methods

The public allowlist must not include:

- `turn/steer`
- `turn/start`
- `thread/inject_items`
- `turn/interrupt`
- App Server filesystem write/remove/copy methods

## Reporting Issues

If you find a security issue in CodexPigeon, use GitHub private vulnerability
reporting when available, or contact the maintainer through GitHub. If the issue
is in Codex, Codex CLI, Electron, Vite, React, or another upstream dependency,
report it to the upstream project as well.

See [docs/security.md](docs/security.md) for the full security model and review
checklist.
