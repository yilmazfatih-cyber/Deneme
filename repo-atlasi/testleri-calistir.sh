#!/usr/bin/env bash
# Repo Atlası: tüm mini uygulamaların (dallar/*/*/sifirdan) ve MVP'lerin (is-fikirleri/0*) testlerini çalıştırır.
#
# Kullanım:
#   bash repo-atlasi/testleri-calistir.sh            # hepsi
#   bash repo-atlasi/testleri-calistir.sh react n8n  # yalnızca yolunda bu sözcükler geçenler
#
# Gerekenler: Python 3.11+ (numpy yalnızca D05 minileri için), Node.js 22+, Go 1.22+, Rust/cargo, gcc + nasm + make,
# bash. Bir araç yoksa ilgili test "ATLANDI" olarak raporlanır. Testler internete çıkmaz.
set -u
cd "$(dirname "$0")" || exit 2

GECICI="$(mktemp -d)"
trap 'rm -rf "$GECICI"' EXIT
export PYTHONDONTWRITEBYTECODE=1
export CARGO_TARGET_DIR="$GECICI/cargo-target"

# klasör | komut | gereken araç
LISTE='
dallar/01-web-arayuzu/you-dont-know-js/sifirdan|npm test --silent|node
dallar/01-web-arayuzu/vue3-core/sifirdan|npm test --silent|node
dallar/01-web-arayuzu/vue2/sifirdan|npm test --silent|node
dallar/01-web-arayuzu/react/sifirdan|npm test --silent|node
dallar/01-web-arayuzu/bootstrap/sifirdan|npm test --silent|node
dallar/02-uygulama-platformlari/ohmyzsh/sifirdan|bash test.sh|bash
dallar/02-uygulama-platformlari/developer-roadmap/sifirdan|npm test --silent|node
dallar/02-uygulama-platformlari/freecodecamp/sifirdan|npm test --silent|node
dallar/02-uygulama-platformlari/vscode/sifirdan|npm test --silent|node
dallar/02-uygulama-platformlari/flutter/sifirdan|npm test --silent|node
dallar/03-sistem-ag-guvenlik/the-book-of-secret-knowledge/sifirdan|python3 -m unittest discover -s tests -t .|python3
dallar/03-sistem-ag-guvenlik/freedomain/sifirdan|python3 -m unittest discover -s tests -t .|python3
dallar/03-sistem-ag-guvenlik/linux/sifirdan|make test && make clean|make
dallar/03-sistem-ag-guvenlik/rea/sifirdan|python3 -m unittest discover -s tests -t .|python3
dallar/03-sistem-ag-guvenlik/microsoft-activation-scripts/sifirdan|python3 -m unittest discover -s tests -t .|python3
dallar/04-veri-araclari-otomasyon/public-apis/sifirdan|python3 -m unittest discover -s tests -t .|python3
dallar/04-veri-araclari-otomasyon/markitdown/sifirdan|python3 -m unittest discover -s tests -t .|python3
dallar/04-veri-araclari-otomasyon/yt-dlp/sifirdan|python3 -m unittest discover -s tests -t .|python3
dallar/04-veri-araclari-otomasyon/firecrawl/sifirdan|node --test|node
dallar/04-veri-araclari-otomasyon/n8n/sifirdan|node --test|node
dallar/05-yapay-zeka-altyapisi/tensorflow/sifirdan|python3 -m unittest discover -s tests -t .|python3
dallar/05-yapay-zeka-altyapisi/transformers/sifirdan|python3 -m unittest discover -s tests -t .|python3
dallar/05-yapay-zeka-altyapisi/ollama/sifirdan|go test ./...|go
dallar/05-yapay-zeka-altyapisi/mirofish/sifirdan|python3 -m unittest discover -s tests -t .|python3
dallar/06-ajan-platformlari/autogpt/sifirdan|python3 -m unittest discover -s tests -t .|python3
dallar/06-ajan-platformlari/hermes-agent/sifirdan|python3 -m unittest discover -s tests -t .|python3
dallar/06-ajan-platformlari/openclaw/sifirdan|node --test|node
dallar/07-kodlama-ajanlari/opencode/sifirdan|node --test|node
dallar/07-kodlama-ajanlari/deepseek-harness/sifirdan|node --test|node
dallar/07-kodlama-ajanlari/claw-code/sifirdan|cargo test --offline --quiet; s=$?; rm -f Cargo.lock; exit $s|cargo
dallar/08-ajan-becerileri/anthropic-skills/sifirdan|python3 -m unittest discover -s testler -t .|python3
dallar/08-ajan-becerileri/karpathy-skills/sifirdan|python3 -m unittest discover -s testler -t .|python3
dallar/08-ajan-becerileri/mattpocock-skills/sifirdan|python3 -m unittest discover -s testler -t .|python3
dallar/08-ajan-becerileri/superpowers/sifirdan|python3 -m unittest discover -s testler -t .|python3
dallar/08-ajan-becerileri/ecc/sifirdan|npm test --silent|node
dallar/09-bilgisayar-bilimi/thealgorithms-python/sifirdan|python3 -m unittest discover -s testler -t .|python3
dallar/09-bilgisayar-bilimi/javascript-algorithms/sifirdan|npm test --silent|node
dallar/09-bilgisayar-bilimi/coding-interview-university/sifirdan|python3 -m unittest discover -s testler -t .|python3
dallar/09-bilgisayar-bilimi/ossu-computer-science/sifirdan|python3 -m unittest discover -s testler -t .|python3
dallar/09-bilgisayar-bilimi/system-design-primer/sifirdan|python3 -m unittest discover -s tests -t .|python3
dallar/10-kuratorluk-topluluk/awesome/sifirdan|python3 -m unittest discover -s tests -t .|python3
dallar/10-kuratorluk-topluluk/awesome-go/sifirdan|go test ./...|go
dallar/10-kuratorluk-topluluk/awesome-selfhosted/sifirdan|python3 -m unittest discover -s tests -t .|python3
dallar/10-kuratorluk-topluluk/hellogithub/sifirdan|npm test --silent|node
is-fikirleri/01-ihale-analizci|python3 -m unittest discover -s tests -t .|python3
is-fikirleri/02-ders-notu|python3 -m unittest discover -s tests -t .|python3
is-fikirleri/03-fiyat-radar|python3 -m unittest discover -s tests -t .|python3
is-fikirleri/04-esnaf-asistani|python3 -m unittest discover -s tests -t .|python3
is-fikirleri/05-ajan-kurulum-paketi|python3 -m unittest discover -s tests -t .|python3
is-fikirleri/06-mesai-hesap|node --test|node
'

gecen=0 kalan=0 atlanan=0
kirik=()
while IFS='|' read -r klasor komut arac; do
  [ -z "$klasor" ] && continue
  if [ "$#" -gt 0 ]; then
    eslesti=0
    for s in "$@"; do case "$klasor" in *"$s"*) eslesti=1 ;; esac; done
    [ "$eslesti" -eq 0 ] && continue
  fi
  if ! command -v "$arac" >/dev/null 2>&1; then
    printf 'ATLANDI  %-62s (%s yok)\n' "$klasor" "$arac"
    atlanan=$((atlanan + 1))
    continue
  fi
  gunluk="$GECICI/$(echo "$klasor" | tr '/' '_').log"
  if (cd "$klasor" && timeout 600 bash -c "$komut" </dev/null) >"$gunluk" 2>&1; then
    printf 'GEÇTİ    %s\n' "$klasor"
    gecen=$((gecen + 1))
  else
    printf 'KALDI    %s\n' "$klasor"
    tail -n 15 "$gunluk" | sed 's/^/         | /'
    kalan=$((kalan + 1))
    kirik+=("$klasor")
  fi
  find "$klasor" -name __pycache__ -type d -prune -exec rm -rf {} + 2>/dev/null
done <<<"$LISTE"

echo
echo "Özet: $gecen geçti, $kalan kaldı, $atlanan atlandı."
[ "$kalan" -eq 0 ] || { printf 'Kalanlar:\n'; printf '  %s\n' "${kirik[@]}"; exit 1; }
