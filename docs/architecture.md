# Architecture

CodexPigeon has two integration planes:

1. **Mailbox integration:** create, validate, read, watch, and append
   repo-local files under `.codex-mailbox/`.
2. **Read-only Codex integration:** discover and observe Codex threads through
   App Server without starting, steering, interrupting, or injecting turns.

```text
Electron Desktop / CLI
        |
        v
packages/mailbox-core
        |
        v
.codex-mailbox/
  INBOX.md       app/CLI writes
  OUTBOX.md      agent writes
  RECEIPTS.md    agent writes
  STATE.json     app-owned
  HOOK_STATE.json hook-owned

Codex App Server
        ^
        |
packages/codex-app-server
  initialize
  thread/list
  thread/read
  thread/loaded/list
  hooks/list
```

The Codex agent side is driven by installed project instructions and hooks:

```text
AGENTS.md
  -> tells the agent when/how to check the mailbox

.codex/hooks.json
  -> SessionStart reminder
  -> PostToolUse unread-message notice
  -> Stop final unread-message check

.codex/hooks/codexpigeon_mailbox_hook.py
  -> creates mailbox files
  -> detects unread messages
  -> throttles reminders through HOOK_STATE.json
```

Optional repeated sending is app-owned. The desktop process or explicit CLI
runner reads due entries from `STATE.json` and appends ordinary messages to
`INBOX.md`; it never calls active Codex chat APIs.

## Product Invariant

CodexPigeon is intentionally not a chat-steering client. It must not call App
Server methods that mutate conversations or active turns.

Allowed methods:

- `initialize`
- `thread/list`
- `thread/read`
- `thread/loaded/list`
- `hooks/list`

Disallowed examples:

- `turn/steer`
- `turn/start`
- `thread/inject_items`
- `turn/interrupt`
- App Server filesystem write/remove/copy methods

## Packages

### `apps/desktop`

Electron main/preload plus React renderer.

- Main process owns native dialogs, filesystem watching, and IPC.
- Preload exposes a narrow `window.codexpigeon` bridge.
- Renderer owns UI state and talks only to the bridge.
- Vite dev mode registers a local `/api/*` shim for browser testing.

### `packages/mailbox-core`

Protocol implementation.

- Markdown parsing/serialization.
- Message ID generation.
- File path normalization.
- Atomic appends with `proper-lockfile`.
- Mailbox watching with `chokidar`.
- Optional repeated-message scheduler state in `STATE.json`.
- Message validation and warnings.
- Installer behavior for `AGENTS.md`, hooks, and mailbox files.
- Workspace install status inspection.

### `packages/codex-app-server`

Read-only Codex App Server client.

- JSON-RPC process transport.
- `codex app-server proxy` first.
- `codex app-server` stdio fallback.
- Runtime method allowlist.
- Thread activity enrichment from Codex logs when available.

### `packages/cli`

Thin terminal wrapper over mailbox-core and hooks.

- `send`
- `watch`
- `install`
- `snapshot`
- `automation list`
- `automation stop`
- `automation run-due`
- `doctor`

### `packages/hooks`

Source assets for the installer.

- AGENTS mailbox section.
- `.codex/hooks.json`.
- Python hook runtime.
- Mailbox README and `.gitignore` templates.

### `packages/ui`

Shared primitives and tokens.

- Buttons.
- Icon buttons.
- Panels.
- Status dots.

Keep product-specific behavior in `apps/desktop`.

## Installer Flow

```text
select workspace
  -> inspect current install status
  -> preview AGENTS.md update
  -> apply install only after explicit action
  -> create/update mailbox files
  -> merge .codex/hooks.json
  -> copy hook runtime
  -> refresh hook/install status
```

Existing `AGENTS.md` content is preserved. Only the managed block between the
CodexPigeon markers is inserted or replaced. Existing non-CodexPigeon hooks are
preserved while CodexPigeon hook groups are replaced with the current template.

## Desktop Data Flow

```text
Renderer
  -> preload bridge
  -> Electron main IPC
  -> mailbox-core / codex-app-server
  -> filesystem / Codex process
```

In Vite browser mode:

```text
Renderer
  -> /api/* local Vite middleware
  -> mailbox-core / codex-app-server
```

Browser mode cannot use native absolute folder selection, so the UI exposes a
manual path field.

## Platform Strategy

Linux is the first production target. macOS and Windows should reuse all
packages and add only:

- Packaging metadata.
- Signing/notarization where required.
- Codex/Python path discovery.
- Platform-specific autostart/desktop entry handling.
- Path quoting validation for hooks and App Server spawning.
