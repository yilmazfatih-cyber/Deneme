"""Başvuru çözümü: doğru yanıtlar (YANIT.txt).

Ajana verilmez. Kim kullanır: `sinav.py dogrula`.
Genişletme: temel değişir de yanıt değişirse burayı ve gizli/yanit_denetle.py'yi birlikte güncelleyin.
"""

from pathlib import Path

from exam.edit import write

ANSWER = """1. Hayır, silinmiyor. Kayıt "mezar taşı" olarak kalır: records tablosunda deleted sütunu 1 yapılır
   (istemciye deleted: true olarak gider).
2. Hiç temizlenmiyor. docs/MEZAR_TASI.md'deki saklama süresi (ör. 90 gün) yalnız önerilen bir tasarım,
   uygulanmadı; bugün mezar taşları süresiz kalır.
3. removeRecord (silme) ve restoreRecord (geri alma); ikisi de web/src/lib/store/records.ts dosyasında.
4. Sürüm 1: PROTOCOL_VERSION = 1, shared/src/sync.ts dosyasında.
5. Cihaz silmeyi hiç görmez (kaçırır); kaydı yerelde tutar ve kullanıcıya göstermeye devam eder. Bekleyen bir put
   gönderirse kayıt sunucuda yeniden doğabilir.
"""


def coz(kopya: Path) -> None:
    write(kopya / "YANIT.txt", ANSWER)
