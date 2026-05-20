# Design References

CodexPigeon follows the Codex App shell pattern:

- dark desktop app surface
- compact left navigation
- central work surface
- right inspector
- muted status text
- compact command controls
- clear running/idle/degraded states

## Current Reference Set

```text
docs/design/references/codex-app/desktop-main-20260520.png
```

This is the only curated Codex App reference currently in the repository.
Therefore UI parity claims are limited to the main desktop shell.

## Current CodexPigeon Direction

Until more screenshots are supplied, the product uses:

- Codex-like density and dark shell
- direct dove emoji (`🕊️`) inside the app UI
- transparent PNG dove icon for Linux desktop entries
- orange accent for active/running/send states
- collapsible left rail
- collapsible right inspector
- focus mode for mailbox work

## Adding More References

Place curated screenshots under:

```text
docs/design/references/codex-app/
```

Name them with date and surface:

```text
desktop-main-YYYYMMDD.png
desktop-thread-running-YYYYMMDD.png
desktop-compact-YYYYMMDD.png
```

When adding a reference, update this file with:

- what surface it covers
- viewport size if known
- which CodexPigeon screen/state should match it
- any intentional deviations

## Visual QA Checklist

Before claiming a UI polish pass is complete:

- no text overflow in sidebars or inspector
- thread rows stay aligned with long paths
- left rail collapsed state shows icons only
- right inspector scroll reaches install actions
- primary controls have icons where useful
- focus mode actually opens workspace for the center panel
- no framework error overlay
- app icon has transparent background
