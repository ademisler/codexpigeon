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

desktop_launcher="$HOME/.local/bin/codexpigeon-desktop"
cli_launcher="$HOME/.local/bin/codexpigeon"
home_app="$HOME/Applications/CodexPigeon.app"
system_app="/Applications/CodexPigeon.app"
app_launcher="$home_app/Contents/MacOS/CodexPigeon"
resources_dir="$home_app/Contents/Resources"
plist="$home_app/Contents/Info.plist"

rm -rf "$home_app"
mkdir -p "$home_app/Contents/MacOS" "$resources_dir"

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

chmod +x "$desktop_launcher" "$cli_launcher"

if command -v cc >/dev/null 2>&1; then
  launcher_source="$(mktemp "${TMPDIR:-/tmp}/codexpigeon-launcher.XXXXXX.c")"
  launcher_target_escaped="$(printf "%s" "$desktop_launcher" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  cat > "$launcher_source" <<EOF
#include <unistd.h>

int main(void) {
  char *const args[] = {"$launcher_target_escaped", 0};
  execv(args[0], args);
  return 1;
}
EOF
  cc "$launcher_source" -o "$app_launcher"
  rm -f "$launcher_source"
else
  cat > "$home_app/Contents/MacOS/CodexPigeon" <<EOF
#!/usr/bin/env bash
exec "$desktop_launcher" "\$@"
EOF
  chmod +x "$home_app/Contents/MacOS/CodexPigeon"
fi

cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>CodexPigeon</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleIdentifier</key>
  <string>dev.codexpigeon.local</string>
  <key>CFBundleIconFile</key>
  <string>CodexPigeon</string>
  <key>CFBundleName</key>
  <string>CodexPigeon</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
EOF

if command -v iconutil >/dev/null 2>&1 && command -v sips >/dev/null 2>&1; then
  icon_source="$repo_root/apps/desktop/assets/codexpigeon.png"
  icon_tmp="$(mktemp -d)"
  iconset="$icon_tmp/CodexPigeon.iconset"
  mkdir -p "$iconset"
  sips -z 16 16 "$icon_source" --out "$iconset/icon_16x16.png" >/dev/null
  sips -z 32 32 "$icon_source" --out "$iconset/icon_16x16@2x.png" >/dev/null
  sips -z 32 32 "$icon_source" --out "$iconset/icon_32x32.png" >/dev/null
  sips -z 64 64 "$icon_source" --out "$iconset/icon_32x32@2x.png" >/dev/null
  sips -z 128 128 "$icon_source" --out "$iconset/icon_128x128.png" >/dev/null
  sips -z 256 256 "$icon_source" --out "$iconset/icon_128x128@2x.png" >/dev/null
  sips -z 256 256 "$icon_source" --out "$iconset/icon_256x256.png" >/dev/null
  iconutil -c icns "$iconset" -o "$resources_dir/CodexPigeon.icns"
  rm -rf "$icon_tmp"
fi

if [[ -w "/Applications" ]]; then
  rm -rf "$system_app"
  ditto "$home_app" "$system_app"
  echo "Installed macOS app bundle: $system_app"
else
  echo "Skipped /Applications install because it is not writable."
fi

echo "Installed CodexPigeon desktop launcher: $desktop_launcher"
echo "Installed CodexPigeon CLI launcher: $cli_launcher"
echo "Installed macOS app bundle: $home_app"
