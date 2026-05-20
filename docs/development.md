# Development Guide

## Workflow

Use pnpm for all workspace commands.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

For targeted work:

```bash
pnpm --filter @codexpigeon/mailbox-core test
pnpm --filter @codexpigeon/desktop typecheck
pnpm --filter @codexpigeon/desktop dev
```

## Package Ownership

| Package                     | Owns                                               |
| --------------------------- | -------------------------------------------------- |
| `apps/desktop`              | Electron, preload IPC, renderer UX, Vite local API |
| `packages/mailbox-core`     | Protocol, parser, validation, installer, watcher   |
| `packages/codex-app-server` | JSON-RPC transport and read-only Codex methods     |
| `packages/cli`              | CLI commands over mailbox-core/hooks               |
| `packages/hooks`            | Generated hook runtime assets                      |
| `packages/ui`               | Shared UI primitives                               |

Keep cross-package dependencies one-way where possible:

```text
desktop -> ui, mailbox-core, codex-app-server, hooks
cli     -> mailbox-core, hooks
hooks   -> mailbox-core types/assets
```

## Coding Guidelines

- Preserve the read-only App Server boundary.
- Prefer small, package-local changes.
- Add tests in the package where behavior lives.
- Keep CLI thin; put shared behavior in `mailbox-core`.
- Keep UI primitives generic; keep product-specific logic in `apps/desktop`.
- Update docs and templates when protocol or installer behavior changes.

## Mailbox Core Tests

`packages/mailbox-core/test/mailbox.test.ts` covers:

- Markdown parsing and serialization.
- Status derivation.
- sortable IDs.
- risky/secret message warnings.
- optional repeated-message creation, due dispatch, and stop behavior.
- install behavior.
- existing `AGENTS.md` preservation.
- malformed marker refusal.
- hooks JSON merge behavior.

Run:

```bash
pnpm --filter @codexpigeon/mailbox-core test
```

## App Server Tests

`packages/codex-app-server/test/client.test.ts` verifies:

- read-only methods are callable.
- steering/mutating methods are blocked.

Run:

```bash
pnpm --filter @codexpigeon/codex-app-server test
```

## Hook Tests

`packages/hooks/test/hook-runtime.test.ts` verifies:

- installed hook runtime creates mailbox files.
- unread detection/reminder behavior works.

Run:

```bash
pnpm --filter @codexpigeon/hooks test
```

## Desktop Verification

Start Vite:

```bash
pnpm --filter @codexpigeon/desktop dev
```

Check:

- app loads at `http://127.0.0.1:5173/`
- manual path field works in browser mode
- left rail thread list does not overflow
- left rail collapse/expand works
- right inspector collapse/expand works
- focus mode hides side panels
- `Preview install` renders install preview
- right inspector scroll reaches `Apply install`
- optional Repeat sends once immediately and dispatches a second inbox message
  after the chosen interval
- no framework overlay is visible

Run Electron:

```bash
pnpm --filter @codexpigeon/desktop dev:electron
```

Check:

- native folder picker works
- preload exposes `window.codexpigeon`
- log includes `renderer ready (desktop-api)`

## Design References

Codex-like UI parity is tracked in `docs/design/references.md`.

Reference screenshots belong under:

```text
docs/design/references/codex-app/
```

Do not treat generated mockups as final UI parity sources unless they are
accepted and documented there.

## Local Machine Launchers

macOS development wrappers are created with:

```bash
pnpm install:mac
```

This installs:

```text
~/.local/bin/codexpigeon
~/.local/bin/codexpigeon-desktop
/Applications/CodexPigeon.app     # preferred when /Applications is writable
~/Applications/CodexPigeon.app    # fallback when /Applications is not writable
```

Linux desktop launcher files are machine-local. Keep them out of Git:

```text
~/.local/bin/codexpigeon-desktop
~/.local/share/applications/codexpigeon.desktop
~/.local/share/icons/hicolor/256x256/apps/codexpigeon.png
```

Future packaging should automate these through an Electron packaging adapter.
