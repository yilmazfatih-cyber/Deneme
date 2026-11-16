// "Damla" örnek oyununun bölümü: karakterlerle çizilmiş harita. Her satır aynı uzunluktadır (40 karo).
//   #  duvar        .  boşluk        P  oyuncu (damla) başlangıcı
//   s  tohum        k  kor (sekerek dolaşan tehlike)
//   y  yağmur (can) E  kaynak (tüm tohumlar toplanınca açılan çıkış)
// Platformlar üçer satır arayla dizildi: damla en çok ~3,7 karo zıplar (zıplama hızı ve yerçekiminden).
// Genişletme: yeni bölüm = aynı biçimde yeni bir dizi; `LEVELS` listesine ekleyin (rule test boyutları denetler).

export const TILE = 16

export const LEVEL_1: readonly string[] = [
  '########################################',
  '#......................................#',
  '#..s.......y.........s.........s.......#',
  '#.#######..####...#######...#######....#',
  '#......................................#',
  '#...........k.................k........#',
  '#......####......#####......####...s...#',
  '#..s...................................#',
  '#..........s.........k.................#',
  '#....#####.....#####.......#####.......#',
  '#......................................#',
  '#...........k...........s..............#',
  '#..s....####.......####.......####.....#',
  '#...........................y..........#',
  '#P.......s...............k...........E.#',
  '########################################',
]

export const LEVELS: readonly (readonly string[])[] = [LEVEL_1]
