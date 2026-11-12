# git kısaltmaları. Gerçek karşılığı: plugins/git/git.plugin.zsh (200'ü aşkın takma ad).

# Ana dalın adını bul: main, master ya da trunk.
git_ana_dal() {
  command git rev-parse --git-dir &>/dev/null || return 1
  local dal
  for dal in main master trunk; do
    if command git show-ref -q --verify "refs/heads/$dal"; then
      print -r -- "$dal"
      return 0
    fi
  done
  print -r -- main
  return 1
}

alias gst='git status'
alias gco='git checkout'
alias gl='git pull'
alias gp='git push'
alias glog='git log --oneline --decorate --graph'
alias gcm='git checkout "$(git_ana_dal)"'
