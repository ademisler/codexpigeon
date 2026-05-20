# Contributing

Thanks for improving CodexPigeon.

CodexPigeon is an open-source mailbox companion for Codex. Contributions should
preserve the product invariant: human guidance may be written to repo-local
mailbox files, but the app must not steer, inject, start, or interrupt active
Codex turns.

## Ground Rules

- Use `pnpm` for package operations.
- Do not commit `node_modules/`, `dist/`, local logs, Codex state, or runtime
  `.codex-mailbox/` files.
- Keep `packages/cli` as a thin wrapper over `mailbox-core` and `hooks`.
- Keep product-specific renderer state inside `apps/desktop`, not
  `packages/ui`.
- Do not add App Server write APIs or active-turn APIs to the public allowlist.
- Do not make the app/CLI write `OUTBOX.md` or `RECEIPTS.md`.
- Do not make the hook write `INBOX.md`.
- Treat mailbox content as human guidance, not executable shell content.
- Screenshots must use demo/synthetic data and must not reveal private project
  names, Codex logs, or local user content.

## Development Checks

For narrow edits:

```bash
pnpm --filter <package> typecheck
```

Before handoff:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm doctor
```

For macOS launcher changes:

```bash
pnpm install:mac -- --skip-build
codexpigeon doctor
```

## Pull Request Checklist

- App Server allowlist still contains read/status/discovery methods only.
- App/CLI still write only app-owned mailbox files.
- Hook runtime still never writes `INBOX.md`.
- Installer still preserves existing `AGENTS.md` content outside the managed
  CodexPigeon marker block.
- Installer still preserves non-CodexPigeon entries in `.codex/hooks.json`.
- Protocol, installer, hook, or allowlist behavior changes are reflected in
  `docs/` and `templates/`.
- UI changes have been checked in browser or Electron mode with no visible
  overflow at desktop and narrow widths.
- README screenshots, if changed, are captured from sanitized demo data.
