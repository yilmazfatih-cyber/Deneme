"""Planlayıcı → yürütücü → denetçi kalıbı (iş akışıyla).

    planlayıcı  görevi en çok 4 kısa adıma böler (yapılı çıkarım: `Plan` şeması)
    yürütücü    her adımı araçlı ajanla yapar
    denetçi     sonucu görevle karşılaştırıp EVET/HAYIR der; HAYIR ise yürütme bir kez yinelenir

NE ZAMAN GEREKSİZ: Görev tek adımda çözülüyorsa (bir hesap, bir sınıflandırma, tek bir belge
sorusu) bu kalıp 3–6 kat fazla model çağrısı ve gecikme demektir; doğrudan `Ajan` ya da
`cikar` kullanın. Küçük modellerde planlayıcının ürettiği plan da hatalı olabilir; kalıbı ancak
`yz karsilastir` ile ölçüp doğruluğu gerçekten artırdığını gördüyseniz kullanın
(docs/KUCUK_MODEL_REHBERI.md "Görev bölme").
Çalıştırma (modelsiz gösterim): python -m ornekler.coklu_ajan
Genişletme: adım ekle/çıkar → `hat_kur`'daki IsAdimi listesi.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from yz.ajan.dongu import Ajan
from yz.ajan.is_akisi import AkisSonucu, IsAdimi, IsAkisi
from yz.arac.hazir import hesap_araci, zaman_araclari
from yz.metin import kucuk_tr
from yz.saglayici.taban import Saglayici
from yz.saglayici.tipler import Mesaj
from yz.yapili.cikar import cikar


class Plan(BaseModel):
    adimlar: list[str] = Field(description="Görevi çözmek için en çok 4 kısa adım", max_length=4)


def hat_kur(saglayici: Saglayici) -> IsAkisi:
    def planla(b: dict[str, Any]) -> list[str]:
        talimat = "Görevi en çok 4 kısa adıma böl." + (
            f" Önceki deneme hatası: {b['_onceki_hata']}" if "_onceki_hata" in b else ""
        )
        return cikar(saglayici, Plan, b["gorev"], talimat=talimat).zorla().adimlar

    def yurut(b: dict[str, Any]) -> str:
        ajan = Ajan(saglayici, [hesap_araci, *zaman_araclari()])
        adimlar = "\n".join(f"{i}. {a}" for i, a in enumerate(b["planla"], 1))
        return ajan.calistir(
            f"Görev: {b['gorev']}\nPlan:\n{adimlar}\nPlanı uygula ve kısa yanıt ver."
        ).yanit

    def denetle(b: dict[str, Any]) -> str:
        soru = f"Görev: {b['gorev']}\nYanıt: {b['yurut']}\nYanıt görevi tam karşılıyor mu? Yalnız EVET ya da HAYIR yaz."
        return saglayici.sohbet([Mesaj.kullanici(soru)], azami_belirtec=5).metin

    def denetim_gecti(cikti: Any) -> str | None:
        return None if "evet" in kucuk_tr(str(cikti)) else "Denetçi yanıtı yetersiz buldu."

    return IsAkisi([
        IsAdimi("planla", planla, dogrula=lambda p: None if p else "plan boş", yeniden_deneme=1),
        IsAdimi("yurut", yurut, dogrula=lambda y: None if str(y).strip() else "yanıt boş"),
        IsAdimi("denetle", denetle, dogrula=denetim_gecti),
    ])  # fmt: skip


def calistir(saglayici: Saglayici, gorev: str) -> AkisSonucu:
    return hat_kur(saglayici).calistir({"gorev": gorev})


if __name__ == "__main__":
    from yz.saglayici.sahte import Sahte

    sahte = Sahte([
        '{"adimlar": ["Fiyatın %18 KDV tutarını hesapla", "Fiyata ekle"]}',
        Sahte.arac_yaniti("hesapla", {"ifade": "1000 * 1.18"}),
        "KDV dahil fiyat 1180 TL.",
        "EVET",
    ])  # fmt: skip
    sonuc = calistir(sahte, "1000 TL'lik ürünün KDV dahil fiyatı nedir?")
    print(sonuc.basarili, sonuc.baglam.get("yurut"), [(k.ad, k.basarili) for k in sonuc.kayitlar])
