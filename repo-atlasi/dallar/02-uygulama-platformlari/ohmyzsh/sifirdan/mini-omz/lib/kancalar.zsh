# lib/kancalar.zsh — precmd/preexec kancaları: terminal başlığı ve komut süresi.
# Gerçek karşılığı: lib/termsupport.zsh (başlık). Süre ölçümü çekirdekte yok: plugins/timer eklentisi ve
# bazı temalar (ör. refined) yapar.
#
# preexec: komut çalışmadan hemen önce (argüman: yazılan komut)
# precmd : istem çizilmeden hemen önce
# add-zsh-hook bu fonksiyonları precmd_functions / preexec_functions dizilerine ekler;
# böylece birden çok eklenti aynı kancaya takılabilir.

autoload -Uz add-zsh-hook
zmodload zsh/datetime

: ${MINI_SURE_ESIGI:=2} # saniye; daha kısa süren komutlar için süre gösterme

_mini_baslik() {
  [[ -t 1 ]] || return 0 # terminal değilse kaçış dizisi basma
  print -Pn "\e]2;$1\a"
}

_mini_preexec() {
  MINI_KOMUT_BASLANGIC=$EPOCHREALTIME
  _mini_baslik "%~ : ${1[1,40]}"
}

_mini_precmd() {
  if [[ -n "$MINI_KOMUT_BASLANGIC" ]]; then
    local gecen=$(( EPOCHREALTIME - MINI_KOMUT_BASLANGIC ))
    unset MINI_KOMUT_BASLANGIC
    if (( gecen >= MINI_SURE_ESIGI )); then
      printf -v MINI_SON_SURE '%.0f' "$gecen"
    else
      unset MINI_SON_SURE
    fi
  else
    unset MINI_SON_SURE
  fi
  _mini_baslik "%n@%m: %~"
}

add-zsh-hook preexec _mini_preexec
add-zsh-hook precmd _mini_precmd
