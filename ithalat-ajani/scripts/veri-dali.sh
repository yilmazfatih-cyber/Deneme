#!/usr/bin/env bash
# Veri dalı (ithalat-ciktilari) yardımcısı. Deponun herhangi bir yerinden çalışır; aynı makinede tekrar
# çalıştırmak güvenlidir (kalıcı oturumda her gün yeniden kullanılır).
#
#   ithalat-ajani/scripts/veri-dali.sh al      dalı $ITHALAT_CIKTI'ye (varsayılan /tmp/ithalat-cikti) taze açar,
#                                              geçmişi ithalat-ajani/veri/ithalat.db'ye kopyalar
#   ithalat-ajani/scripts/veri-dali.sh gonder  veritabanını ve raporlar/*'ı dala yazar, commit + push eder
#
# Push reddedilirse sıfırdan farklı kodla çıkar ve nedenini yazar; sessizce geçmez.
set -euo pipefail

DAL=ithalat-ciktilari
CIKTI=${ITHALAT_CIKTI:-/tmp/ithalat-cikti}
KOK=$(git rev-parse --show-toplevel)
AJAN="$KOK/ithalat-ajani"

al() {
  git -C "$KOK" worktree remove --force "$CIKTI" 2>/dev/null || rm -rf "$CIKTI"
  git -C "$KOK" worktree prune
  if git -C "$KOK" fetch -q origin "+refs/heads/$DAL:refs/remotes/origin/$DAL" 2>/dev/null; then
    git -C "$KOK" worktree add -q --detach "$CIKTI" "origin/$DAL"
  else
    echo "Uzak depoda $DAL dalı yok; boş başlangıç kuruluyor."
    bos=$(git -C "$KOK" commit-tree -m "ithalat çıktıları: boş başlangıç" "$(git -C "$KOK" hash-object -t tree /dev/null)")
    git -C "$KOK" worktree add -q --detach "$CIKTI" "$bos"
  fi
  mkdir -p "$AJAN/veri" "$AJAN/raporlar"
  if [ -f "$CIKTI/veri/ithalat.db" ]; then
    cp "$CIKTI/veri/ithalat.db" "$AJAN/veri/ithalat.db"
    echo "Geçmiş alındı: $(git -C "$CIKTI" log -1 --format='%h %s')"
  else
    rm -f "$AJAN/veri/ithalat.db"
    echo "Önceki veritabanı yok; yenisi kurulacak."
  fi
}

gonder() {
  [ -e "$CIKTI/.git" ] || { echo "Önce: $0 al" >&2; exit 2; }
  [ -f "$AJAN/veri/ithalat.db" ] || { echo "ithalat-ajani/veri/ithalat.db yok: önce degerlendir çalışmalı" >&2; exit 2; }
  mkdir -p "$CIKTI/veri" "$CIKTI/raporlar"
  cp "$AJAN/veri/ithalat.db" "$CIKTI/veri/ithalat.db"
  if compgen -G "$AJAN/raporlar/*" >/dev/null; then cp "$AJAN"/raporlar/* "$CIKTI/raporlar/"; fi
  cd "$CIKTI"
  git add -A
  if git diff --cached --quiet; then
    echo "Değişiklik yok; gönderilecek bir şey yok."
    return 0
  fi
  git commit -q -m "ithalat taraması: $(TZ=Europe/Istanbul date '+%Y-%m-%d %H:%M')"
  hata=$(mktemp)
  for deneme in 1 2 3; do
    if git push -q origin "HEAD:refs/heads/$DAL" 2>"$hata"; then
      echo "Gönderildi: $DAL $(git rev-parse --short HEAD)"
      return 0
    fi
    if grep -qiE "non-fast-forward|fetch first|rejected" "$hata"; then
      # Uzakta yeni commit var: üstüne al. Veritabanı çakışırsa bizim sürümümüz kalır (en yeni tarama bizde).
      git fetch -q origin "+refs/heads/$DAL:refs/remotes/origin/$DAL"
      git rebase -q -X theirs "origin/$DAL" || { git rebase --abort; break; }
    else
      sleep $((deneme * 4))
    fi
  done
  echo "PUSH BAŞARISIZ ($DAL). Git çıktısı:" >&2
  cat "$hata" >&2
  echo "Olası neden: bu oturumda depoya yazma yetkisi yok (zamanlanmış görev depo kaynağı olan bir oturuma bağlı olmalı)." >&2
  exit 3
}

case "${1:-}" in
  al) al ;;
  gonder) gonder ;;
  *)
    echo "Kullanım: $0 al|gonder" >&2
    exit 2
    ;;
esac
