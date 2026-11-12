# Örnek eklenti: bir fonksiyon, iki takma ad ve _selam dosyasında tamamlama.
# Gerçek eklentilerle aynı düzen: plugins/<ad>/<ad>.plugin.zsh (+ isteğe bağlı plugins/<ad>/_<ad>).

selam() {
  case "$1" in
    sabah) print -r -- "Günaydın, ${2:-dünya}!" ;;
    aksam) print -r -- "İyi akşamlar, ${2:-dünya}!" ;;
    surum) print -r -- "selam 1.0" ;;
    *) print -r -- "Merhaba, ${1:-dünya}!" ;;
  esac
}

alias slm='selam'
alias gunaydin='selam sabah'
