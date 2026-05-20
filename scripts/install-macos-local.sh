#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pnpm_bin="${PNPM_BIN:-$(command -v pnpm)}"
node_bin="${NODE_BIN:-$(command -v node)}"

if [[ "${1:-}" == "--" ]]; then
  shift
fi

if [[ "${1:-}" != "--skip-build" ]]; then
  (cd "$repo_root" && "$pnpm_bin" build)
fi

mkdir -p "$HOME/.local/bin"
mkdir -p "$HOME/Applications/CodexPigeon.app/Contents/MacOS"

desktop_launcher="$HOME/.local/bin/codexpigeon-desktop"
cli_launcher="$HOME/.local/bin/codexpigeon"
app_launcher="$HOME/Applications/CodexPigeon.app/Contents/MacOS/CodexPigeon"
plist="$HOME/Applications/CodexPigeon.app/Contents/Info.plist"

cat > "$desktop_launcher" <<EOF
#!/usr/bin/env bash
set -euo pipefail
repo_root="$repo_root"
electron_bin="\$repo_root/apps/desktop/node_modules/.bin/electron"
main_entry="\$repo_root/apps/desktop/dist/electron/main/main.js"

if [[ ! -x "\$electron_bin" || ! -f "\$main_entry" ]]; then
  cd "\$repo_root"
  exec "$pnpm_bin" --filter @codexpigeon/desktop dev:electron
fi

cd "\$repo_root"
exec "\$electron_bin" "\$main_entry" "\$@"
EOF

cat > "$cli_launcher" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec "$node_bin" "$repo_root/packages/cli/dist/index.js" "\$@"
EOF

cat > "$app_launcher" <<EOF
#!/usr/bin/env bash
exec "$desktop_launcher" "\$@"
EOF

cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>CodexPigeon</string>
  <key>CFBundleIdentifier</key>
  <string>dev.codexpigeon.local</string>
  <key>CFBundleName</key>
  <string>CodexPigeon</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
</dict>
</plist>
EOF

chmod +x "$desktop_launcher" "$cli_launcher" "$app_launcher"

echo "Installed CodexPigeon desktop launcher: $desktop_launcher"
echo "Installed CodexPigeon CLI launcher: $cli_launcher"
echo "Installed macOS app wrapper: $HOME/Applications/CodexPigeon.app"
