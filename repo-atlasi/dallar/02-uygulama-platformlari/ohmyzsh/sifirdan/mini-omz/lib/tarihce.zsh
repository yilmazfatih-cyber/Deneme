# lib/tarihce.zsh — komut geçmişi. Gerçek karşılığı: lib/history.zsh.

[[ -n "$HISTFILE" ]] || HISTFILE="$HOME/.zsh_history"
(( HISTSIZE >= 50000 )) || HISTSIZE=50000
(( SAVEHIST >= 10000 )) || SAVEHIST=10000

setopt extended_history       # zaman damgası ve süreyi de yaz
setopt hist_ignore_dups       # art arda aynı komutu tekrar kaydetme
setopt hist_ignore_space      # boşlukla başlayan komutu kaydetme (gizli komutlar için)
setopt share_history          # açık terminaller geçmişi paylaşsın
