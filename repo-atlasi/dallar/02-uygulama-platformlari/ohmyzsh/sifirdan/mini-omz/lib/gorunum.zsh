# lib/gorunum.zsh — istem ve renk ayarları. Gerçek karşılığı: lib/theme-and-appearance.zsh.

# İstem metnindeki $(...) ve ${...} her istem çizilişinde yeniden değerlendirilsin.
setopt prompt_subst

# ls renkleri (GNU ls). Gerçek dosya macOS/BSD ls için de ayrı ayar yapar.
if [[ -z "$LS_COLORS" ]] && (( $+commands[dircolors] )); then
  eval "$(dircolors -b)"
fi
