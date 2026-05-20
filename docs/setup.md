# Setup

## Requirements

Linux and macOS are supported development targets.

Required:

- Node.js 22+
- pnpm 11+
- Python 3
- Git

Recommended:

- Codex CLI/App Server available on `PATH`
- Chromium or the Codex in-app browser for UI verification

Check the local machine:

```bash
pnpm --filter @codexpigeon/cli start -- doctor
```

## Install Dependencies

```bash
pnpm install
```

The workspace uses pnpm workspaces:

```text
apps/*
packages/*
```

## Development Commands

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

`pnpm dev` runs the desktop renderer through Vite at
`http://127.0.0.1:5173/`.

In browser mode:

- Folder selection uses a manual path field.
- The Vite middleware exposes local `/api/*` routes.
- This mode is useful for screenshot/interaction testing.

For public screenshots, use sanitized demo mode:

```text
http://127.0.0.1:5173/?demo=1
```

Demo mode uses synthetic threads, paths, mailbox messages, receipts, and
automations. It does not read real Codex state or local mailbox files.

Run full Electron development mode:

```bash
pnpm --filter @codexpigeon/desktop dev:electron
```

This builds the Electron main/preload files, starts Vite, waits for the dev
server, then opens Electron against the Vite URL.

## Build

```bash
pnpm build
```

Build output:

```text
apps/desktop/dist/electron/
apps/desktop/dist/renderer/
packages/*/dist/
```

`dist/` is ignored by Git.

## CLI Usage

Development:

```bash
pnpm --filter @codexpigeon/cli start -- doctor
pnpm --filter @codexpigeon/cli start -- install --workspace /path/to/worktree
pnpm --filter @codexpigeon/cli start -- send --workspace /path/to/worktree "Message"
pnpm --filter @codexpigeon/cli start -- send --workspace /path/to/worktree --repeat-every 5m "Message"
pnpm --filter @codexpigeon/cli start -- watch --workspace /path/to/worktree
pnpm --filter @codexpigeon/cli start -- watch --workspace /path/to/worktree --run-automations
pnpm --filter @codexpigeon/cli start -- snapshot --workspace /path/to/worktree
pnpm --filter @codexpigeon/cli start -- automation list --workspace /path/to/worktree
pnpm --filter @codexpigeon/cli start -- automation stop --workspace /path/to/worktree auto_...
```

Compiled:

```bash
pnpm build
node packages/cli/dist/index.js doctor
```

## Desktop Local Install

This repository does not yet include a signed cross-platform packager. On macOS
during development, install local wrappers after a successful build:

```bash
pnpm install:mac
```

The script creates:

```text
~/.local/bin/codexpigeon
~/.local/bin/codexpigeon-desktop
/Applications/CodexPigeon.app     # preferred when /Applications is writable
~/Applications/CodexPigeon.app    # fallback when /Applications is not writable
```

The wrappers point at the built Electron entrypoint:

```text
apps/desktop/dist/electron/main/main.js
```

On Linux during development, a local launcher can point at the same built
Electron entrypoint. The current Linux development machine uses:

```text
~/.local/bin/codexpigeon-desktop
~/.local/share/applications/codexpigeon.desktop
~/.local/share/icons/hicolor/256x256/apps/codexpigeon.png
```

These machine-local files are not part of the repository.

## Installing Into a Workspace

From CLI:

```bash
pnpm --filter @codexpigeon/cli start -- install --workspace /path/to/repo-or-worktree
```

From desktop:

1. Select or type a workspace path.
2. Review install status in the right inspector.
3. Click `Preview install`.
4. Inspect the generated `AGENTS.md` block.
5. Click `Apply install`.

Files created or updated:

```text
AGENTS.md
.codex/hooks.json
.codex/hooks/codexpigeon_mailbox_hook.py
.codex-mailbox/README.md
.codex-mailbox/.gitignore
.codex-mailbox/INBOX.md
.codex-mailbox/STATE.json
```

The app/CLI do not write agent-owned `OUTBOX.md` or `RECEIPTS.md`. The
installed hook creates those files on the agent side when Codex runs in the
trusted workspace.

Project-local Codex hooks run only when the Codex project is trusted.

## Optional Repeat Sending

From desktop:

1. Type a mailbox message.
2. Enable `Repeat`.
3. Pick an interval, for example `5 minutes` or `1 hour`.
4. Send the message.
5. Stop the repeat from the `Auto carriers` card in the right inspector.

From CLI:

```bash
pnpm --filter @codexpigeon/cli start -- send --workspace /path/to/worktree --repeat-every 5m "Please re-check CI status."
pnpm --filter @codexpigeon/cli start -- automation list --workspace /path/to/worktree
pnpm --filter @codexpigeon/cli start -- automation stop --workspace /path/to/worktree auto_...
```

The desktop app dispatches due repeated messages while watching a workspace. In
CLI-only workflows, keep `watch --run-automations` running or call
`automation run-due` from an external scheduler.

## Existing AGENTS.md

Existing `AGENTS.md` content is preserved.

CodexPigeon inserts/replaces only:

```md
<!-- CODEXPIGEON_MAILBOX_START -->

...

<!-- CODEXPIGEON_MAILBOX_END -->
```

If markers are malformed, the installer refuses to update automatically so a
human can repair the file.

## Existing Hooks

Existing `.codex/hooks.json` files are merged.

- Non-CodexPigeon hook groups are preserved.
- Old CodexPigeon hook groups are replaced with the current template.
- Invalid JSON causes the installer to refuse automatic updates.

## First Workspace Test

1. Install CodexPigeon into a disposable repo/worktree.
2. Start a Codex task in that workspace.
3. Send a message:

   ```bash
   pnpm --filter @codexpigeon/cli start -- send --workspace /path/to/worktree "Please avoid auth changes unless you ask first."
   ```

4. Watch:

   ```bash
   pnpm --filter @codexpigeon/cli start -- watch --workspace /path/to/worktree
   ```

5. Confirm the agent eventually writes `RECEIPTS.md` and optionally
   `OUTBOX.md`.
