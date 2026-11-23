#!/usr/bin/env bash
# Siteyi derler, yeni bir sürüm klasörüne kopyalar ve "current" bağlantısını TEK ADIMDA yeni sürüme çevirir
# (Caddy /srv/site/current'ı sunar; ziyaretçi yarım kopyalanmış site görmez). Son 5 sürüm kalır.
# Geri dönüş: ln -sfn /srv/site/surumler/<eski-sürüm> /srv/site/current  (yeniden derleme gerekmez)
# Ortam: SITE_URL (zorunlu, ör. https://ornek.com) · SITE_KAYNAK (site temelinin klasörü; varsayılan
#        bu betiğin ../site'ı) · SITE_HEDEF (varsayılan /srv/site) · ATLA_NPM_CI=1 (bağımlılıklar kuruluysa).
# Formun API adresi gibi derleme ayarları da ortamdan gelir (ör. PUBLIC_FORM_ENDPOINT).
set -euo pipefail

: "${SITE_URL:?SITE_URL verin (ör. SITE_URL=https://ornek.com)}"
kaynak="${SITE_KAYNAK:-$(cd "$(dirname "$0")/../site" && pwd)}"
hedef="${SITE_HEDEF:-/srv/site}"
surum="$(date -u +%Y%m%d-%H%M%S)"
if [ -e "$hedef/surumler/$surum" ]; then
  surum="$surum-$$"
fi

cd "$kaynak"
if [ "${ATLA_NPM_CI:-0}" != "1" ]; then
  npm ci
fi
SITE_URL="$SITE_URL" npm run build

mkdir -p "$hedef/surumler"
cp -a dist "$hedef/surumler/$surum"
ln -sfn "$hedef/surumler/$surum" "$hedef/current.yeni"
mv -Tf "$hedef/current.yeni" "$hedef/current"
echo "Yayında: $hedef/current -> surumler/$surum"

# Son 5 sürüm kalır (ad = zaman damgası, ada göre sıralı).
find "$hedef/surumler" -mindepth 1 -maxdepth 1 -type d | sort -r | tail -n +6 | while read -r eski; do
  rm -rf -- "$eski"
  echo "Silindi (eski sürüm): $eski"
done
