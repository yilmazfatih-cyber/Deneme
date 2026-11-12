#!/usr/bin/env bash
# mini-omz testleri. Çalıştır: bash test.sh
# Her senaryo geçici bir HOME içinde, kullanıcı ayarlarını okumayan temiz bir zsh (zsh -f) açar,
# mini-omz'u yükler ve çıktıyı doğrular. Gerçek ~/.zshrc'ye ve ağa dokunmaz.
set -u

BURASI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERCEVE="$BURASI/mini-omz"

if ! command -v zsh >/dev/null 2>&1; then
  echo "ATLANDI: zsh kurulu değil (Debian/Ubuntu: apt-get install -y zsh). Testler zsh ister."
  exit 0
fi

GECICI="$(mktemp -d)"
trap 'rm -rf "$GECICI"' EXIT
export HOME="$GECICI/ev"
export XDG_CACHE_HOME="$GECICI/onbellek"
export GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@ornek.invalid
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@ornek.invalid
mkdir -p "$HOME"
git config --global init.defaultBranch main
git config --global advice.detachedHead false

GECEN=0
KALAN=0

# ok/HATA satırı yazar. $1 = ad, $2 = beklenen parça, $3 = gerçek çıktı
icerir() {
  if [[ "$3" == *"$2"* ]]; then
    GECEN=$((GECEN + 1))
    echo "ok   - $1"
  else
    KALAN=$((KALAN + 1))
    echo "HATA - $1"
    echo "       beklenen parça: $2"
    echo "       gelen         : ${3//$'\n'/⏎}"
  fi
}

icermez() {
  if [[ "$3" != *"$2"* ]]; then
    GECEN=$((GECEN + 1))
    echo "ok   - $1"
  else
    KALAN=$((KALAN + 1))
    echo "HATA - $1"
    echo "       olmaması gereken: $2"
    echo "       gelen           : ${3//$'\n'/⏎}"
  fi
}

esit() {
  if [[ "$3" == "$2" ]]; then
    GECEN=$((GECEN + 1))
    echo "ok   - $1"
  else
    KALAN=$((KALAN + 1))
    echo "HATA - $1"
    echo "       beklenen: $2"
    echo "       gelen   : ${3//$'\n'/⏎}"
  fi
}

# ANSI renk kodlarını ayıkla (istemi düz metin olarak karşılaştırmak için).
renksiz() { sed $'s/\x1b\\[[0-9;]*m//g'; }

# Temiz zsh'te çalıştır. $1 = MINI_OMZ yolu, stdin = zsh betiği (yüklemeden SONRA çalışır).
# ON_AYAR değişkeni yüklemeden ÖNCE çalışacak satırları taşır (plugins, ZSH_THEME, zstyle …).
zsh_calistir() {
  local betik
  betik="export MINI_OMZ='$1'
${ON_AYAR:-}
source \"\$MINI_OMZ/mini-omz.sh\"
$(cat)"
  zsh -f -c "$betik" 2>&1
}

VARSAYILAN="plugins=(git-kisa selam); ZSH_THEME=sade; zstyle ':mini-omz:update' mode disabled"

echo "# 1. sözdizimi (gerçek CI'daki 'zsh -n' denetimi)"
SOZDIZIMI_HATASI=""
for f in "$CERCEVE"/mini-omz.sh "$CERCEVE"/lib/*.zsh "$CERCEVE"/plugins/*/*.plugin.zsh \
  "$CERCEVE"/plugins/*/_* "$CERCEVE"/themes/*.zsh-theme "$CERCEVE"/tools/*.zsh; do
  zsh -n "$f" || SOZDIZIMI_HATASI+="$f "
done
esit "tüm dosyalar zsh -n'den geçiyor" "" "$SOZDIZIMI_HATASI"

echo "# 2. yükleyici, eklentiler, takma adlar"
CIKTI=$(ON_AYAR="$VARSAYILAN" zsh_calistir "$CERCEVE" <<'EOF'
selam Ayşe
# Takma adlar komut satırı AYRIŞTIRILIRKEN açılır; zsh -c tüm betiği önceden ayrıştırdığı için
# yükleme sonrası tanımlanan takma adı eval ile çağırıyoruz (etkileşimli kabukta gerek yok).
eval gunaydin
alias gst
print -r -- "tamamlama:$_comps[selam]"
print -r -- "kanca:${precmd_functions[(r)_mini_precmd]}"
mini_omz eklentiler | tr '\n' ' '
EOF
)
icerir "eklenti fonksiyonu çalışıyor" "Merhaba, Ayşe!" "$CIKTI"
icerir "eklenti takma adı çalışıyor" "Günaydın, dünya!" "$CIKTI"
icerir "git-kisa takma adı tanımlı" "gst='git status'" "$CIKTI"
icerir "tamamlama compinit ile bağlandı" "tamamlama:_selam" "$CIKTI"
icerir "precmd kancası kayıtlı" "kanca:_mini_precmd" "$CIKTI"
icerir "mini_omz eklentiler listesi" "git-kisa selam" "$CIKTI"
icermez "yüklemede hata yok" "bulunamadı" "$CIKTI"

echo "# 3. bash ile yüklemeye çalışmak nazikçe reddedilir"
CIKTI=$(bash -c "source '$CERCEVE/mini-omz.sh'; echo durum=\$?" 2>&1)
icerir "bash uyarısı" "yalnızca zsh ile çalışır" "$CIKTI"
icerir "bash'te source 1 döner" "durum=1" "$CIKTI"

echo "# 4. eksik eklenti ve eksik tema uyarısı"
CIKTI=$(ON_AYAR="plugins=(selam yok-boyle); ZSH_THEME=hayalet; zstyle ':mini-omz:update' mode disabled" \
  zsh_calistir "$CERCEVE" </dev/null)
icerir "eksik eklenti uyarısı" "[mini-omz] 'yok-boyle' eklentisi bulunamadı" "$CIKTI"
icerir "eksik tema uyarısı" "[mini-omz] 'hayalet' teması bulunamadı" "$CIKTI"

echo "# 5. tema: git dalı, kirlilik, çıkış kodu, % kaçışı"
DEPO="$GECICI/proje"
git init -q "$DEPO"
echo bir >"$DEPO/dosya.txt"
git -C "$DEPO" add dosya.txt
git -C "$DEPO" commit -q -m ilk
CIKTI=$(ON_AYAR="$VARSAYILAN" zsh_calistir "$CERCEVE" <<EOF | renksiz
cd '$DEPO'
print -rP -- "\$PROMPT"
echo iki >> dosya.txt
print -rP -- "\$PROMPT"
false
print -rP -- "\$PROMPT"
git checkout -q -b 'yuzde%Fx'
git commit -qam iki
print -rP -- "\$PROMPT"
cd '$GECICI'
print -rP -- "[dis]\$PROMPT"
EOF
)
SATIRLAR=()
while IFS= read -r satir; do SATIRLAR+=("$satir"); done <<<"$CIKTI"
esit "temiz depo istemi" "> proje git:(main) " "${SATIRLAR[0]:-}"
esit "kirli depo istemi" "> proje git:(main) * " "${SATIRLAR[1]:-}"
esit "başarısız komuttan sonra da ok işareti (renk kırmızı)" "> proje git:(main) * " "${SATIRLAR[2]:-}"
esit "dal adındaki % kaçırıldı, istemi bozmuyor" "> proje git:(yuzde%Fx) " "${SATIRLAR[3]:-}"
esit "depo dışında git kısmı yok" "[dis]> $(basename "$GECICI") " "${SATIRLAR[4]:-}"
KIRMIZI=$(ON_AYAR="$VARSAYILAN" zsh_calistir "$CERCEVE" <<'EOF'
false
print -rP -- "$PROMPT"
EOF
)
icerir "son komut başarısızsa ok kırmızı (%F{red})" $'\e[31m>' "$KIRMIZI"

echo "# 6. custom/ ile geçersiz kılma ve zstyle ile takma ad kapatma"
OZEL="$GECICI/ozel"
mkdir -p "$OZEL/plugins/selam" "$OZEL/themes"
echo 'selam() { print -r -- "özel selam" }' >"$OZEL/plugins/selam/selam.plugin.zsh"
echo "PROMPT='ozel-tema> '" >"$OZEL/themes/sade.zsh-theme"
echo 'alias kisayol="echo custom yüklendi"' >"$OZEL/benim.zsh"
CIKTI=$(ON_AYAR="MINI_OMZ_CUSTOM='$OZEL'; $VARSAYILAN; zstyle ':mini-omz:plugins:git-kisa' aliases no" \
  zsh_calistir "$CERCEVE" <<'EOF'
selam
eval kisayol
print -r -- "tema:$PROMPT"
alias gst || print -r -- "gst-yok"
print -r -- "fonksiyon:$(whence -w git_ana_dal)"
EOF
)
icerir "custom eklenti çerçevedekini ezer" "özel selam" "$CIKTI"
icerir "custom/*.zsh en son yüklenir" "custom yüklendi" "$CIKTI"
icerir "custom/themes ezer" "tema:ozel-tema> " "$CIKTI"
icerir "zstyle aliases no → takma adlar yok" "gst-yok" "$CIKTI"
icerir "…ama eklentinin fonksiyonları duruyor" "fonksiyon:git_ana_dal: function" "$CIKTI"

echo "# 7. precmd kancası: uzun komutun süresi RPROMPT'a yazılır"
CIKTI=$(ON_AYAR="$VARSAYILAN" zsh_calistir "$CERCEVE" <<'EOF'
MINI_KOMUT_BASLANGIC=$(( EPOCHREALTIME - 3.2 ))
_mini_precmd
print -r -- "sure:$MINI_SON_SURE"
print -rP -- "$RPROMPT"
MINI_KOMUT_BASLANGIC=$EPOCHREALTIME
_mini_precmd
print -r -- "kisa:${MINI_SON_SURE-yok}"
EOF
)
icerir "süre hesaplandı" "sure:3" "$CIKTI"
icerir "RPROMPT süreyi gösteriyor" "3s" "$CIKTI"
icerir "eşiğin altındaki süre gösterilmez" "kisa:yok" "$CIKTI"

echo "# 8. güncelleme denetimi (yerel yalın depo = 'uzak'; ağ yok)"
cp -R "$CERCEVE" "$GECICI/kaynak"
git -C "$GECICI/kaynak" init -q
git -C "$GECICI/kaynak" add -A
git -C "$GECICI/kaynak" commit -q -m "mini-omz 1.0"
git clone -q --bare "$GECICI/kaynak" "$GECICI/uzak.git"
git clone -q "$GECICI/uzak.git" "$GECICI/kurulu"
KURULU="$GECICI/kurulu"
DAMGA="$XDG_CACHE_HOME/mini-omz/guncelleme-damgasi"
eski_gun() { echo "SON_GUN=$(($(date +%s) / 86400 - 20))" >"$DAMGA"; }

CIKTI=$(ON_AYAR="zstyle ':mini-omz:update' mode reminder" zsh_calistir "$KURULU" </dev/null)
esit "ilk açılışta yalnızca damga yazılır" "" "$CIKTI"
icerir "damga dosyası oluştu" "SON_GUN=" "$(cat "$DAMGA")"

eski_gun
CIKTI=$(ON_AYAR="zstyle ':mini-omz:update' mode reminder" zsh_calistir "$KURULU" </dev/null)
esit "uzak değişmediyse hatırlatma yok" "" "$CIKTI"
esit "denetimden sonra damga bugüne çekildi" "SON_GUN=$(($(date +%s) / 86400))" "$(cat "$DAMGA")"

# Uzakta yeni sürüm yayımla
git clone -q "$GECICI/uzak.git" "$GECICI/gelistirici"
echo "# yeni özellik" >>"$GECICI/gelistirici/mini-omz.sh"
git -C "$GECICI/gelistirici" commit -qam "mini-omz 1.1"
git -C "$GECICI/gelistirici" push -q origin main
YENI_SURUM=$(git -C "$GECICI/gelistirici" rev-parse HEAD)

CIKTI=$(ON_AYAR="zstyle ':mini-omz:update' mode reminder" zsh_calistir "$KURULU" </dev/null)
esit "sıklık dolmadan denetim yapılmaz" "" "$CIKTI"

eski_gun
mkdir "$XDG_CACHE_HOME/mini-omz/guncelleme.kilit"
CIKTI=$(ON_AYAR="zstyle ':mini-omz:update' mode reminder" zsh_calistir "$KURULU" </dev/null)
esit "kilit varken (başka terminal güncelliyor) sessizce geçilir" "" "$CIKTI"
rmdir "$XDG_CACHE_HOME/mini-omz/guncelleme.kilit"

CIKTI=$(ON_AYAR="zstyle ':mini-omz:update' mode disabled" zsh_calistir "$KURULU" </dev/null)
esit "disabled modunda hiçbir şey olmaz" "" "$CIKTI"

CIKTI=$(ON_AYAR="zstyle ':mini-omz:update' mode reminder" zsh_calistir "$KURULU" </dev/null)
icerir "reminder modu hatırlatır" "yeni sürüm var" "$CIKTI"
icermez "reminder modu kendiliğinden güncellemez" "$YENI_SURUM" "$(git -C "$KURULU" rev-parse HEAD)"

eski_gun
CIKTI=$(ON_AYAR="zstyle ':mini-omz:update' mode auto" zsh_calistir "$KURULU" </dev/null)
icerir "auto modu günceller" "[mini-omz] güncellendi" "$CIKTI"
esit "kurulum uzak HEAD'e ilerledi" "$YENI_SURUM" "$(git -C "$KURULU" rev-parse HEAD)"
icermez "kilit temizlendi" "kilit" "$(ls "$XDG_CACHE_HOME/mini-omz")"

eski_gun
CIKTI=$(ON_AYAR="zstyle ':mini-omz:update' mode auto" zsh_calistir "$KURULU" </dev/null)
esit "güncel kurulumda mesaj yok" "" "$CIKTI"

echo "# 9. güvenlik: başka bir deponun alt klasöründeki kurulum 'güncellenmez'"
mkdir -p "$GECICI/buyuk-depo"
cp -R "$CERCEVE" "$GECICI/buyuk-depo/mini-omz"
git -C "$GECICI/buyuk-depo" init -q
git -C "$GECICI/buyuk-depo" add -A
git -C "$GECICI/buyuk-depo" commit -q -m kok
git -C "$GECICI/buyuk-depo" remote add origin "$GECICI/uzak.git"
eski_gun
CIKTI=$(ON_AYAR="zstyle ':mini-omz:update' mode reminder" zsh_calistir "$GECICI/buyuk-depo/mini-omz" </dev/null)
esit "üst depo yok sayıldı" "" "$CIKTI"

echo
echo "# sonuç: $GECEN geçti, $KALAN başarısız"
[[ $KALAN -eq 0 ]]
