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
main_entry="$repo_root/apps/desktop/dist/electron/main/main.js"
electron_package_dir="$(
  "$node_bin" -e 'const path=require("node:path"); const packagePath=require.resolve("electron/package.json",{paths:[process.argv[1]]}); console.log(path.dirname(packagePath));' "$repo_root/apps/desktop"
)"
electron_native="$electron_package_dir/dist/Electron.app/Contents/MacOS/Electron"
codex_app_bin="/Applications/Codex.app/Contents/Resources/codex"
codex_bin="$(command -v codex || true)"
if [[ -x "$codex_app_bin" ]]; then
  codex_bin="$codex_app_bin"
fi
launcher_path="$(
  "$node_bin" <<'NODE'
const path = require("node:path");
const os = require("node:os");
const home = os.homedir();
const stable = [
  path.join(home, ".local/bin"),
  "/Applications/Codex.app/Contents/Resources",
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
];
const current = (process.env.PATH || "")
  .split(path.delimiter)
  .filter(Boolean)
  .filter((entry) => !entry.startsWith(path.join(home, ".codex/tmp")));
console.log([...new Set([...stable, ...current])].join(path.delimiter));
NODE
)"
home_app="$HOME/Applications/CodexPigeon.app"
system_app="/Applications/CodexPigeon.app"
if [[ -w "/Applications" ]]; then
  app_dir="$system_app"
  rm -rf "$home_app"
else
  app_dir="$home_app"
  mkdir -p "$HOME/Applications"
fi
app_launcher="$app_dir/Contents/MacOS/CodexPigeon"
resources_dir="$app_dir/Contents/Resources"
plist="$app_dir/Contents/Info.plist"

rm -rf "$app_dir"
mkdir -p "$app_dir/Contents/MacOS" "$resources_dir"

cat > "$desktop_launcher" <<EOF
#!/usr/bin/env bash
set -euo pipefail
repo_root="$repo_root"
electron_native="$electron_native"
main_entry="$main_entry"
export PATH="$launcher_path"
if [[ -n "$codex_bin" ]]; then
  export CODEXPIGEON_CODEX_BIN="$codex_bin"
fi

if [[ ! -x "\$electron_native" || ! -f "\$main_entry" ]]; then
  cd "\$repo_root"
  exec "$pnpm_bin" --filter @codexpigeon/desktop dev:electron
fi

cd "\$repo_root"
exec "\$electron_native" "\$main_entry" "\$@"
EOF

cat > "$cli_launcher" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec "$node_bin" "$repo_root/packages/cli/dist/index.js" "\$@"
EOF

chmod +x "$desktop_launcher" "$cli_launcher"

if command -v cc >/dev/null 2>&1; then
  launcher_source="$(mktemp "${TMPDIR:-/tmp}/codexpigeon-launcher.XXXXXX.c")"
  launcher_log="$HOME/Library/Logs/CodexPigeon-launcher.log"
  mkdir -p "$(dirname "$launcher_log")"
  repo_root_escaped="$(printf "%s" "$repo_root" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  electron_native_escaped="$(printf "%s" "$electron_native" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  main_entry_escaped="$(printf "%s" "$main_entry" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  launcher_log_escaped="$(printf "%s" "$launcher_log" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  launcher_path_escaped="$(printf "%s" "$launcher_path" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  codex_bin_escaped="$(printf "%s" "$codex_bin" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  cat > "$launcher_source" <<EOF
#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <unistd.h>

int main(void) {
  const char *repo_root = "$repo_root_escaped";
  const char *electron_native = "$electron_native_escaped";
  const char *main_entry = "$main_entry_escaped";
  const char *launcher_log = "$launcher_log_escaped";
  const char *launcher_path = "$launcher_path_escaped";
  const char *codex_bin = "$codex_bin_escaped";
  char *const args[] = {(char *)electron_native, (char *)main_entry, 0};

  setenv("PATH", launcher_path, 1);
  if (strlen(codex_bin) > 0) {
    setenv("CODEXPIGEON_CODEX_BIN", codex_bin, 1);
  }

  if (chdir(repo_root) != 0) {
    FILE *log = fopen(launcher_log, "a");
    if (log != NULL) {
      fprintf(log, "CodexPigeon launcher chdir failed: %s -> %s\n", repo_root, strerror(errno));
      fclose(log);
    }
  }
  execv(args[0], args);
  FILE *log = fopen(launcher_log, "a");
  if (log != NULL) {
    fprintf(log, "CodexPigeon launcher exec failed: %s %s -> %s\n", electron_native, main_entry, strerror(errno));
    fclose(log);
  }
  return 1;
}
EOF
  cc "$launcher_source" -o "$app_launcher"
  rm -f "$launcher_source"
else
  cat > "$app_launcher" <<EOF
#!/usr/bin/env bash
exec "$desktop_launcher" "\$@"
EOF
  chmod +x "$app_launcher"
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
  <key>CFBundleDisplayName</key>
  <string>CodexPigeon</string>
  <key>CFBundleIconFile</key>
  <string>CodexPigeon</string>
  <key>CFBundleName</key>
  <string>CodexPigeon</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>0.1.0</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
EOF

printf "APPL????" > "$app_dir/Contents/PkgInfo"

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

launch_services_register="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [[ -x "$launch_services_register" ]]; then
  "$launch_services_register" -f "$app_dir" >/dev/null 2>&1 || true
fi
xattr -dr com.apple.quarantine "$app_dir" 2>/dev/null || true
touch "$app_dir"

echo "Installed CodexPigeon desktop launcher: $desktop_launcher"
echo "Installed CodexPigeon CLI launcher: $cli_launcher"
echo "Installed macOS app bundle: $app_dir"
