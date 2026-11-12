# Sade tema. Gerçek örnek: themes/robbyrussell.zsh-theme.
# Tek tırnak önemli: $(git_prompt_info) atama anında değil, her istemde (prompt_subst ile) çalışır.
#   %(?.A.B)  son komut başarılıysa A, değilse B      %F{renk}…%f  renk aç/kapa
#   %1~       çalışma dizininin son parçası (~ kısaltmalı)

PROMPT='%(?.%F{green}.%F{red})>%f %F{cyan}%1~%f $(git_prompt_info)'
RPROMPT='%F{yellow}${MINI_SON_SURE:+${MINI_SON_SURE}s}%f'

ZSH_THEME_GIT_PROMPT_PREFIX='%F{blue}git:(%F{red}'
ZSH_THEME_GIT_PROMPT_SUFFIX='%f '
ZSH_THEME_GIT_PROMPT_DIRTY='%F{blue}) %F{yellow}*'
ZSH_THEME_GIT_PROMPT_CLEAN='%F{blue})'
