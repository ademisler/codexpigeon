# Troubleshooting

## Blank Electron Window

Check the desktop log:

```bash
sed -n '1,120p' /tmp/codexpigeon-desktop.log
```

Expected:

```text
[codexpigeon] renderer ready (desktop-api)
```

Common causes:

- renderer build missing
- `vite.config.ts` `base` not compatible with file loading
- preload path mismatch
- stale Electron process still running an old build

Rebuild and restart:

```bash
pnpm build
pkill -f 'apps/desktop/dist/electron/main/main.js' || true
~/.local/bin/codexpigeon-desktop
```

## Browser Mode Cannot Choose a Folder

Expected behavior. Browsers cannot expose arbitrary absolute folder paths the
same way Electron can. Type the absolute workspace path in the right inspector
and click `Use path`.

For native folder selection, run Electron:

```bash
pnpm --filter @codexpigeon/desktop dev:electron
```

## macOS Dock Click Does Not Open

Refresh the local app bundle after rebuilding:

```bash
pnpm build
pnpm install:mac -- --skip-build
```

Expected:

```text
/Applications/CodexPigeon.app
```

If Dock/LaunchServices starts and immediately exits, check the native launcher
log:

```bash
sed -n '1,120p' ~/Library/Logs/CodexPigeon-launcher.log
```

The macOS app launcher should execute Electron directly, not rely on
`~/.local/bin/codexpigeon-desktop` or an interactive shell.

## App Server Shows Degraded

CodexPigeon tries:

1. `codex app-server proxy`
2. `codex app-server`

If both fail:

- ensure `codex` is on `PATH`
- on macOS Dock launches, confirm
  `/Applications/Codex.app/Contents/Resources/codex` exists or rerun
  `pnpm install:mac -- --skip-build` to refresh the launcher environment
- run `codex --version`
- run `pnpm doctor`
- confirm Codex Desktop/CLI is installed and authenticated

Degraded mode does not block manual mailbox usage. You can still select a
workspace and send mailbox messages.

## Threads Look Stale

Thread activity is inferred from:

- App Server thread status
- loaded thread IDs
- recent thread updates
- Codex local streaming logs when available

If the active thread is not detected:

- click `Refresh`
- confirm Codex is working in the same user profile
- confirm the workspace path shown in CodexPigeon matches the active worktree
- use manual workspace selection as the source of truth

## Hooks Do Not Fire

Project-local Codex hooks load only when the project is trusted.

Check:

- `.codex/hooks.json` exists
- `.codex/hooks/codexpigeon_mailbox_hook.py` exists
- Python 3 is available
- Codex project trust allows local `.codex/` layers

Run:

```bash
pnpm --filter @codexpigeon/cli start -- install --workspace /path/to/worktree
```

Then restart or resume the Codex session in that workspace.

## Installer Refuses AGENTS.md

If `AGENTS.md` contains only one CodexPigeon marker, the installer refuses to
edit it automatically.

Fix manually so both markers exist in order:

```md
<!-- CODEXPIGEON_MAILBOX_START -->

...

<!-- CODEXPIGEON_MAILBOX_END -->
```

Then rerun install.

## Installer Refuses hooks.json

`.codex/hooks.json` must be valid JSON and each hook event must be an array.
Fix the JSON manually, then rerun install.

## Message Send Is Blocked By Warnings

CodexPigeon blocks likely secrets/risky operations by default.

CLI:

```bash
pnpm --filter @codexpigeon/cli start -- send --workspace /path "message" --allow-warnings
```

UI:

1. Review the warning.
2. Use the explicit send-anyway action if the message is safe.

Do not paste credentials into mailbox messages.

## Repeat Sending Does Not Fire

Repeat sending is optional and app-owned. It does not wake CodexPigeon by
itself.

Check:

- the desktop app is open and watching the selected workspace
- the automation is `active` in the `Auto carriers` card
- the `nextRunAt` time in `STATE.json` has passed
- CLI-only workflows are running `watch --run-automations` or
  `automation run-due`

Stop stale repeats from the desktop inspector or:

```bash
pnpm --filter @codexpigeon/cli start -- automation stop --workspace /path auto_...
```

## Right Inspector Cannot Reach Apply Install

The right inspector is an independent scroll container. If the button is not
visible:

- hover/focus the right inspector and scroll
- use a taller window
- collapse the left rail or enter focus mode

If a layout regression returns, check `apps/desktop/src/renderer/styles.css`
for `min-height: 0` and `overflow-y: auto` on the app shell children.

## Icon Has a Dark Square Background

The Linux icon should be an RGBA PNG:

```text
apps/desktop/assets/codexpigeon.png
~/.local/share/icons/hicolor/256x256/apps/codexpigeon.png
```

Verify alpha:

```bash
identify -verbose apps/desktop/assets/codexpigeon.png | rg 'Alpha|color_type'
```

Expected PNG color type is RGBA.
