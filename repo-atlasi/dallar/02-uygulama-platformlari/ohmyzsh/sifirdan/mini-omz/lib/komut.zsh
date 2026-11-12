# lib/komut.zsh — küçük yönetim komutu. Gerçek karşılığı: lib/cli.zsh (`omz plugin list`, `omz theme set` …).

mini_omz() {
  case "$1" in
    eklentiler)
      local -a liste
      liste=("$MINI_OMZ"/plugins/*(N/:t) "$MINI_OMZ_CUSTOM"/plugins/*(N/:t))
      print -rl -- ${(ou)liste}
      ;;
    temalar)
      local -a liste
      liste=("$MINI_OMZ"/themes/*.zsh-theme(N:t:r) "$MINI_OMZ_CUSTOM"/themes/*.zsh-theme(N:t:r))
      print -rl -- ${(ou)liste}
      ;;
    guncelle)
      mini_omz_guncelle
      ;;
    *)
      print -r -- "kullanım: mini_omz eklentiler | temalar | guncelle"
      return 1
      ;;
  esac
}
