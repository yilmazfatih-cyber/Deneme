#!/usr/bin/env bash
# Yerel AI Platformu — sunucuyu başlatır ve arayüzü tarayıcıda açar (macOS ve Linux).
#
#   ./scripts/baslat.sh                 http://127.0.0.1:8080 (yalnız bu bilgisayar, giriş gerekmez)
#   ./scripts/baslat.sh --tarayicisiz   tarayıcıyı açma
#   AIP_PORT=8090 ./scripts/baslat.sh   başka port
#
# Önce bir kez ./scripts/kur.sh çalıştırılmış olmalı.

set -euo pipefail

BROWSER=1
for arg in "$@"; do
  case "$arg" in
    --tarayicisiz) BROWSER=0 ;;
    -h | --help | --yardim)
      sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Bilinmeyen seçenek: $arg" >&2
      exit 2
      ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AIP="$ROOT/.venv/bin/aiplatform"
if [ ! -x "$AIP" ]; then
  echo "Platform kurulu değil. Önce: $ROOT/scripts/kur.sh" >&2
  exit 1
fi

PORT="${AIP_PORT:-8080}"
HOST="${AIP_HOST:-127.0.0.1}"
URL="http://127.0.0.1:${PORT}"

if [ "$BROWSER" = 1 ]; then
  # sunucu hazır olunca Demo ERP sayfasını aç (arka planda bekler)
  (
    for _ in $(seq 1 180); do  # kurulumdan sonraki ilk açılış (soğuk önbellek) ~70 sn sürebilir
      if curl -sf "$URL/api/system/health" >/dev/null 2>&1; then
        if command -v open >/dev/null 2>&1; then
          open "$URL/#/demo"
        elif command -v xdg-open >/dev/null 2>&1; then
          xdg-open "$URL/#/demo" >/dev/null 2>&1
        fi
        exit 0
      fi
      sleep 1
    done
  ) &
fi

echo "Yerel AI Platformu: $URL  (durdurmak için Ctrl+C)"
echo "Demo ERP: $URL/#/demo → 'Demo verisini kur'"
exec "$AIP" serve --host "$HOST" --port "$PORT"
