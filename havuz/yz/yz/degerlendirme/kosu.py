"""Değerlendirme koşusu: görev kümesini bir sağlayıcıyla çalıştırır, her örneği puanlar.

Her örnek için: istem kurulur → görev türüne göre model çağrılır → çıktı puanlanır →
gecikme, belirteç, maliyet ve biçim geçerliliği kaydedilir. Örnekler `es_zamanlilik` kadar
paralel çalışır (iş parçacığı). Sonuç klasöre yazılır: sonuclar.jsonl + ozet.json.
Bir örnekte sağlayıcı hatası olursa koşu durmaz; örnek "hata" ile kaydedilir.
Kim kullanır: cli.py (`degerlendir`, `karsilastir`), degerlendirme/karsilastir.py.
Genişletme: yeni görev türü → `_xxx_calistir(baglam, ornek) -> _Cikti` yazıp `_CALISTIRICILAR`'a
ekleyin (YENİ GÖREV BURAYA).
"""

from __future__ import annotations

import json
import statistics
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from yz.ajan.dongu import Ajan, AjanAyari
from yz.arac.hazir import dosya_araclari, hesap_araci, sqlite_araclari, zaman_araclari
from yz.arac.tanim import Arac
from yz.degerlendirme.puanlayici import Puan, PuanBaglami, puanla
from yz.degerlendirme.tanim import KosuTanimi, Ornek, ornekleri_yukle, sema_yukle
from yz.hatalar import SaglayiciHatasi, VeriHatasi
from yz.rag.dizin import RagDizini
from yz.rag.yanit import RagHatti
from yz.rag.yukleyici import klasor_yukle
from yz.saglayici.taban import Saglayici
from yz.saglayici.tipler import Kullanim, Mesaj
from yz.yapili.cikar import Cikarici


@dataclass
class OrnekSonucu:
    kimlik: str
    girdi: str
    beklenen: Any
    cikti: str
    gecti: bool
    puan: float
    puanlar: dict[str, dict[str, Any]]
    bicim_gecerli: bool
    gecikme_sn: float
    girdi_belirteci: int
    cikti_belirteci: int
    maliyet: float | None
    hata: str | None = None
    notlar: list[str] = field(default_factory=list)


@dataclass
class KosuSonucu:
    gorev: str
    saglayici: str
    model: str
    zaman: str
    ornekler: list[OrnekSonucu]

    def _orani(self, kosul: Callable[[OrnekSonucu], bool]) -> float:
        return (
            sum(1 for o in self.ornekler if kosul(o)) / len(self.ornekler) if self.ornekler else 0.0
        )

    @property
    def dogruluk(self) -> float:
        return self._orani(lambda o: o.gecti)

    @property
    def bicim_gecerliligi(self) -> float:
        return self._orani(lambda o: o.bicim_gecerli)

    @property
    def hata_sayisi(self) -> int:
        return sum(1 for o in self.ornekler if o.hata)

    def gecikme(self, yuzdelik: float = 50) -> float:
        degerler = sorted(o.gecikme_sn for o in self.ornekler if not o.hata)
        if not degerler:
            return 0.0
        if len(degerler) == 1:
            return degerler[0]
        return statistics.quantiles(degerler, n=100, method="inclusive")[int(yuzdelik) - 1]

    @property
    def belirtec(self) -> tuple[int, int]:
        return (
            sum(o.girdi_belirteci for o in self.ornekler),
            sum(o.cikti_belirteci for o in self.ornekler),
        )

    @property
    def maliyet(self) -> float | None:
        """Toplam maliyet; herhangi bir örneğin maliyeti bilinmiyorsa None."""
        if any(o.maliyet is None and not o.hata for o in self.ornekler):
            return None
        return sum(o.maliyet or 0.0 for o in self.ornekler)

    def ozet(self) -> dict[str, Any]:
        girdi, cikti = self.belirtec
        return {
            "gorev": self.gorev, "saglayici": self.saglayici, "model": self.model, "zaman": self.zaman,
            "ornek_sayisi": len(self.ornekler), "dogruluk": round(self.dogruluk, 4),
            "bicim_gecerliligi": round(self.bicim_gecerliligi, 4), "hata_sayisi": self.hata_sayisi,
            "gecikme_p50": round(self.gecikme(50), 3), "gecikme_p95": round(self.gecikme(95), 3),
            "girdi_belirteci": girdi, "cikti_belirteci": cikti, "maliyet": self.maliyet,
        }  # fmt: skip

    def kaydet(self, klasor: str | Path) -> Path:
        klasor = Path(klasor)
        klasor.mkdir(parents=True, exist_ok=True)
        satirlar = [json.dumps(asdict(o), ensure_ascii=False, default=str) for o in self.ornekler]
        (klasor / "sonuclar.jsonl").write_text("\n".join(satirlar) + "\n", encoding="utf-8")
        (klasor / "ozet.json").write_text(
            json.dumps(self.ozet(), ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return klasor

    @classmethod
    def yukle(cls, klasor: str | Path) -> KosuSonucu:
        klasor = Path(klasor)
        if not (klasor / "ozet.json").is_file():
            raise VeriHatasi(f"Koşu sonucu bulunamadı: {klasor} (ozet.json yok).")
        ozet = json.loads((klasor / "ozet.json").read_text(encoding="utf-8"))
        satirlar = (klasor / "sonuclar.jsonl").read_text(encoding="utf-8").splitlines()
        ornekler = [OrnekSonucu(**json.loads(s)) for s in satirlar if s.strip()]
        return cls(ozet["gorev"], ozet["saglayici"], ozet["model"], ozet["zaman"], ornekler)


@dataclass
class _Cikti:
    metin: str
    deger: Any = None  # ayrıştırılmış çıktı (cikarim: sözlük)
    bicim_gecerli: bool = True
    kullanim: Kullanim = field(default_factory=Kullanim)
    notlar: list[str] = field(default_factory=list)


class _Baglam:
    """Koşu boyunca paylaşılan nesneler (şema, araçlar, RAG dizini)."""

    def __init__(self, tanim: KosuTanimi, saglayici: Saglayici, hakem: Saglayici | None) -> None:
        self.tanim = tanim
        self.saglayici = saglayici
        self.sema: type[BaseModel] | None = (
            sema_yukle(tanim.sema, tanim.kok) if tanim.sema else None
        )
        self.araclar = _araclari_kur(tanim) if tanim.gorev == "arac" else []
        self.rag: RagHatti | None = None
        if tanim.gorev == "rag":
            if not tanim.belgeler:
                raise VeriHatasi("rag görevi için `belgeler:` klasörü gerekli.")
            dizin = RagDizini()
            dizin.ekle(klasor_yukle(tanim.yol(tanim.belgeler)))
            self.rag = RagHatti(dizin, saglayici)
        self.puan_baglami = PuanBaglami(sema=self.sema, hakem=hakem)

    def istem(self, ornek: Ornek) -> list[Mesaj]:
        try:
            kullanici = self.tanim.istem.format(**ornek.alanlar())
        except KeyError as hata:
            raise VeriHatasi(
                f"İstem şablonunda bilinmeyen alan: {hata}. Örnekte bu alan yok."
            ) from hata
        sistem = [Mesaj.sistem(self.tanim.sistem)] if self.tanim.sistem else []
        return [*sistem, Mesaj.kullanici(kullanici)]


def _araclari_kur(tanim: KosuTanimi) -> list[Arac]:
    araclar: list[Arac] = []
    for ad in tanim.araclar:
        tur, _, deger = ad.partition(":")
        if tur == "hesapla":
            araclar.append(hesap_araci)
        elif tur == "zaman":
            araclar.extend(zaman_araclari())
        elif tur == "dosya":
            araclar.extend(dosya_araclari(tanim.yol(deger or ".")))
        elif tur == "sqlite":
            araclar.extend(sqlite_araclari(tanim.yol(deger)))
        else:
            raise VeriHatasi(
                f"Bilinmeyen hazır araç: {ad}. Geçerli: hesapla, zaman, dosya:<klasör>, sqlite:<db>."
            )
    return araclar


def _sohbet_calistir(b: _Baglam, ornek: Ornek) -> _Cikti:
    yanit = b.saglayici.sohbet(
        b.istem(ornek), azami_belirtec=b.tanim.azami_belirtec, sicaklik=b.tanim.sicaklik
    )
    return _Cikti(
        yanit.metin, kullanim=yanit.kullanim, bicim_gecerli=yanit.bitis_nedeni != "uzunluk"
    )


def _cikarim_calistir(b: _Baglam, ornek: Ornek) -> _Cikti:
    if b.sema is None:
        raise VeriHatasi("cikarim görevi için `sema:` gerekli (ör. yz.yapili.semalar:Fatura).")
    talimat = b.tanim.istem.format(**ornek.alanlar()) if b.tanim.istem != "{girdi}" else None
    sonuc = Cikarici(
        b.saglayici, b.sema, talimat=talimat, azami_belirtec=b.tanim.azami_belirtec
    ).cikar(ornek.girdi)
    notlar = [f"katman={sonuc.katman}", f"onarim_turu={sonuc.onarim_turu}", *sonuc.notlar]
    if sonuc.deger is None:
        ham = sonuc.denemeler[-1].ham if sonuc.denemeler else ""
        return _Cikti(ham, None, False, sonuc.kullanim, notlar)
    deger = sonuc.deger.model_dump(mode="json")
    return _Cikti(json.dumps(deger, ensure_ascii=False), deger, True, sonuc.kullanim, notlar)


def _arac_calistir(b: _Baglam, ornek: Ornek) -> _Cikti:
    ayar = AjanAyari(azami_belirtec=b.tanim.azami_belirtec)
    sonuc = Ajan(b.saglayici, b.araclar, ayar=ayar).calistir(b.istem(ornek))
    notlar = [
        f"durma={sonuc.durma_nedeni}",
        f"kip={sonuc.kip}",
        *[f"arac={a.arac}" for a in sonuc.arac_cagrilari],
    ]
    return _Cikti(
        sonuc.yanit,
        kullanim=sonuc.kullanim,
        notlar=notlar,
        bicim_gecerli=sonuc.durma_nedeni == "yanit",
    )


def _rag_calistir(b: _Baglam, ornek: Ornek) -> _Cikti:
    assert b.rag is not None
    sonuc = b.rag.sor(ornek.girdi, azami_belirtec=b.tanim.azami_belirtec or 300)
    notlar = [
        f"atif={sonuc.atiflar}",
        *(["belgede_yok"] if sonuc.belgede_yok else []),
        *sonuc.uyarilar,
    ]
    return _Cikti(
        sonuc.yanit,
        kullanim=sonuc.kullanim,
        notlar=notlar,
        bicim_gecerli=bool(sonuc.atiflar) or sonuc.belgede_yok,
    )


_CALISTIRICILAR: dict[str, Callable[[_Baglam, Ornek], _Cikti]] = {
    "sohbet": _sohbet_calistir,
    "cikarim": _cikarim_calistir,
    "arac": _arac_calistir,
    "rag": _rag_calistir,
    # YENİ GÖREV BURAYA: "tur": _tur_calistir,
}


def _ornegi_calistir(b: _Baglam, ornek: Ornek, saat: Callable[[], float]) -> OrnekSonucu:
    baslangic = saat()
    try:
        cikti = _CALISTIRICILAR[b.tanim.gorev](b, ornek)
    except SaglayiciHatasi as hata:
        return OrnekSonucu(ornek.kimlik, ornek.girdi, ornek.beklenen, "", False, 0.0, {}, False,
                           saat() - baslangic, 0, 0, None, hata=str(hata)[:500])  # fmt: skip
    gecikme = saat() - baslangic
    puanlar: dict[str, Puan] = {}
    toplam_agirlik = sum(p.agirlik for p in b.tanim.puanlayicilar) or 1.0
    toplam = 0.0
    for sira, ayar in enumerate(b.tanim.puanlayicilar):
        puan = puanla(cikti.metin, cikti.deger, ornek.beklenen, ayar, b.puan_baglami, ornek.girdi)
        anahtar = f"{ayar.tur}:{ayar.alan}" if ayar.alan else ayar.tur
        puanlar[anahtar if anahtar not in puanlar else f"{anahtar}#{sira}"] = puan
        toplam += puan.deger * ayar.agirlik
    agirlikli = toplam / toplam_agirlik
    bicim = cikti.bicim_gecerli and all(
        p.gecti for k, p in puanlar.items() if k.startswith("json_sema")
    )
    if b.tanim.gecme_esigi >= 1:
        gecti = all(p.gecti for p in puanlar.values())  # eşik 1: bütün puanlayıcılar geçmeli
    else:
        gecti = agirlikli >= b.tanim.gecme_esigi
    maliyet = None
    fiyatlar = b.saglayici.fiyatlar
    if fiyatlar is not None:
        maliyet = fiyatlar.maliyet(b.saglayici.model, cikti.kullanim)
    return OrnekSonucu(
        ornek.kimlik, ornek.girdi, ornek.beklenen, cikti.metin,
        gecti=gecti,
        puan=round(agirlikli, 4), puanlar={k: asdict(p) for k, p in puanlar.items()},
        bicim_gecerli=bicim, gecikme_sn=round(gecikme, 4),
        girdi_belirteci=cikti.kullanim.girdi_belirteci, cikti_belirteci=cikti.kullanim.cikti_belirteci,
        maliyet=maliyet, notlar=cikti.notlar,
    )  # fmt: skip


def kosu_yap(
    tanim: KosuTanimi,
    saglayici: Saglayici,
    *,
    es_zamanlilik: int | None = None,
    sinir: int | None = None,
    hakem: Saglayici | None = None,
    ilerleme: Callable[[OrnekSonucu], None] | None = None,
    saat: Callable[[], float] = time.perf_counter,
    zaman: Callable[[], str] = lambda: time.strftime("%Y-%m-%dT%H:%M:%S"),
) -> KosuSonucu:
    """Görev kümesini çalıştırır. `sinir`: yalnız ilk N örnek (hızlı deneme için)."""
    ornekler = ornekleri_yukle(tanim.yol(tanim.veri))[:sinir]
    baglam = _Baglam(tanim, saglayici, hakem)

    def calistir(ornek: Ornek) -> OrnekSonucu:
        sonuc = _ornegi_calistir(baglam, ornek, saat)
        if ilerleme is not None:
            ilerleme(sonuc)
        return sonuc

    isci = es_zamanlilik or tanim.es_zamanlilik
    if isci <= 1:
        sonuclar = [calistir(o) for o in ornekler]
    else:
        with ThreadPoolExecutor(max_workers=isci, thread_name_prefix="degerlendirme") as havuz:
            sonuclar = list(havuz.map(calistir, ornekler))
    return KosuSonucu(tanim.ad, saglayici.kimlik, saglayici.model, zaman(), sonuclar)
