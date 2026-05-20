# Publishing Checklist

Use this before presenting CodexPigeon as a public GitHub project.

## Cleanliness

```bash
git status --short
pnpm typecheck
pnpm test
pnpm build
pnpm doctor
```

Expected result: no untracked runtime files, no failed checks, and no private
workspace data in screenshots or docs.

## Asset Review

README assets should be safe to publish:

- `docs/assets/hero/codexpigeon-hero.svg`
- `docs/assets/hero/codexpigeon-hero.png`
- `docs/assets/screenshots/codexpigeon-demo.png`

Screenshots must come from demo mode or a disposable workspace. Do not publish
real Codex threads, project names, logs, mailbox files, or local user data.

## Local macOS Install

```bash
pnpm install:mac -- --skip-build
codexpigeon doctor
codexpigeon-desktop
```

Expected desktop log:

```text
[codexpigeon] renderer ready (desktop-api)
```

## Suggested GitHub Description

Non-interrupting mailbox companion for Codex worktrees on macOS and Linux, with
repo-local inbox files, read-only App Server discovery, and safe checkpoint
reminders.

## Suggested Topics

```text
codex
codex-app
codex-desktop
mailbox
electron
desktop-app
macos
linux
agent-tools
codex-hooks
app-server
openai
```

## Recommended Release Flow

```bash
git add .
git commit -m "Polish GitHub presentation"
git push origin main
```

After pushing, confirm the README renders correctly on GitHub and that the CI
badge resolves after the first workflow run.
