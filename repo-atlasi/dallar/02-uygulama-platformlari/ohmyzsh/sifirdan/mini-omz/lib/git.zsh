# lib/git.zsh — istemde git bilgisi. Gerçek karşılığı: lib/git.zsh (git_prompt_info, parse_git_dirty).

# İstem için çalışan git komutları salt okunurdur; kilit dosyası alıp kullanıcının kendi
# git komutlarıyla çakışmasınlar diye GIT_OPTIONAL_LOCKS=0 ile çalıştırılır.
__mini_git() {
  GIT_OPTIONAL_LOCKS=0 command git "$@"
}

# Dal adı; ayrık HEAD'de kısa SHA. Depo dışında hiçbir şey yazmaz.
git_current_branch() {
  local ref
  ref=$(__mini_git symbolic-ref --quiet HEAD 2>/dev/null)
  local durum=$?
  if (( durum != 0 )); then
    (( durum == 128 )) && return 1 # depo değil
    ref=$(__mini_git rev-parse --short HEAD 2>/dev/null) || return 1
  fi
  print -r -- "${ref#refs/heads/}"
}

# Çalışma ağacı kirli mi? Yalnızca ilk satır yeter, tüm listeyi okumaya gerek yok.
parse_git_dirty() {
  local satir
  __mini_git status --porcelain --untracked-files="${MINI_GIT_IZLENMEYEN:-normal}" 2>/dev/null | read -r satir
  if [[ -n "$satir" ]]; then
    print -r -- "$ZSH_THEME_GIT_PROMPT_DIRTY"
  else
    print -r -- "$ZSH_THEME_GIT_PROMPT_CLEAN"
  fi
}

git_prompt_info() {
  local dal
  dal=$(git_current_branch) || return 0
  [[ -n "$dal" ]] || return 0
  # Depo bazında gizleme: git config mini-omz.hide-info 1
  [[ "$(__mini_git config --get mini-omz.hide-info 2>/dev/null)" == 1 ]] && return 0
  # Dal adındaki % işaretlerini kaçır: aksi hâlde "%F{red}" gibi bir dal adı istemi bozar.
  print -r -- "${ZSH_THEME_GIT_PROMPT_PREFIX}${dal//\%/%%}$(parse_git_dirty)${ZSH_THEME_GIT_PROMPT_SUFFIX}"
}
