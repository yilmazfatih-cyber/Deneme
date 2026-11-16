"""Başvuru çözümü: doğru yanıtlar (YANIT.txt).

Ajana verilmez. Kim kullanır: `sinav.py dogrula`.
Genişletme: temel değişir de yanıt değişirse burayı ve gizli/yanit_denetle.py'yi birlikte güncelleyin.
"""

from pathlib import Path

from exam.edit import write

ANSWER = """1. 1 (<|bas|> 0, <|son|> 1, <|dolgu|> 2).
2. Komut satırında top-p varsayılanı 0.95 (dil_modeli/cli_common.py, --top-p). SamplingConfig'teki varsayılan ise
   1.0 (kapalı); yani aynı değil.
3. Son max_seq_len // 2 belirteç (son yarı) tutulur ve önbellek bu pencereden yeniden kurulur; üretim oradan sürer.
4. Önce ısınma (0'dan taban orana doğrusal), sonra kosinüsle iniş; dil_modeli/optim.py dosyasında.
5. 8430 (127.0.0.1:8430).
"""


def coz(kopya: Path) -> None:
    write(kopya / "YANIT.txt", ANSWER)
