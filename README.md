# CodexPigeon

CodexPigeon is a desktop companion for Codex that lets a human leave
non-interrupting guidance for an active Codex task through repo-local mailbox
files.

The invariant is strict:

- CodexPigeon does not steer an active Codex turn.
- CodexPigeon does not inject chat messages.
- CodexPigeon does not interrupt, start, or mutate Codex conversations.
- CodexPigeon writes only mailbox files in a selected repo/worktree.
- Codex App Server is used only for read/status/discovery.

The app is ready for Linux and macOS development use today. The monorepo is
structured so signed macOS/Windows packaging can be added later without
changing the mailbox protocol.

## Current Status

This repository contains a working MVP:

- Electron + React + Vite desktop app.
- `codexpigeon` CLI helper.
- Mailbox parser/serializer and installer core.
- Read-only Codex App Server JSON-RPC client.
- Project-local hook runtime installer.
- AGENTS.md and mailbox templates.
- Optional repeated mailbox sending from the desktop UI and CLI.
- Tests for mailbox parsing/install behavior, hooks, and App Server allowlist.

UI parity with the official Codex app is intentionally limited until more
reference screenshots are added under
`docs/design/references/codex-app/`.

## Monorepo Layout

```text
apps/
  desktop/                 Electron main/preload + React renderer
packages/
  mailbox-core/            Mailbox protocol, parser, installer, validation
  codex-app-server/        Read-only Codex App Server JSON-RPC client
  cli/                     send/watch/install/doctor commands
  hooks/                   Hook runtime assets copied into workspaces
  ui/                      Shared UI primitives and tokens
templates/                 Human-readable install templates
docs/                      Architecture, setup, protocol, security, roadmap
```

## Quick Start

Requirements:

- Node.js 22+
- pnpm 11+
- Python 3 for installed project hooks
- Codex CLI/App Server for live thread discovery

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm doctor
pnpm dev
```

`pnpm dev` serves the renderer at
`http://127.0.0.1:5173/` with a Vite-local Node API. Browser mode cannot open a
native folder picker, so type an absolute repo/worktree path in the right
inspector.

For the full Electron runtime with native folder selection:

```bash
pnpm --filter @codexpigeon/desktop dev:electron
```

For a local macOS development install after a successful build:

```bash
pnpm install:mac
```

This creates `~/.local/bin/codexpigeon`, `~/.local/bin/codexpigeon-desktop`,
and `~/Applications/CodexPigeon.app` wrappers that run the built workspace.

## CLI

During development, run CLI commands through the workspace package:

```bash
pnpm --filter @codexpigeon/cli start -- doctor
pnpm --filter @codexpigeon/cli start -- install --workspace /path/to/worktree
pnpm --filter @codexpigeon/cli start -- send --workspace /path/to/worktree "Do not touch auth without asking first."
pnpm --filter @codexpigeon/cli start -- send --workspace /path/to/worktree --repeat-every 5m "Please keep checking the deploy gate."
pnpm --filter @codexpigeon/cli start -- watch --workspace /path/to/worktree
pnpm --filter @codexpigeon/cli start -- snapshot --workspace /path/to/worktree
pnpm --filter @codexpigeon/cli start -- automation list --workspace /path/to/worktree
pnpm --filter @codexpigeon/cli start -- automation stop --workspace /path/to/worktree auto_...
```

After `pnpm build`, the compiled package exposes the `codexpigeon` binary from
`packages/cli/dist/index.js`.

## Optional Repeat Sending

Repeat sending is opt-in per message. When enabled, CodexPigeon sends the first
message immediately, stores an app-owned automation in `STATE.json`, and appends
future copies to `INBOX.md` only when the desktop app is running or the CLI is
explicitly running due automations.

The agent still sees normal inbox messages at safe checkpoints. CodexPigeon
does not steer active chat, even for scheduled repeats.

## Workspace Install Behavior

Installing CodexPigeon into a repo/worktree creates or updates:

```text
AGENTS.md
.codex/hooks.json
.codex/hooks/codexpigeon_mailbox_hook.py
.codex-mailbox/README.md
.codex-mailbox/.gitignore
.codex-mailbox/INBOX.md
.codex-mailbox/STATE.json
```

Existing `AGENTS.md` content is preserved. CodexPigeon inserts or replaces only
the block between:

```md
<!-- CODEXPIGEON_MAILBOX_START -->
<!-- CODEXPIGEON_MAILBOX_END -->
```

If only one marker exists, the installer refuses to update automatically.
Existing `.codex/hooks.json` files are parsed and merged; non-CodexPigeon hook
groups are preserved.

Agent-owned `OUTBOX.md` and `RECEIPTS.md` are not written by the app/CLI. The
installed hook creates those agent-owned files when Codex runs in the trusted
workspace, and snapshots treat missing agent-owned files as empty.

Runtime mailbox files are local collaboration state and should not be committed.
The generated `.codex-mailbox/.gitignore` ignores the mutable mailbox files.

## Mailbox Rule

Each thread/worktree should have its own mailbox:

```text
1 thread = 1 worktree = 1 .codex-mailbox/
```

Ownership is strict:

- `INBOX.md`: app/CLI writes only.
- `OUTBOX.md`: Codex agent writes only.
- `RECEIPTS.md`: Codex agent writes only.
- `STATE.json`: app-owned technical state.
- `HOOK_STATE.json`: hook-owned throttle/runtime state.

See [Mailbox Protocol](docs/protocol.md) for message examples and status
derivation.

## Codex Integration Boundary

CodexPigeon permits only these App Server methods:

- `initialize`
- `thread/list`
- `thread/read`
- `thread/loaded/list`
- `hooks/list`

The client rejects active-turn methods such as `turn/steer`, `turn/start`,
`thread/inject_items`, and `turn/interrupt`.

This matches the product goal: observe Codex, install mailbox support, and let
agents read mailbox files at safe checkpoints without interrupting their active
chat flow.

## Documentation

- [Architecture](docs/architecture.md)
- [Setup](docs/setup.md)
- [Mailbox Protocol](docs/protocol.md)
- [Security Model](docs/security.md)
- [Development Guide](docs/development.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Release Checklist](docs/release-checklist.md)
- [Platform Roadmap](docs/platform-roadmap.md)
- [Design References](docs/design/references.md)

## Official Codex References

CodexPigeon is designed around the current Codex surfaces documented by OpenAI:

- [AGENTS.md](https://developers.openai.com/codex/guides/agents-md)
- [Hooks](https://developers.openai.com/codex/hooks)
- [Worktrees](https://developers.openai.com/codex/app/worktrees)
- [App Server](https://developers.openai.com/codex/app-server)
- [Advanced Configuration](https://developers.openai.com/codex/config-advanced)

## GitHub Readiness

Before pushing:

```bash
pnpm typecheck
pnpm test
pnpm build
git status --short
```

Generated `dist/`, `node_modules/`, runtime mailbox files, and local editor/OS
state are ignored.
