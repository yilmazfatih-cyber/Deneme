#!/usr/bin/env bash
# Uygulamayı güncelleme: yedek → kod → bağımlılık → web derlemesi → yeniden başlatma → sağlık denetimi.
# Proje klasörünün sahibi olan kullanıcıyla çalıştırın (git "dubious ownership" vermesin); systemctl adımları
# sudo ister:  cd /srv/proje && yayin/guncelle.sh
# Bir adım başarısız olursa durur (set -e). Geri dönüş: tarifin README'si → "Güncelleme ve geri dönüş".
# DOĞRULAMA DURUMU: bu betik bu ortamda uçtan uca DENENMEDİ (systemd ve uzak git deposu yoktu); yalnız
# söz dizimi (bash -n) denetlendi. İlk kullanımda adım adım izleyin.
set -euo pipefail

proje="${PROJE:-$(cd "$(dirname "$0")/.." && pwd)}"
saglik="${SAGLIK_URL:-http://127.0.0.1:8310/api/health}"

echo "1/6 yedek alınıyor (uygulama-yedek.service)"
sudo systemctl start uygulama-yedek.service

echo "2/6 kod güncelleniyor"
git -C "$proje" pull --ff-only

echo "3/6 bağımlılıklar (kilit dosyasından)"
(cd "$proje/uygulama" && npm ci)

echo "4/6 web derleniyor"
(cd "$proje/uygulama" && npm run build)

echo "5/6 yeniden başlatılıyor (yeni migrasyonlar açılışta uygulanır)"
sudo systemctl restart uygulama.service

echo "6/6 sağlık denetimi"
for _ in $(seq 1 30); do
  if curl --fail --silent --max-time 3 --output /dev/null "$saglik"; then
    echo "Güncelleme tamam."
    exit 0
  fi
  sleep 2
done
echo "Sağlık denetimi geçmedi. Günlük: journalctl -u uygulama -n 100 --no-pager" >&2
echo "Geri dönüş: README → 'Güncelleme ve geri dönüş' (önceki kayda dön + yedekten geri yükle)." >&2
exit 1
