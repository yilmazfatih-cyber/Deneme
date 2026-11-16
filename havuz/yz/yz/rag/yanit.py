"""Belgeye soru sorma: getir → istem kur → modele sor → yanıtı denetle.

Küçük modeller için korumalar:
    - İlgili parça yoksa model HİÇ çağrılmaz; "belgede yok" döner (uydurmayı önler, ucuzdur).
    - Kaynaklar numaralı ve ayraçlı verilir; model her cümleye [n] yazmakla yükümlüdür.
    - Yanıttaki rakamlar ve özel adlar kaynak metinde aranır; bulunamayanlar `dayanaksiz`
      listesine girer (uydurma belirtisi).
    - Parçalarda "önceki talimatları yok say" gibi gömülü talimat varsa uyarı üretilir
      (istem enjeksiyonu); istenirse o parçalar modele hiç gösterilmez.
İki adımlı kullanım (akış için): `hazirla` → (model, istenirse akışlı) → `sonuclandir`.
Kim kullanır: cli.py (`sor`), sunucu (/api/sohbet kip=rag), arac/hazir/belge.py değil (o yalnız arar).
Genişletme: yeni enjeksiyon kalıbı → `ENJEKSIYON_KALIPLARI`; yeni "yok" ifadesi → `YOK_KALIPLARI`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from yz.istem.butce import parcalari_sigdir
from yz.istem.sablonlar import sablon
from yz.metin import ascii_katla, kucuk_tr, sadelestir
from yz.rag.dizin import AramaKipi, AramaSonucu, RagDizini
from yz.rag.gomme import KarmaGomme
from yz.saglayici.taban import Saglayici
from yz.saglayici.tipler import Kullanim, Mesaj

ENJEKSIYON_KALIPLARI = (
    "önceki talimat", "talimatları yok say", "talimatları unut", "kuralları unut",
    "kuralları yok say", "sistem istemi", "sen artık", "bundan sonra sen", "yanıtına şunu ekle",
    "kullanıcıya şunu söyle", "kullanıcıya söyleme", "api anahtar", "parolayı", "şifreyi göster",
    "ignore previous", "ignore all previous", "ignore the above", "disregard the above",
    "system prompt", "you are now", "new instructions", "do not tell the user", "reveal your",
)  # fmt: skip
YOK_KALIPLARI = (
    "belgelerde bu bilgi yok", "belgelerde yok", "belgede yok", "kaynaklarda yok",
    "bilgi bulunmuyor", "bilgi bulunmamaktadır", "bilgi yer almıyor", "bilgi verilmemiş",
    "do not contain this information", "not in the documents", "no information",
)  # fmt: skip
_ATIF = re.compile(r"\[(\d+(?:\s*[,;–-]\s*\d+)*)\]")
_SAYI = re.compile(r"(?<![\w])\d+(?:[.,]\d+)*")
_OZEL_AD = re.compile(r"(?<![\w'’])([A-ZÇĞİÖŞÜ][\wçğıöşüÇĞİÖŞÜ]*)(?:['’]\w+)?")
_CUMLE_BASI = re.compile(r"(?:^|[.!?:\n]\s*|\]\s+)$")
# Küçük modellerin istemden yanıta kopyaladığı satırlar (gerçek deneme: docs/GERCEK_MODEL_DENEMESI.md)
_AYRAC_SATIRI = re.compile(r"^(?:<<<|>>>)$")
_BASLIK_SATIRI = re.compile(r"^\[\d+\]\s+\S.*(?:›|\.(?:md|txt|html?|pdf)\b)")
_SORU_YANKISI = re.compile(r"^(?:soru|question|kaynaklar|sources)\s*[:：]", re.IGNORECASE)
_ETIKETLI_ATIF = re.compile(r"^[^\[\]]{0,40}[:：]\s*(?:\[\d+\][\s,;]*)+$")


@dataclass
class SorYaniti:
    """`belgeye_sor` sonucu."""

    soru: str
    yanit: str
    kaynaklar: list[AramaSonucu]  # modele verilenler; numara = sıra + 1
    atiflar: list[int] = field(default_factory=list)
    belgede_yok: bool = False
    dayanaksiz: list[str] = field(default_factory=list)
    uyarilar: list[str] = field(default_factory=list)
    kullanim: Kullanim = field(default_factory=Kullanim)
    model_cagrildi: bool = True

    def kaynakca(self) -> list[str]:
        """Atıf yapılan kaynakların "[n] dosya › bölüm" listesi."""
        return [
            f"[{n}] {self.kaynaklar[n - 1].parca.goster()}"
            for n in self.atiflar
            if 0 < n <= len(self.kaynaklar)
        ]


@dataclass
class Hazirlik:
    """`hazirla` çıktısı: modele gidecek mesajlar ve bağlam."""

    soru: str
    mesajlar: list[Mesaj]
    kaynaklar: list[AramaSonucu]
    uyarilar: list[str]
    erken_yanit: SorYaniti | None = None  # doluysa modele gitmeye gerek yok


def _katli(metin: str) -> str:
    # Türkçe küçük harf + ASCII katlama: "Ignore" → "ignore" (kucuk_tr tek başına "ıgnore" verir).
    return ascii_katla(kucuk_tr(metin))


_ENJEKSIYON_KATLI = tuple(_katli(k) for k in ENJEKSIYON_KALIPLARI)
_YOK_KATLI = tuple(_katli(k) for k in YOK_KALIPLARI)


def enjeksiyon_var(metin: str) -> bool:
    """Metin, modele talimat vermeye çalışan bir kalıp içeriyor mu?"""
    katli = _katli(metin)
    return any(k in katli for k in _ENJEKSIYON_KATLI)


def atiflari_bul(yanit: str) -> list[int]:
    """Yanıttaki [1], [2, 3], [1-3] atıflarını sıralı ve tekrarsız döndürür."""
    numaralar: list[int] = []
    for grup in _ATIF.findall(yanit):
        parcalar = [int(s) for s in re.findall(r"\d+", grup)]
        if re.search(r"[–-]", grup) and len(parcalar) == 2 and parcalar[0] < parcalar[1] <= 50:
            parcalar = list(range(parcalar[0], parcalar[1] + 1))
        numaralar.extend(parcalar)
    return list(dict.fromkeys(numaralar))


def _sayi_normalle(sayi: str) -> str:
    rakamlar = re.split(r"[.,]", sayi)
    if len(rakamlar) > 1 and set(rakamlar[-1]) == {"0"}:
        rakamlar = rakamlar[:-1]  # "1.250,00" ile "1.250" aynı sayılsın
    return "".join(rakamlar)


def dayanaksizlari_bul(yanit: str, baglam: str) -> list[str]:
    """Yanıtta geçip bağlamda bulunamayan sayılar (≥ 2 rakam) ve özel adlar."""
    yanit = _ATIF.sub("", yanit)
    baglam_sayilari = {_sayi_normalle(s) for s in _SAYI.findall(baglam)}
    katli_baglam = _katli(baglam)
    sonuc: list[str] = []
    for sayi in _SAYI.findall(yanit):
        if len(re.sub(r"\D", "", sayi)) >= 2 and _sayi_normalle(sayi) not in baglam_sayilari:
            sonuc.append(sayi)
    for eslesme in _OZEL_AD.finditer(yanit):
        ad = eslesme.group(1)
        if len(ad) < 2 or _CUMLE_BASI.search(yanit[: eslesme.start()]):
            continue
        katli = _katli(ad)
        onek = katli[: max(4, len(katli) - 2)] if not ad.isupper() else katli
        if onek not in katli_baglam:
            sonuc.append(ad)
    return list(dict.fromkeys(sonuc))


def yankiyi_temizle(yanit: str) -> tuple[str, bool]:
    """Modelin istemden kopyaladığı kaynak başlığı, ayraç (<<< >>>), soru ve "X: [1]" satırlarını atar."""
    satirlar: list[str] = []
    temizlendi = False
    for satir in yanit.splitlines():
        duz = satir.strip()
        if (
            _AYRAC_SATIRI.match(duz)
            or _BASLIK_SATIRI.match(duz)
            or _SORU_YANKISI.match(duz)
            or _ETIKETLI_ATIF.match(duz)
        ):
            temizlendi = True
            continue
        if duz.startswith((">>>", "<<<")):
            satir, temizlendi = duz[3:].strip(), True
        satirlar.append(satir)
    return "\n".join(satirlar).strip(), temizlendi


def birebir_kaynaklar(yanit: str, kaynaklar: list[AramaSonucu]) -> list[int]:
    """Yanıt cümlelerinden biri kaynak metninde birebir geçiyorsa o kaynakların numaraları."""
    cumleler = [
        _katli(" ".join(c.split())).rstrip(".")
        for c in re.split(r"(?<=[.!?])\s+", _ATIF.sub("", yanit))
    ]
    cumleler = [c for c in cumleler if len(c) >= 6]
    numaralar = []
    for i, kaynak in enumerate(kaynaklar, start=1):
        metin = _katli(" ".join(kaynak.parca.metin.split()))
        if any(c in metin for c in cumleler):
            numaralar.append(i)
    return numaralar


def belgede_yok_mu(yanit: str, belgede_yok_ifadesi: str) -> bool:
    """Yanıt "belgelerde bu bilgi yok" anlamına mı geliyor?"""
    if sadelestir(belgede_yok_ifadesi) in sadelestir(yanit):
        return True
    katli = _katli(yanit)
    return not atiflari_bul(yanit) and any(k in katli for k in _YOK_KATLI)


class RagHatti:
    """Dizin + sağlayıcı + ayarlar; `sor` tek adımda, `hazirla`/`sonuclandir` iki adımda çalışır."""

    def __init__(
        self,
        dizin: RagDizini,
        saglayici: Saglayici,
        *,
        k: int = 4,
        kip: AramaKipi = "karma",
        dil: str = "tr",
        azami_cumle: int = 4,
        baglam_butcesi: int = 1800,
        asgari_benzerlik: float | None = None,
        supheli_parcalari_cikar: bool = False,
    ) -> None:
        self.dizin = dizin
        self.saglayici = saglayici
        self.k = k
        self.kip: AramaKipi = kip
        self.dil = dil
        self.azami_cumle = azami_cumle
        self.baglam_butcesi = baglam_butcesi
        varsayilan = 0.25 if isinstance(dizin.gomme, KarmaGomme) else 0.35
        self.asgari_benzerlik = varsayilan if asgari_benzerlik is None else asgari_benzerlik
        self.supheli_parcalari_cikar = supheli_parcalari_cikar

    @property
    def belgede_yok_ifadesi(self) -> str:
        return sablon("rag_belgede_yok", self.dil)

    def ilgili_mi(self, sonuc: AramaSonucu) -> bool:
        return sonuc.bm25_puani > 0 or sonuc.benzerlik >= self.asgari_benzerlik

    def hazirla(self, soru: str) -> Hazirlik:
        uyarilar: list[str] = []
        adaylar = [s for s in self.dizin.ara(soru, self.k, self.kip) if self.ilgili_mi(s)]
        temiz: list[AramaSonucu] = []
        for aday in adaylar:
            if enjeksiyon_var(aday.parca.metin):
                uyarilar.append(
                    f"{aday.parca.goster()} içinde modele talimat veren bir ifade var (istem "
                    "enjeksiyonu olabilir)."
                    + (" Bu parça modele gösterilmedi." if self.supheli_parcalari_cikar else "")
                )
                if self.supheli_parcalari_cikar:
                    continue
            temiz.append(aday)
        sigan = set(parcalari_sigdir([s.parca.metin for s in temiz], self.baglam_butcesi))
        kaynaklar = [s for s in temiz if s.parca.metin in sigan]
        if not kaynaklar:
            erken = SorYaniti(
                soru=soru,
                yanit=self.belgede_yok_ifadesi,
                kaynaklar=[],
                belgede_yok=True,
                uyarilar=uyarilar,
                model_cagrildi=False,
            )
            return Hazirlik(soru, [], [], uyarilar, erken)
        bloklar = "\n\n".join(
            f"[{i}] {s.parca.goster()}\n<<<\n{s.parca.metin}\n>>>"
            for i, s in enumerate(kaynaklar, 1)
        )
        mesajlar = [
            Mesaj.sistem(
                sablon(
                    "rag_sistem",
                    self.dil,
                    belgede_yok=self.belgede_yok_ifadesi,
                    azami_cumle=self.azami_cumle,
                )
            ),
            Mesaj.kullanici(sablon("rag_kullanici", self.dil, kaynaklar=bloklar, soru=soru)),
        ]
        return Hazirlik(soru, mesajlar, kaynaklar, uyarilar)

    def sonuclandir(self, hazirlik: Hazirlik, yanit: str, kullanim: Kullanim) -> SorYaniti:
        if hazirlik.erken_yanit is not None:
            return hazirlik.erken_yanit
        uyarilar = list(hazirlik.uyarilar)
        yanit, yanki = yankiyi_temizle(yanit)
        if yanki:
            uyarilar.append(
                "Model istem biçimini yanıta kopyaladı; kopyalanan satırlar temizlendi."
            )
        atiflar = atiflari_bul(yanit)
        if not atiflar and not belgede_yok_mu(yanit, self.belgede_yok_ifadesi):
            atiflar = birebir_kaynaklar(yanit, hazirlik.kaynaklar)
            if atiflar:
                uyarilar.append(
                    f"Model kaynak numarası yazmadı; cümleler şu kaynaklarda birebir geçiyor: {atiflar}."
                )
        gecersiz = [n for n in atiflar if not 0 < n <= len(hazirlik.kaynaklar)]
        if gecersiz:
            uyarilar.append(f"Yanıtta olmayan kaynak numarası var: {gecersiz}.")
        yok = belgede_yok_mu(yanit, self.belgede_yok_ifadesi)
        dayanaksiz: list[str] = []
        if not yok:
            gecerli = [n for n in atiflar if n not in gecersiz]
            if not gecerli:
                uyarilar.append("Yanıtta kaynak numarası yok; doğruluğu denetleyin.")
            secili = [hazirlik.kaynaklar[n - 1] for n in gecerli] or hazirlik.kaynaklar
            dayanaksiz = dayanaksizlari_bul(yanit, "\n".join(s.parca.metin for s in secili))
            if dayanaksiz:
                uyarilar.append(
                    "Şu ifadeler gösterilen kaynaklarda bulunamadı (uydurma olabilir): "
                    + ", ".join(dayanaksiz)
                )
        return SorYaniti(
            soru=hazirlik.soru,
            yanit=yanit,
            kaynaklar=hazirlik.kaynaklar,
            atiflar=[n for n in atiflar if n not in gecersiz],
            belgede_yok=yok,
            dayanaksiz=dayanaksiz,
            uyarilar=uyarilar,
            kullanim=kullanim,
        )

    def sor(self, soru: str, azami_belirtec: int = 400) -> SorYaniti:
        """Tek adımda: getir, sor, denetle."""
        hazirlik = self.hazirla(soru)
        if hazirlik.erken_yanit is not None:
            return hazirlik.erken_yanit
        yanit = self.saglayici.sohbet(hazirlik.mesajlar, azami_belirtec=azami_belirtec)
        return self.sonuclandir(hazirlik, yanit.metin, yanit.kullanim)
