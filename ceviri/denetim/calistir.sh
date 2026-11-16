#!/usr/bin/env bash
# Çeviri uygulamasının Xcode gerektirmeyen denetimi.
#
#  1. Çekirdek testleri: CeviriApp.swift içindeki ">>> CEKIRDEK … <<< CEKIRDEK" bölümü (cümle bölme, WAV onarımı)
#     yalnızca Foundation ile derlenir ve cekirdek_testi.swift ile sınanır.
#  2. Tip denetimi: uygulamanın tamamı, Apple çatılarının taklitlerine (denetim/taklit) karşı
#     Swift 5, Swift 5 + tam eşzamanlılık denetimi ve Swift 6 kiplerinde derlenir. Swift 6.2 ve üstünde
#     Xcode 26'nın yeni proje ayarları da (MainActor varsayılanı + "Approachable Concurrency") denenir.
#     Taklitler gerçek SDK'nın yerini tutmaz; gerçek derleme yine Xcode'da yapılır.
#
# Kullanım (depo kökünden):
#   ceviri/denetim/calistir.sh
#   SWIFT_IMAJLARI="swift:6.0 swift:6.2 swift:latest" ceviri/denetim/calistir.sh
#
# Linux'ta swiftc varsa doğrudan çalışır; yoksa Docker'daki resmî swift imajlarını kullanır.
# macOS'ta taklitler gerçek çatılarla çakışacağı için yalnızca çekirdek testleri çalışır.
set -euo pipefail

KOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$KOK"

icerde() {
  local surum gecici hata=0
  surum="$(swiftc --version 2>&1 | sed -n 's/.*Swift version \([0-9][0-9]*\.[0-9][0-9]*\).*/\1/p' | head -n 1)"
  gecici="$(mktemp -d)"
  trap 'rm -rf "$gecici"' RETURN
  echo "── Swift $surum"

  # 1) Çekirdek testleri
  mkdir -p "$gecici/cekirdek"
  {
    echo 'import Foundation'
    sed -n '/^\/\/ >>> CEKIRDEK/,/^\/\/ <<< CEKIRDEK/p' Ceviri/CeviriApp.swift
  } > "$gecici/cekirdek/Cekirdek.swift"
  cp denetim/cekirdek_testi.swift "$gecici/cekirdek/main.swift"
  if swiftc -O "$gecici/cekirdek/Cekirdek.swift" "$gecici/cekirdek/main.swift" -o "$gecici/cekirdek/test" 2>"$gecici/cekirdek/derleme.txt"; then
    "$gecici/cekirdek/test" || hata=1
  else
    echo "✗ çekirdek derlenemedi"
    sed -n '1,40p' "$gecici/cekirdek/derleme.txt"
    hata=1
  fi

  if [[ "$(uname -s)" != "Linux" ]]; then
    echo "  (tip denetimi yalnızca Linux'ta; macOS'ta projeyi Xcode'da derleyin)"
    return "$hata"
  fi

  # 2) Taklit modüller: biri gerçek SDK'daki gibi Sendable geri çağrılarla, biri Sendable olmayanlarla.
  local modul
  taklitleri_derle() {
    local dizin=$1
    shift
    mkdir -p "$dizin"
    for modul in Combine SwiftUI AVFoundation UIKit Security Speech Translation; do
      if ! swiftc -emit-module -parse-as-library -module-name "$modul" -swift-version 5 -I "$dizin" "$@" \
        "denetim/taklit/$modul.swift" -emit-module-path "$dizin/$modul.swiftmodule" 2>"$dizin/$modul.txt"; then
        echo "✗ taklit $modul derlenemedi"
        sed -n '1,30p' "$dizin/$modul.txt"
        return 1
      fi
    done
  }
  taklitleri_derle "$gecici/sdk" || return 1
  taklitleri_derle "$gecici/sdk-eski" -D TAP_SENDABLE_DEGIL -D GERI_CAGRI_SENDABLE_DEGIL || return 1

  denetle() {
    local baslik=$1 dizin=$2 cikti uyarilar
    shift 2
    # -emit-sil: tip denetiminden sonra Swift 6'nın veri yarışı (region isolation) denetimleri de çalışır.
    if cikti="$(swiftc -emit-sil -o /dev/null -parse-as-library -I "$dizin" "$@" Ceviri/CeviriApp.swift 2>&1)"; then
      uyarilar="$(grep -E ': warning: ' <<<"$cikti" | sed 's|^.*/CeviriApp.swift:|CeviriApp.swift:|' | sort -u || true)"
      if [[ -z "$uyarilar" ]]; then
        echo "✓ $baslik"
      else
        echo "✓ $baslik — $(wc -l <<<"$uyarilar") uyarı"
        sed 's/^/    /' <<<"$uyarilar"
      fi
    else
      echo "✗ $baslik"
      grep -E ': (error|warning): |^ *\|' <<<"$cikti" | sed 's|^.*/CeviriApp.swift:|CeviriApp.swift:|' | sed -n '1,80p'
      hata=1
    fi
  }

  local yeni_ayarlar=() yaklasilabilir=()
  if [[ "$(printf '%s\n6.2\n' "$surum" | sort -V | head -n 1)" == "6.2" ]]; then
    yeni_ayarlar=(-default-isolation MainActor
      -enable-upcoming-feature NonisolatedNonsendingByDefault
      -enable-upcoming-feature InferIsolatedConformances
      -enable-upcoming-feature MemberImportVisibility)
    yaklasilabilir=(-enable-upcoming-feature InferSendableFromCaptures
      -enable-upcoming-feature GlobalActorIsolatedTypesUsability
      -enable-upcoming-feature DisableOutwardActorInference)
  fi

  denetle "Swift 5 kipi (hazır projenin ayarı)" "$gecici/sdk" -swift-version 5
  denetle "Swift 5 + tam eşzamanlılık denetimi" "$gecici/sdk" -swift-version 5 -strict-concurrency=complete
  denetle "Swift 6 kipi" "$gecici/sdk" -swift-version 6
  denetle "Swift 6 kipi, Sendable olmayan geri çağrılar" "$gecici/sdk-eski" -swift-version 6
  if ((${#yeni_ayarlar[@]})); then
    denetle "Swift 5 + Xcode 26 yeni proje ayarları" "$gecici/sdk" -swift-version 5 "${yeni_ayarlar[@]}" "${yaklasilabilir[@]}"
    denetle "Swift 6 + Xcode 26 yeni proje ayarları" "$gecici/sdk" -swift-version 6 "${yeni_ayarlar[@]}"
    denetle "Swift 6 + Xcode 26 ayarları, Sendable olmayan geri çağrılar" "$gecici/sdk-eski" -swift-version 6 "${yeni_ayarlar[@]}"
  fi
  return "$hata"
}

if [[ "${1:-}" == "--icerde" ]]; then
  icerde
  exit $?
fi

if command -v swiftc >/dev/null 2>&1; then
  icerde
elif command -v docker >/dev/null 2>&1; then
  sonuc=0
  for imaj in ${SWIFT_IMAJLARI:-swift:6.2}; do
    docker run --rm -v "$KOK":/ceviri:ro -w /ceviri "$imaj" bash denetim/calistir.sh --icerde || sonuc=1
  done
  exit "$sonuc"
else
  echo "swiftc ya da docker bulunamadı." >&2
  exit 1
fi
