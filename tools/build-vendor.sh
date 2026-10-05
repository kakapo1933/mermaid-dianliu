#!/usr/bin/env bash
# 重建 renderer/vendor/beautiful-mermaid.mjs：從 npm 取指定版本，用 bun 打包成單一檔。
# 這個檔只由 node／bun 執行，hook 模組不會 import 它（ELK 超過模組可載入的大小）。
# 用法：tools/build-vendor.sh [版本]   預設版本見下方 VERSION。
set -euo pipefail

VERSION="${1:-1.1.3}"
root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cd "$tmp"
npm init -y >/dev/null
# --ignore-scripts：只取檔案，不跑任何套件的安裝腳本。
npm install --ignore-scripts --no-audit --no-fund "beautiful-mermaid@${VERSION}" >/dev/null

out="$root/renderer/vendor/beautiful-mermaid.mjs"
bun build node_modules/beautiful-mermaid/dist/index.js --target=node --format=esm --outfile="$tmp/bundle.mjs" >/dev/null
elk="$(node -p "require('./node_modules/elkjs/package.json').version")"
entities="$(node -p "require('./node_modules/entities/package.json').version")"
{
  echo "// beautiful-mermaid ${VERSION}（MIT）＋ elkjs ${elk}（EPL-2.0）＋ entities ${entities}（BSD-2-Clause）"
  echo "// 由 tools/build-vendor.sh 以 bun build 打包，未壓縮。不要手改。"
  cat "$tmp/bundle.mjs"
} > "$out"

cp node_modules/beautiful-mermaid/LICENSE "$root/renderer/vendor/LICENSE-beautiful-mermaid"
cp node_modules/elkjs/LICENSE.md "$root/renderer/vendor/LICENSE-elkjs"
cp node_modules/entities/LICENSE "$root/renderer/vendor/LICENSE-entities"
ls -la "$root/renderer/vendor"
