"""YENİ ARAÇ ÖRNEĞİ: kopyalayıp uyarlayın (AGENTS.md "Yeni araç ekle").

Kurallar (yz/arac/tanim.py):
    1. Her parametrenin tip ipucu olsun; açıklamaları belge dizgisinin "Args:" bölümüne yazın.
    2. İlk paragraf kısa ve eylem bildirsin: model aracı bu cümleye bakarak seçer.
    3. Hata durumunda istisna fırlatın (ValueError vb.): ileti modele gözlem olarak döner.
    4. Dünyayı değiştiren araç (dosya yazar, e-posta yollar, ödeme yapar) `tehlikeli=True` olsun;
       onay kancası olmadan ÇALIŞMAZ.
Çalıştırma (modelsiz gösterim): python -m ornekler.kendi_aracim
Genişletme: yeni araç → aynı kalıpta işlev + testine örnek (tests/test_ornekler.py).
"""

from __future__ import annotations

from pathlib import Path

from yz.arac.tanim import Arac
from yz.hatalar import GuvenlikHatasi


def kur_araclari(kurlar: dict[str, float], not_klasoru: Path) -> list[Arac]:
    """Araçları kurar. Dış bilgi (kur tablosu, klasör) parametreyle verilir ki test edilebilsin."""

    def kur_cevir(tutar: float, kaynak: str, hedef: str = "TRY") -> str:
        """Tutarı bir para biriminden diğerine çevirir (yalnız tabloda olan kurlar).

        Args:
            tutar: Çevrilecek tutar, ör. 120.5.
            kaynak: Kaynak para birimi kodu, ör. USD.
            hedef: Hedef para birimi kodu (varsayılan TRY).
        """
        try:
            sonuc = tutar * kurlar[kaynak] / kurlar[hedef]
        except KeyError as hata:
            raise ValueError(
                f"{hata.args[0]} kuru tabloda yok; bilinenler: {', '.join(sorted(kurlar))}"
            ) from None
        return f"{sonuc:.2f} {hedef}"

    def not_kaydet(baslik: str, metin: str) -> str:
        """Not klasörüne yeni bir metin notu kaydeder (dosya yazar; onay gerekir).

        Args:
            baslik: Dosya adı olacak kısa başlık (yalnız harf, rakam, tire).
            metin: Notun içeriği.
        """
        if not baslik.replace("-", "").isalnum():
            raise GuvenlikHatasi("başlık yalnız harf, rakam ve tire içerebilir.")
        yol = not_klasoru / f"{baslik}.txt"
        if yol.exists():
            raise ValueError("bu başlıkta bir not zaten var; başka bir başlık seçin.")
        yol.write_text(metin, encoding="utf-8")
        return f"Kaydedildi: {yol.name}"

    return [Arac(kur_cevir), Arac(not_kaydet, tehlikeli=True)]


if __name__ == "__main__":
    import tempfile

    from yz.ajan.dongu import Ajan
    from yz.ajan.onay import konsoldan_sor
    from yz.arac.kutu import AracKutusu
    from yz.saglayici.sahte import Sahte

    klasor = Path(tempfile.mkdtemp())
    araclar = kur_araclari({"TRY": 1.0, "USD": 34.0, "EUR": 37.0}, klasor)
    sahte = Sahte(
        [
            Sahte.arac_yaniti("kur_cevir", {"tutar": 100, "kaynak": "USD"}),
            "100 USD yaklaşık 3400 TL eder.",
        ]
    )
    sonuc = Ajan(sahte, AracKutusu(araclar, onay=konsoldan_sor())).calistir("100 dolar kaç TL?")
    print(sonuc.yanit, [a.icerik for a in sonuc.arac_cagrilari])
