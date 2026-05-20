# Screenshots and Assets

CodexPigeon README imagery must be safe to publish.

## Assets

| Asset                                          | Purpose                     |
| ---------------------------------------------- | --------------------------- |
| `docs/assets/hero/codexpigeon-hero.svg`        | Editable README hero source |
| `docs/assets/hero/codexpigeon-hero.png`        | Rendered README hero        |
| `docs/assets/screenshots/codexpigeon-demo.png` | Sanitized app screenshot    |

## Demo Mode

Use demo mode for public screenshots:

```bash
pnpm --filter @codexpigeon/desktop dev
```

Open:

```text
http://127.0.0.1:5173/?demo=1
```

Demo mode uses synthetic workspaces, threads, messages, receipts, and
automations. It does not call the real Codex App Server or read local mailbox
files.

## Sanitization Rules

Before publishing a screenshot:

- Use demo mode or a disposable temporary workspace.
- Hide private project names, customer names, branch names, and local usernames.
- Hide Codex state, logs, shell snapshots, and mailbox files from real work.
- Do not show credentials, API keys, tokens, or secret-looking values.
- Keep the app viewport wide enough that text does not overlap or overflow.

## Capture Checklist

- Left rail thread names are synthetic.
- Workspace path starts with `/Users/demo/` or another fake path.
- Inbox, outbox, receipt, and automation messages are written for public docs.
- Right inspector is visible and not horizontally overflowing.
- No framework error overlay is visible.
