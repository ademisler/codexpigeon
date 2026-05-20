# Platform Roadmap

CodexPigeon supports Linux and macOS development use today. The core packages
are platform-neutral; only packaging, path discovery, and OS integration should
differ by platform.

## Linux

Current packaged-app target.

Done:

- Electron dev/runtime works locally.
- Vite browser mode works for UI verification.
- CLI helper works.
- Local desktop launcher can point at the built Electron entrypoint.
- Transparent PNG icon is available at `apps/desktop/assets/codexpigeon.png`.

Next:

- Add an official packaging adapter.
- Generate `.desktop` entries during install.
- Install icons into the right `hicolor` sizes.
- Decide AppImage, deb, rpm, or a combination.
- Add automated smoke test for a packaged artifact.

## macOS

Reuse:

- React renderer.
- Electron main/preload.
- CLI package.
- mailbox-core.
- hooks package.

Needed:

- Keep the local `pnpm install:mac` wrapper working for development installs.
- Electron packaging config.
- app icon generation from PNG/ICNS.
- signing and notarization.
- Codex binary discovery in login shells and app-launched shells.
- Python 3 discovery.
- native folder permission validation.
- test that hook command quoting works with spaces in paths.

## Windows

Reuse:

- React renderer.
- Electron main/preload.
- CLI package.
- mailbox-core.
- hooks package, with platform-specific command validation.

Needed:

- Electron packaging config.
- ico icon generation.
- Codex binary discovery.
- Python launcher discovery (`py`, `python`, `python3`).
- path quoting tests for `.codex/hooks.json`.
- App Server process spawning tests.
- CRLF-safe mailbox parsing tests.
- workspace path normalization for drive letters and UNC paths.

## Cross-Platform Rules

- Keep mailbox files UTF-8.
- Keep Markdown protocol identical across platforms.
- Keep App Server allowlist identical across platforms.
- Keep runtime mailbox files out of Git.
- Add platform adapters at the packaging/runtime boundary, not in
  mailbox-core.

## Future Product Work

- Archive support for old mailbox messages.
- Workspace deletion/restoration handling.
- multi-workspace/thread dashboard persistence.
- App Server event stream visualization.
- packaged auto-update strategy.
- visual regression tests once more Codex App references are available.
