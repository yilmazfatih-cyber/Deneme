#!/usr/bin/env bash
# Yerel AI Platformu — tek komutla kurulum (macOS ve Linux).
#
#   ./scripts/kur.sh            Python ortamını kurar, donanımı tarar, testleri çalıştırır
#   ./scripts/kur.sh --demo     + demo modüllerini kurar ve arayüzü tarayıcıda açar
#
# Seçenekler:
#   --demo          demo modüllerini (KVKK Kalkanı, Finans, Kayıt Eşleştirme, PDF Ayrıştırma) kur ve başlat
#   --testsiz       birim testlerini atla
#   --tarayicisiz   --demo ile: tarayıcıyı açma (yalnız sunucuyu başlat)
#   --yardim        bu metni göster
#
# Ortam değişkenleri (ileri kullanım):
#   AIP_EXTRAS        pip ek grupları (varsayılan: kvkk,belge,gomme,text2sql,erp-sql,dev)
#   AIP_DEMO_MODULES  --demo ile kurulacak modüller (boşlukla ayrılmış)
#   AIP_PORT          sunucu portu (varsayılan 8080)
#
# macOS'taki bash 3.2 ile uyumludur. Kurulum günlüğü: ai-platform/kur.log

set -euo pipefail

DEMO=0
TESTS=1
BROWSER=1
for arg in "$@"; do
  case "$arg" in
    --demo) DEMO=1 ;;
    --testsiz) TESTS=0 ;;
    --tarayicisiz) BROWSER=0 ;;
    --yardim | -h | --help)
      sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Bilinmeyen seçenek: $arg  (yardım için: $0 --yardim)" >&2
      exit 2
      ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG="$ROOT/kur.log"
: >"$LOG"
EXTRAS="${AIP_EXTRAS:-kvkk,belge,gomme,text2sql,erp-sql,dev}"
DEMO_MODULES="${AIP_DEMO_MODULES:-kvkk-kalkani finans-hesap kayit-eslestirme pdf-ayristirma}"

if [ -t 1 ]; then
  B=$'\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; N=$'\033[0m'
else
  B=""; G=""; Y=""; R=""; N=""
fi
step() { printf '\n%s==> %s%s\n' "$B" "$1" "$N"; }
ok() { printf '%s    ✓ %s%s\n' "$G" "$1" "$N"; }
warn() { printf '%s    ! %s%s\n' "$Y" "$1" "$N"; }
fail() {
  printf '\n%s✗ %s%s\n' "$R" "$1" "$N" >&2
  if [ -s "$LOG" ]; then
    printf '\nGünlüğün son satırları (%s):\n' "$LOG" >&2
    tail -n 25 "$LOG" >&2
  fi
  [ -n "${2:-}" ] && printf '\n%s\n' "$2" >&2
  exit 1
}
run() { # komutu günlüğe yazarak çalıştır; hata olursa son satırları göster
  "$@" >>"$LOG" 2>&1
}

OS="$(uname -s)"

# ---------------------------------------------------------------- 1. Python
step "Python 3.11 veya üstü aranıyor"
PY=""
for cand in python3.13 python3.12 python3.11 python3; do
  if command -v "$cand" >/dev/null 2>&1 &&
    "$cand" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null; then
    PY="$(command -v "$cand")"
    break
  fi
done
if [ -z "$PY" ]; then
  if [ "$OS" = "Darwin" ]; then
    fail "Python 3.11+ bulunamadı." "Kurmak için: brew install python@3.12   (Homebrew yoksa: https://brew.sh)"
  else
    fail "Python 3.11+ bulunamadı." "Kurmak için (Ubuntu/Debian): sudo apt install python3.12 python3.12-venv"
  fi
fi
ok "$("$PY" --version) — $PY"

# ---------------------------------------------------------------- 2. Sanal ortam
step "Sanal ortam (.venv) hazırlanıyor"
if [ -x .venv/bin/python ] && .venv/bin/python -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null; then
  ok "mevcut .venv kullanılıyor"
else
  rm -rf .venv
  run "$PY" -m venv .venv || fail "Sanal ortam oluşturulamadı." \
    "Linux'ta genelde eksik paket: sudo apt install python3-venv (veya python3.12-venv)"
  ok ".venv oluşturuldu"
fi
VPY="$ROOT/.venv/bin/python"
run "$VPY" -m pip install --upgrade pip || fail "pip güncellenemedi (internet bağlantısını kontrol edin)."

# ---------------------------------------------------------------- 3. Paketler
step "Platform ve bağımlılıklar kuruluyor ($EXTRAS) — ilk seferde birkaç dakika sürer"
run "$VPY" -m pip install -e ".[${EXTRAS}]" || fail "Paket kurulumu başarısız." \
  "İnternet bağlantısını kontrol edin; şirket ağındaysanız pip için vekil sunucu (HTTPS_PROXY) gerekebilir."
ok "aiplatform $("$VPY" -c 'import aiplatform; print(aiplatform.__version__)') kuruldu"
AIP="$ROOT/.venv/bin/aiplatform"

# ---------------------------------------------------------------- 4. Donanım
step "Donanım taranıyor"
"$AIP" probe || warn "Donanım taraması tamamlanamadı (kurulum yine de sürer)."

# ---------------------------------------------------------------- 5. Testler
if [ "$TESTS" = 1 ]; then
  step "Birim testleri çalışıyor"
  if "$VPY" -m pytest -q -p no:cacheprovider >>"$LOG" 2>&1; then
    ok "$(grep -E '[0-9]+ passed' "$LOG" | tail -n 1)"
  else
    fail "Bazı testler başarısız." "Günlüğü ($LOG) Claude'a yapıştırın."
  fi
fi

# ---------------------------------------------------------------- 6. Demo
if [ "$DEMO" = 1 ]; then
  step "Demo modülleri kuruluyor: $DEMO_MODULES"
  case " $DEMO_MODULES " in
    *" kvkk-kalkani "*) warn "KVKK Kalkanı ilk kurulumda Hugging Face'ten ~1,2 GB model indirir." ;;
  esac
  # shellcheck disable=SC2086 # modül listesi bilerek kelimelere bölünür
  "$AIP" install $DEMO_MODULES 2>&1 | tee -a "$LOG" || fail "Modül kurulumu başarısız."
  ok "modüller kuruldu"
  args=()
  [ "$BROWSER" = 0 ] && args+=("--tarayicisiz")
  echo
  printf '%sKurulum tamam.%s Sunucu başlıyor; durdurmak için Ctrl+C.\n' "$G" "$N"
  printf 'Sonraki seferlerde yalnız: %s./scripts/baslat.sh%s\n' "$B" "$N"
  exec "$ROOT/scripts/baslat.sh" ${args[@]+"${args[@]}"}
fi

echo
printf '%sKurulum tamam.%s\n' "$G" "$N"
printf 'Demo modülleriyle başlatmak için:  %s./scripts/kur.sh --demo%s\n' "$B" "$N"
printf 'Yalnız sunucuyu başlatmak için:     %s./scripts/baslat.sh%s\n' "$B" "$N"
