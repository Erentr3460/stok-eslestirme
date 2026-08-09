#!/usr/bin/env bash
# GitHub Pages için statik çıktı üretir.
# Kullanım: PUBLIC_BASE=/repo-adi/ ./scripts/build-pages.sh   (kök alan adı için PUBLIC_BASE boş bırak)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/packages/web/dist"

cd "$ROOT"
bun install --frozen-lockfile >/dev/null
bun run build:web

# Analiz/çalışma zamanı kalıntılarını temizle
rm -f "$DIST/runable.js"
if [ -f "$DIST/index.html" ]; then
  perl -0pi -e 's{<script[^>]*runable\.js[^>]*>\s*</script>}{}gs' "$DIST/index.html"
fi

# SPA yönlendirmesi + Jekyll'i kapat
cp "$DIST/index.html" "$DIST/404.html"
touch "$DIST/.nojekyll"

# Özel alan adı
if [ -n "${PAGES_DOMAIN:-}" ]; then
  echo "$PAGES_DOMAIN" > "$DIST/CNAME"
fi

echo "hazır: $DIST"
