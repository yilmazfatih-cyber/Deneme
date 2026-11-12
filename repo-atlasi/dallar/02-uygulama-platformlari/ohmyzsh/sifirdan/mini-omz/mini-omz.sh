# mini-omz.sh — Oh My Zsh yükleyicisinin öğretim amaçlı küçük kopyası.
# Gerçek karşılığı: oh-my-zsh.sh (deponun kökünde). Kullanım için templates/zshrc.ornek dosyasına bak.
#
# Yükleme sırası (gerçekteki gibi):
#   1. zsh mi? değilse nazikçe çık        2. dizinler ve önbellek
#   3. güncelleme denetimi                 4. eklenti dizinlerini fpath'e ekle (compinit'ten ÖNCE)
#   5. compinit (tamamlama sistemi)        6. lib/*.zsh → eklentiler → custom/*.zsh → tema

# 1) Bu dosya bash ya da sh ile "source" edilirse POSIX sözdizimiyle uyar ve çık.
[ -n "$ZSH_VERSION" ] || {
  echo "mini-omz yalnızca zsh ile çalışır (şu anki kabuk: $0)" >&2
  return 1 2>/dev/null || exit 1
}

# 2) Konumlar. ${(%):-%x} = şu an kaynaklanan dosyanın yolu; :a mutlak yol, :h üst dizin.
[[ -n "$MINI_OMZ" ]] || export MINI_OMZ="${${(%):-%x}:a:h}"
[[ -n "$MINI_OMZ_CUSTOM" ]] || MINI_OMZ_CUSTOM="$MINI_OMZ/custom"
[[ -n "$MINI_OMZ_CACHE" ]] || MINI_OMZ_CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/mini-omz"
[[ -d "$MINI_OMZ_CACHE/completions" ]] || command mkdir -p "$MINI_OMZ_CACHE/completions"
# (Ie) bayrağı: dizide tam eşleşmenin indeksi; 0 ise yok demektir.
(( ${fpath[(Ie)$MINI_OMZ_CACHE/completions]} )) || fpath=("$MINI_OMZ_CACHE/completions" $fpath)

# 3) Güncelleme denetimi: zamanı geldiyse uzak depoyla karşılaştırır.
source "$MINI_OMZ/tools/guncelleme-kontrol.zsh"

# 4) Eklenti dizinlerini fpath'e ekle: içlerindeki _ad dosyaları tamamlama fonksiyonu olarak bulunsun.
_mini_eklenti_mi() {
  [[ -f "$1/plugins/$2/$2.plugin.zsh" || -f "$1/plugins/$2/_$2" ]]
}
for eklenti ($plugins); do
  if _mini_eklenti_mi "$MINI_OMZ_CUSTOM" "$eklenti"; then
    fpath=("$MINI_OMZ_CUSTOM/plugins/$eklenti" $fpath)
  elif _mini_eklenti_mi "$MINI_OMZ" "$eklenti"; then
    fpath=("$MINI_OMZ/plugins/$eklenti" $fpath)
  else
    print -u2 -r -- "[mini-omz] '$eklenti' eklentisi bulunamadı"
  fi
done
unset eklenti

# 5) Tamamlama sistemi. -i: başkalarının yazabildiği (güvensiz) dizinleri sessizce atla.
autoload -Uz compinit
[[ -n "$MINI_OMZ_COMPDUMP" ]] || MINI_OMZ_COMPDUMP="$MINI_OMZ_CACHE/zcompdump-${ZSH_VERSION}"
compinit -i -d "$MINI_OMZ_COMPDUMP"

# 6) Kaynak yardımcısı: önce custom/ altındaki aynı yollu dosya (kullanıcı geçersiz kılması),
#    yoksa çerçevedeki dosya. zstyle ile bir eklentinin takma adları kapatılabilir:
#      zstyle ':mini-omz:plugins:git-kisa' aliases no
_mini_kaynak() {
  local yol="$1" baglam
  case "$yol" in
    lib/*) baglam="lib:${yol:t:r}" ;;
    plugins/*) baglam="plugins:${yol:h:t}" ;;
  esac
  local takma_kapali=0
  zstyle -T ":mini-omz:${baglam}" aliases || takma_kapali=1
  local -A onceki_takmalar
  (( takma_kapali )) && onceki_takmalar=("${(@kv)aliases}")

  if [[ -f "$MINI_OMZ_CUSTOM/$yol" ]]; then
    source "$MINI_OMZ_CUSTOM/$yol"
  elif [[ -f "$MINI_OMZ/$yol" ]]; then
    source "$MINI_OMZ/$yol"
  fi

  # Kaynaklanan dosyanın eklediği takma adları geri al.
  if (( takma_kapali )); then
    if (( ${#onceki_takmalar} )); then
      aliases=("${(@kv)onceki_takmalar}")
    else
      (( ${#aliases} )) && unalias "${(@k)aliases}"
    fi
  fi
}

for lib_dosyasi ("$MINI_OMZ"/lib/*.zsh(N)); do
  _mini_kaynak "lib/${lib_dosyasi:t}"
done
unset lib_dosyasi

for eklenti ($plugins); do
  _mini_kaynak "plugins/$eklenti/$eklenti.plugin.zsh"
done
unset eklenti

# custom/*.zsh en son yüklenir: kullanıcının her şeyi ezebilmesi için. (N) = eşleşme yoksa boş liste.
for ozel_dosya ("$MINI_OMZ_CUSTOM"/*.zsh(N)); do
  source "$ozel_dosya"
done
unset ozel_dosya

# Tema: custom/ → custom/themes/ → themes/ sırasıyla aranır.
if [[ -n "$ZSH_THEME" ]]; then
  if [[ -f "$MINI_OMZ_CUSTOM/$ZSH_THEME.zsh-theme" ]]; then
    source "$MINI_OMZ_CUSTOM/$ZSH_THEME.zsh-theme"
  elif [[ -f "$MINI_OMZ_CUSTOM/themes/$ZSH_THEME.zsh-theme" ]]; then
    source "$MINI_OMZ_CUSTOM/themes/$ZSH_THEME.zsh-theme"
  elif [[ -f "$MINI_OMZ/themes/$ZSH_THEME.zsh-theme" ]]; then
    source "$MINI_OMZ/themes/$ZSH_THEME.zsh-theme"
  else
    print -u2 -r -- "[mini-omz] '$ZSH_THEME' teması bulunamadı"
  fi
fi
