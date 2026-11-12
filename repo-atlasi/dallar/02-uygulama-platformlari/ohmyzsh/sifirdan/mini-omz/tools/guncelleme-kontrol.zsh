# tools/guncelleme-kontrol.zsh — açılışta "güncelleme zamanı geldi mi?" denetimi.
# Gerçek karşılığı: tools/check_for_upgrade.sh (+ tools/upgrade.sh).
#
# Ayarlar (~/.zshrc içinde, mini-omz.sh'den önce):
#   zstyle ':mini-omz:update' mode disabled|reminder|auto   (varsayılan: reminder)
#   zstyle ':mini-omz:update' frequency 13                   (gün)
#
# Farklar: gerçek Oh My Zsh uzak HEAD'i GitHub API'sine curl ile sorar ve "prompt" modunda kullanıcıya
# sorar; biz `git ls-remote` kullanıyoruz (yerel bir yalın depoyla çevrimdışı test edilebilsin diye).

zmodload zsh/datetime

# Güncelleme var mı? 0 = var, 1 = yok ya da bilinemiyor.
_mini_guncelleme_var_mi() {
  local kok
  kok=$(command git -C "$MINI_OMZ" rev-parse --show-toplevel 2>/dev/null) || return 1
  # Güvenlik: MINI_OMZ başka bir deponun alt klasörüyse o depoyu "güncellemeye" kalkma.
  [[ "${kok:A}" == "${MINI_OMZ:A}" ]] || return 1

  local dal yerel uzak
  dal=$(command git -C "$MINI_OMZ" config --get mini-omz.branch) \
    || dal=$(command git -C "$MINI_OMZ" symbolic-ref --short HEAD 2>/dev/null) || return 1
  yerel=$(command git -C "$MINI_OMZ" rev-parse "$dal" 2>/dev/null) || return 1
  uzak=$(GIT_TERMINAL_PROMPT=0 command git -C "$MINI_OMZ" ls-remote origin "refs/heads/$dal" 2>/dev/null) || return 1
  uzak=${uzak%%[[:space:]]*}
  [[ -n "$uzak" && "$uzak" != "$yerel" ]] || return 1
  # Uzak commit zaten yerelin atasıysa (yerel önde) güncelleme yok. Uzak commit yerelde hiç yoksa
  # bu komut başarısız olur; o zaman "güncelleme var" kabul ederiz (gerçek kod da böyle düşünür).
  command git -C "$MINI_OMZ" merge-base --is-ancestor "$uzak" "$yerel" 2>/dev/null && return 1
  return 0
}

mini_omz_guncelle() {
  if command git -C "$MINI_OMZ" pull --quiet --ff-only 2>/dev/null; then
    print -r -- "[mini-omz] güncellendi: $(command git -C "$MINI_OMZ" rev-parse --short HEAD)"
  else
    print -u2 -r -- "[mini-omz] güncelleme başarısız (yerel değişiklik ya da ağ sorunu?)"
    return 1
  fi
}

# Anonim fonksiyon: içindeki local değişkenler kabuğa sızmaz.
() {
  local mod siklik bugun son_gun damga kilit
  zstyle -s ':mini-omz:update' mode mod || mod=reminder
  [[ "$mod" == disabled ]] && return 0
  zstyle -s ':mini-omz:update' frequency siklik || siklik=13

  damga="$MINI_OMZ_CACHE/guncelleme-damgasi"
  bugun=$(( EPOCHSECONDS / 86400 ))

  # İlk açılış ya da bozuk damga: bugünü yaz, bu sefer denetleme.
  if [[ ! -r "$damga" ]]; then
    print -r -- "SON_GUN=$bugun" >| "$damga"
    return 0
  fi
  son_gun=${"$(<$damga)"#SON_GUN=}
  if [[ "$son_gun" != <-> ]]; then
    print -r -- "SON_GUN=$bugun" >| "$damga"
    return 0
  fi
  (( bugun - son_gun < siklik )) && return 0

  # Kilit: aynı anda açılan iki terminal aynı anda güncellemesin. mkdir atomiktir.
  kilit="$MINI_OMZ_CACHE/guncelleme.kilit"
  command mkdir "$kilit" 2>/dev/null || return 0
  {
    if _mini_guncelleme_var_mi; then
      if [[ "$mod" == auto ]]; then
        mini_omz_guncelle
      else
        print -r -- "[mini-omz] yeni sürüm var; güncellemek için: mini_omz guncelle"
      fi
    fi
    print -r -- "SON_GUN=$bugun" >| "$damga"
  } always {
    command rmdir "$kilit" 2>/dev/null
  }
}
