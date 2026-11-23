#!/usr/bin/env bash
# Sağlık denetimi: /api/health üç denemede yanıt vermezse uygulamayı yeniden başlatır.
# Çalıştıran: uygulama-saglik.timer (5 dakikada bir). Elle: sudo /srv/proje/yayin/saglik.sh
# Ortam: SAGLIK_URL (varsayılan http://127.0.0.1:8310/api/health), SAGLIK_BEKLEME (denemeler arası sn, 5),
#        SAGLIK_YENIDEN_BASLAT (varsayılan "systemctl restart uygulama.service"; testte başka komut verilir).
# Çıkış kodu: 0 sağlıklı, 1 yeniden başlatıldı (journalctl -u uygulama-saglik ile görülür).
set -euo pipefail

url="${SAGLIK_URL:-http://127.0.0.1:8310/api/health}"
bekleme="${SAGLIK_BEKLEME:-5}"
yeniden_baslat="${SAGLIK_YENIDEN_BASLAT:-systemctl restart uygulama.service}"

for deneme in 1 2 3; do
  if curl --fail --silent --show-error --max-time 5 --output /dev/null "$url"; then
    exit 0
  fi
  if [ "$deneme" -lt 3 ]; then
    sleep "$bekleme"
  fi
done

echo "sağlık denetimi başarısız ($url, 3 deneme); uygulama yeniden başlatılıyor" >&2
sh -c "$yeniden_baslat"
exit 1
