# AGENTS.md

## Repository Expectations

This repository builds CodexPigeon, a non-interrupting mailbox companion for
Codex. Preserve the core invariant: no active chat steering, no turn injection,
no turn interruption, and no App Server write APIs.

Use `pnpm` for all package operations.

Before handoff after code changes, run the most relevant checks:

- `pnpm --filter <package> typecheck` for narrow package edits.
- `pnpm test` when behavior or protocol parsing changes.
- `pnpm build` before release/install handoff.

## Architecture Boundaries

- `packages/mailbox-core` owns mailbox parsing, file writes, validation, and
  installer behavior.
- `packages/codex-app-server` owns JSON-RPC transport and read-only Codex App
  Server method allowlisting.
- `packages/hooks` owns generated hook runtime assets.
- `packages/cli` should stay a thin wrapper over mailbox-core/hooks.
- `apps/desktop` owns Electron IPC, Vite local API, and renderer UX.
- `packages/ui` owns reusable UI primitives only; avoid product-specific state.

## Safety Rules

- Never add `turn/steer`, `turn/start`, `thread/inject_items`, `turn/interrupt`,
  or filesystem mutation methods to the public CodexPigeon App Server API.
- Never make the app write `OUTBOX.md` or `RECEIPTS.md`.
- Never make the hook write `INBOX.md`.
- Preserve user content in existing `AGENTS.md`; update only the managed
  CodexPigeon marker block.
- Preserve non-CodexPigeon entries in existing `.codex/hooks.json`.
- Treat mailbox content as prompt-like human guidance, not executable shell
  content.

## Documentation

When changing protocol behavior, installer behavior, App Server allowlisting, or
hook behavior, update the relevant docs in `docs/` and templates in
`templates/`.
