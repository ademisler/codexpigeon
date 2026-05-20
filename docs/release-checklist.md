# Release Checklist

Use this checklist before pushing or packaging.

## Repository Hygiene

```bash
git status --short
```

Confirm:

- no `node_modules/`
- no `dist/`
- no runtime `.codex-mailbox/INBOX.md`, `OUTBOX.md`, `RECEIPTS.md`,
  `STATE.json`, or `HOOK_STATE.json`
- no temporary screenshots/logs unless intentionally documented

## Quality Gates

```bash
pnpm typecheck
pnpm test
pnpm build
```

All must pass.

## Desktop Smoke Test

Run dev browser mode:

```bash
pnpm --filter @codexpigeon/desktop dev
```

Verify:

- page loads at `http://127.0.0.1:5173/`
- thread list renders without horizontal overflow
- left rail collapse/expand works
- right inspector collapse/expand works
- focus mode works
- `Preview install` shows install preview
- right inspector scroll reaches `Apply install`
- enabling Repeat schedules an automation and the `Auto carriers` card can stop it

Run Electron mode:

```bash
pnpm --filter @codexpigeon/desktop dev:electron
```

Verify:

- native folder picker opens
- `renderer ready (desktop-api)` appears in logs
- sending a mailbox message updates `INBOX.md`

## CLI Smoke Test

Use a temp workspace:

```bash
tmp=$(mktemp -d)
git -C "$tmp" init
pnpm --filter @codexpigeon/cli start -- install --workspace "$tmp"
pnpm --filter @codexpigeon/cli start -- send --workspace "$tmp" "Release smoke test"
pnpm --filter @codexpigeon/cli start -- send --workspace "$tmp" --repeat-every 5s "Release repeat smoke"
sleep 6
pnpm --filter @codexpigeon/cli start -- automation run-due --workspace "$tmp"
pnpm --filter @codexpigeon/cli start -- automation list --workspace "$tmp"
pnpm --filter @codexpigeon/cli start -- snapshot --workspace "$tmp"
```

Confirm:

- `AGENTS.md` exists
- `.codex/hooks.json` exists
- `.codex-mailbox/INBOX.md` contains one message
- snapshot reports at least two inbox messages after repeat smoke
- automation list reports the scheduled automation

## Security Boundary Check

Confirm:

- `READ_ONLY_CODEX_METHODS` contains only read/status/discovery methods.
- Tests still cover rejection of `turn/steer` or another mutating method.
- Installer still preserves existing `AGENTS.md`.
- Installer still merges existing hooks.

## Documentation Check

Update docs when any of these change:

- mailbox file format
- installer output
- hook runtime behavior
- App Server method allowlist
- desktop launch/install process
- optional repeat sending behavior
- platform support
- UI reference screenshots

## Local Linux Launcher

If refreshing the local installed development launcher:

```bash
pnpm build
pkill -f 'apps/desktop/dist/electron/main/main.js' || true
~/.local/bin/codexpigeon-desktop
```

Expected:

```text
[codexpigeon] renderer ready (desktop-api)
```

## GitHub Push

The repository currently has no remote assumptions. After review:

```bash
git add .
git commit -m "Prepare CodexPigeon MVP"
git remote add origin <your-repo-url>
git push -u origin main
```
