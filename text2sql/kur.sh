#!/usr/bin/env bash
# text2sql kurulumu (Linux / macOS). Tekrar tekrar çalıştırılabilir; yapılmış adımlar atlanır.
#
#   ./kur.sh                    varsayılan profil (qwen: qwen2.5-coder:1.5b)
#   ./kur.sh --profil slm-sql   başka bir model profili (qwen | slm-sql | prem | buyuk); ya da MODEL_PROFIL=slm-sql
#   ./kur.sh --ollamasiz        yalnızca Python kısmı (llama.cpp ile kullanacaksanız)
#   ./kur.sh --evet             soruları "evet" say (Linux'ta Ollama kurulumu dahil)
#
# Çıkış kodları: 0 tamam · 10 Python yok/eski · 11 sanal ortam/pip hatası · 12 Ollama yok
#                13 Ollama sunucusu başlamadı · 14 model indirme/oluşturma hatası · 15 örnek veritabanı hatası
#                20 deneme sorusu başarısız · 2 yanlış argüman
set -euo pipefail

cd "$(dirname "$0")"
PROFIL="${MODEL_PROFIL:-}"
OLLAMASIZ=0
EVET=0
while [ $# -gt 0 ]; do
  case "$1" in
    --profil) PROFIL="${2:-}"; shift 2 || { echo "--profil bir ad ister"; exit 2; } ;;
    --profil=*) PROFIL="${1#*=}"; shift ;;
    --ollamasiz) OLLAMASIZ=1; shift ;;
    --evet|-y) EVET=1; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "Bilinmeyen argüman: $1 (yardım: ./kur.sh --help)"; exit 2 ;;
  esac
done
PROFIL="${PROFIL:-qwen}"

adim() { printf '\n== %s\n' "$1"; }
hata() { printf 'HATA: %s\n' "$1" >&2; exit "$2"; }
sor() { # sor "soru" -> 0 evet, 1 hayır
  if [ "$EVET" = 1 ]; then return 0; fi
  if [ ! -t 0 ]; then return 1; fi
  printf '%s [e/H] ' "$1"; read -r yanit
  case "$yanit" in e|E|evet|Evet|y|Y) return 0 ;; *) return 1 ;; esac
}

# 1) Python ------------------------------------------------------------------
adim "1/6 Python denetleniyor"
PYTHON=""
for aday in python3 python; do
  if command -v "$aday" >/dev/null 2>&1 && "$aday" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
    PYTHON="$aday"; break
  fi
done
[ -n "$PYTHON" ] || hata "Python 3.10 ya da üstü bulunamadı. Kurun: https://www.python.org/downloads/ (Linux: paket yöneticiniz, ör. sudo apt install python3 python3-venv)" 10
echo "Bulundu: $("$PYTHON" --version)"

# 2) Sanal ortam ve paket -------------------------------------------------------
adim "2/6 Sanal ortam (.venv) ve paket"
if [ -e .venv ] && ! .venv/bin/python -m pip --version >/dev/null 2>&1; then
  echo "Yarım kalmış .venv bulundu (pip çalışmıyor); silinip yeniden oluşturuluyor."
  rm -rf .venv
fi
if [ ! -x .venv/bin/python ]; then
  "$PYTHON" -m venv .venv || { rm -rf .venv; hata "Sanal ortam oluşturulamadı. Debian/Ubuntu'da: sudo apt install python3-venv, sonra betiği yeniden çalıştırın." 11; }
  .venv/bin/python -m pip --version >/dev/null 2>&1 || { rm -rf .venv; hata "Sanal ortamda pip yok. Debian/Ubuntu'da: sudo apt install python3-venv, sonra betiği yeniden çalıştırın." 11; }
  rm -f .venv/.kurulu
fi
PY=.venv/bin/python
if [ ! -f .venv/.kurulu ] || [ pyproject.toml -nt .venv/.kurulu ]; then
  "$PY" -m pip install --quiet --upgrade pip || hata "pip güncellenemedi (internet bağlantısını denetleyin)" 11
  "$PY" -m pip install --quiet -e . || hata "Paket kurulamadı: pip install -e ." 11
  touch .venv/.kurulu
else
  echo "Paket zaten kurulu."
fi
T2S=.venv/bin/text2sql
"$PY" -m text2sql.config --profil "$PROFIL" model >/dev/null || hata "Profil tanınmadı: $PROFIL (qwen, slm-sql, prem, buyuk)" 2
MODEL="$("$PY" -m text2sql.config --profil "$PROFIL" model)"
BASE="$("$PY" -m text2sql.config --profil "$PROFIL" base_model)"
GGUF="$("$PY" -m text2sql.config --profil "$PROFIL" gguf_path)"
HOST="$("$PY" -m text2sql.config ollama_host)"
echo "Profil: $PROFIL · Ollama modeli: $MODEL · taban: ${BASE:-yerel GGUF ($GGUF)}"

# 3) Örnek veritabanı ----------------------------------------------------------
adim "3/6 Örnek veritabanı"
"$T2S" ornek-db || hata "Örnek veritabanı oluşturulamadı" 15

if [ "$OLLAMASIZ" = 1 ]; then
  adim "Ollama adımları atlandı (--ollamasiz)"
  "$T2S" bilgi --backend sahte
  "$T2S" sor --backend sahte --db ornek/dukkan.sqlite "Kaç müşteri var?" || hata "Deneme sorusu çalışmadı" 20
  echo; echo "Python kısmı hazır. llama.cpp için: .venv/bin/pip install -e \".[gguf]\" (README: Model değiştirme)"
  exit 0
fi

# 4) Ollama --------------------------------------------------------------------
adim "4/6 Ollama denetleniyor"
if ! command -v ollama >/dev/null 2>&1; then
  echo "Ollama kurulu değil. İndirme sayfası: https://ollama.com/download"
  if [ "$(uname -s)" = "Linux" ]; then
    echo "Resmi kurulum betiği: curl -fsSL https://ollama.com/install.sh | sh"
    if sor "Resmi kurulum betiği şimdi çalıştırılsın mı?"; then
      command -v curl >/dev/null 2>&1 || hata "curl bulunamadı (sudo apt install curl)" 12
      curl -fsSL https://ollama.com/install.sh | sh || hata "Ollama kurulamadı" 12
    fi
  else
    echo "macOS: uygulamayı indirip açın ya da: brew install ollama"
  fi
  command -v ollama >/dev/null 2>&1 || hata "Ollama kurulduktan sonra bu betiği yeniden çalıştırın." 12
fi
echo "Bulundu: $(ollama --version 2>/dev/null | head -n1)"

ollama_hazir() { "$PY" -c "import sys; from text2sql.backends import OllamaBackend as O; sys.exit(0 if O('x', '$HOST').version(2) else 1)"; }
if ! ollama_hazir; then
  echo "Ollama sunucusu çalışmıyor; arka planda başlatılıyor (günlük: .ollama-serve.log)"
  nohup ollama serve >.ollama-serve.log 2>&1 &
  for _ in $(seq 1 30); do ollama_hazir && break; sleep 1; done
  ollama_hazir || hata "Ollama sunucusu başlamadı. Elle deneyin: ollama serve  (günlük: .ollama-serve.log)" 13
fi
echo "Ollama sunucusu hazır: $HOST"

# 5) Model ---------------------------------------------------------------------
adim "5/6 Model ($MODEL)"
if [ -n "$BASE" ]; then
  if ollama show "$BASE" >/dev/null 2>&1; then
    echo "Taban model zaten var: $BASE"
  else
    echo "İndiriliyor: $BASE (bir kez; boyut README'deki tabloda)"
    ollama pull "$BASE" || hata "İndirilemedi: $BASE" 14
  fi
else
  if [ ! -f "$GGUF" ]; then
    echo "Bu profil yerel bir GGUF dosyası ister: $GGUF"
    echo "Kaynak: $("$PY" -m text2sql.config --profil "$PROFIL" gguf_source)"
    hata "Dosyayı indirip bu yola koyun (ya da TEXT2SQL_GGUF ile yolunu, TEXT2SQL_BASE_MODEL ile bir Ollama etiketi verin), sonra yeniden çalıştırın." 14
  fi
  echo "Yerel GGUF: $GGUF"
fi
"$PY" -m text2sql.config --profil "$PROFIL" modelfile_text >.Modelfile.olusan
# Model aynı Modelfile ile zaten oluşturulduysa atla (yerel GGUF'ta her seferinde GB'larca kopya oluşmasın)
ISARET=".olusan-$(printf %s "$MODEL" | tr -c 'A-Za-z0-9._-' '_').Modelfile"
if ollama show "$MODEL" >/dev/null 2>&1 && [ -f "$ISARET" ] && cmp -s .Modelfile.olusan "$ISARET"; then
  echo "Ollama modeli güncel: $MODEL"
else
  ollama create "$MODEL" -f .Modelfile.olusan || hata "ollama create başarısız (Modelfile: .Modelfile.olusan)" 14
  cp .Modelfile.olusan "$ISARET"
fi

# 6) Deneme --------------------------------------------------------------------
adim "6/6 Deneme"
"$T2S" bilgi --profil "$PROFIL"
echo
"$T2S" sor --profil "$PROFIL" --db ornek/dukkan.sqlite "Kaç müşteri var?" || hata "Deneme sorusu çalışmadı. 'text2sql bilgi' çıktısına ve README'deki Sorun giderme bölümüne bakın." 20

cat <<SON

Kurulum tamam. Kullanmak için (her yeni terminalde önce etkinleştirin):
  source .venv/bin/activate
  text2sql sor --db ornek/dukkan.sqlite "İstanbul'daki müşteriler kimler?"
  text2sql sohbet --db ornek/dukkan.sqlite
SON
[ "$PROFIL" = qwen ] || echo "  (profil seçimi kalıcı olsun diye: export TEXT2SQL_PROFIL=$PROFIL)"
