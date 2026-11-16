"""Araç kullanan ajan döngüsü: model → araç → gözlem → model … → yanıt.

Kipler: "yerel" (sağlayıcının araç çağrısı), "metin" (ReAct benzeri; ajan/metin_kipi.py),
"oto" (yerel dener; sunucu desteklemezse ya da model araçları düz metinle çağırırsa metin
kipine geçer). Durma koşulları (`AjanSonucu.durma_nedeni`):
    yanit        model araç çağırmadan yanıt verdi (olağan bitiş)
    adim_siniri  `azami_adim` doldu (istenirse araçsız son bir yanıt alınır)
    butce        toplam belirteç `belirtec_butcesi`ni aştı
    dongu        aynı araç aynı argümanlarla tekrar tekrar çağrıldı (uyarıdan sonra da)
    hata_dongusu art arda `ardisik_hata_siniri` araç hatası
    bicim        metin kipinde model iki kez üst üste anlaşılmaz yazdı
    bos_yanit    model boş yanıt verdi · ret: model ya da sağlayıcı yanıtı reddetti
Her adım `AjanSonucu.adimlar`'a yazılır; `dokum_kaydet` JSONL döküm üretir (web/kayit.html açar).
Kim kullanır: cli.py (`sohbet --arac`), sunucu (kip=arac), mcp/kopru.py örnekleri.
Genişletme: yeni durma koşulu → `_DurmaDenetimi`'ne ekleyin ve tests/test_ajan.py'ye senaryo yazın.
"""

from __future__ import annotations

import json
from collections import Counter
from collections.abc import Callable, Sequence
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Literal

from yz.ajan.metin_kipi import araclari_yaz, coz
from yz.arac.kutu import AracKutusu
from yz.arac.tanim import Arac, AracSonucu
from yz.hatalar import DesteklenmiyorHatasi
from yz.istem.sablonlar import sablon
from yz.metin import kirp
from yz.saglayici.taban import Saglayici
from yz.saglayici.tipler import AracCagrisi, Kullanim, Mesaj, MesajGirdisi, Yanit, mesajlari_coz

Kip = Literal["oto", "yerel", "metin"]


@dataclass
class AjanAyari:
    azami_adim: int = 6  # en çok kaç model çağrısı (son yanıt hariç)
    belirtec_butcesi: int | None = None  # toplam girdi+çıktı belirteci sınırı
    ayni_cagri_siniri: int = 2  # aynı araç+argüman en çok kaç kez çalıştırılır
    ardisik_hata_siniri: int = 3
    kip: Kip = "oto"
    son_yanit_iste: bool = True  # adım sınırında araçsız son bir yanıt iste
    azami_gozlem: int = 3000  # modele dönen araç çıktısı (karakter)
    azami_belirtec: int | None = 600  # tek model çağrısının çıktı sınırı
    dil: str = "tr"


@dataclass
class Adim:
    """Dökümün bir satırı."""

    sira: int
    tur: Literal["model", "arac", "bilgi"]
    icerik: str
    arac: str | None = None
    argumanlar: dict[str, Any] | None = None
    hata: bool = False
    belirtec: int = 0


@dataclass
class AjanSonucu:
    yanit: str
    durma_nedeni: str
    adimlar: list[Adim]
    mesajlar: list[Mesaj]
    kullanim: Kullanim
    kip: str

    @property
    def arac_cagrilari(self) -> list[Adim]:
        return [a for a in self.adimlar if a.tur == "arac"]

    def dokum_kaydet(self, yol: str | Path) -> None:
        """Dökümü JSONL olarak yazar (web/kayit.html ile görüntülenebilir)."""
        satirlar = [
            json.dumps(asdict(a), ensure_ascii=False) for a in self.adimlar
        ]  # tur: model/arac/bilgi
        ozet = {"tur": "sonuc", "yanit": self.yanit, "durma_nedeni": self.durma_nedeni,
                "kip": self.kip, "belirtec": self.kullanim.toplam}  # fmt: skip
        satirlar.append(json.dumps(ozet, ensure_ascii=False))
        Path(yol).parent.mkdir(parents=True, exist_ok=True)
        Path(yol).write_text("\n".join(satirlar) + "\n", encoding="utf-8")


class Ajan:
    """Araç kullanan ajan. `calistir` her çağrıda yeni bir görev çözer (durumsuzdur)."""

    def __init__(
        self,
        saglayici: Saglayici,
        araclar: AracKutusu | Sequence[Arac],
        *,
        sistem: str | None = None,
        ayar: AjanAyari | None = None,
        olay: Callable[[Adim], None] | None = None,
    ) -> None:
        self.saglayici = saglayici
        self.kutu = araclar if isinstance(araclar, AracKutusu) else AracKutusu(araclar)
        self.ayar = ayar or AjanAyari()
        self.sistem = sistem
        self.olay = olay  # her adımda çağrılır (canlı gösterim için)

    def _sistem_istemi(self, kip: str) -> str:
        ek = f"\n\n{self.sistem}" if self.sistem else ""
        if kip == "metin":
            araclar = araclari_yaz(self.kutu.tanimlar(), self.ayar.dil)
            return sablon("ajan_metin_sistem", self.ayar.dil, araclar=araclar) + ek
        return sablon("ajan_sistem", self.ayar.dil) + ek

    def calistir(self, gorev: str | Sequence[MesajGirdisi]) -> AjanSonucu:
        return _Calisma(self, gorev).yurut()


class _Calisma:
    """Tek bir görevin durumu (adımlar, mesajlar, sayaçlar)."""

    def __init__(self, ajan: Ajan, gorev: str | Sequence[MesajGirdisi]) -> None:
        self.ajan = ajan
        self.ayar = ajan.ayar
        self.kip: str = "metin" if self.ayar.kip == "metin" else "yerel"
        gecmis = mesajlari_coz(gorev if isinstance(gorev, str) else list(gorev))
        self.gorev = [m for m in gecmis if m.rol != "system"]
        self.mesajlar = [Mesaj.sistem(ajan._sistem_istemi(self.kip)), *self.gorev]
        self.adimlar: list[Adim] = []
        self.kullanim = Kullanim()
        self.cagri_sayaci: Counter[str] = Counter()
        self.ardisik_hata = 0
        self.belirsiz = 0
        self.uyarildi: set[str] = set()

    # ------------------------------------------------------------------ yardımcılar

    def _adim(self, tur: Literal["model", "arac", "bilgi"], icerik: str, **ek: Any) -> None:
        adim = Adim(len(self.adimlar) + 1, tur, icerik, **ek)
        self.adimlar.append(adim)
        if self.ajan.olay is not None:
            self.ajan.olay(adim)

    def _bitir(self, yanit: str, neden: str) -> AjanSonucu:
        return AjanSonucu(
            yanit.strip(), neden, self.adimlar, self.mesajlar, self.kullanim, self.kip
        )

    def _metin_kipine_gec(self, neden: str) -> None:
        self.kip = "metin"
        self.mesajlar = [Mesaj.sistem(self.ajan._sistem_istemi("metin")), *self.gorev]
        self._adim("bilgi", f"Metin kipine geçildi: {neden}")

    def _sor(self, araclarla: bool) -> Yanit:
        secenek: dict[str, Any] = {"azami_belirtec": self.ayar.azami_belirtec}
        if araclarla and self.kip == "yerel":
            secenek["araclar"] = self.ajan.kutu.tanimlar()
        elif self.kip == "metin":
            secenek["dur"] = ["\nGözlem:", "\nObservation:"]
        yanit: Yanit = self.ajan.saglayici.sohbet(self.mesajlar, **secenek)
        self.kullanim = self.kullanim + yanit.kullanim
        return yanit

    def _arac_yurut(self, cagri: AracCagrisi) -> AracSonucu:
        anahtar = f"{cagri.ad}:{json.dumps(cagri.argumanlar, sort_keys=True, ensure_ascii=False)}"
        self.cagri_sayaci[anahtar] += 1
        if self.cagri_sayaci[anahtar] > self.ayar.ayni_cagri_siniri:
            self.uyarildi.add(anahtar)
            sonuc = AracSonucu(sablon("ajan_tekrar_uyarisi", self.ayar.dil), hata=True)
        else:
            sonuc = self.ajan.kutu.cagir(cagri)
        sonuc = AracSonucu(kirp(sonuc.icerik, self.ayar.azami_gozlem), sonuc.hata)
        self.ardisik_hata = self.ardisik_hata + 1 if sonuc.hata else 0
        self._adim(
            "arac", sonuc.icerik, arac=cagri.ad, argumanlar=cagri.argumanlar, hata=sonuc.hata
        )
        return sonuc

    def _dongu_mu(self, cagrilar: Sequence[AracCagrisi]) -> bool:
        """Uyarıldığı hâlde aynı çağrıyı yineliyor mu?"""
        for c in cagrilar:
            anahtar = f"{c.ad}:{json.dumps(c.argumanlar, sort_keys=True, ensure_ascii=False)}"
            if anahtar in self.uyarildi:
                return True
        return False

    # ------------------------------------------------------------------ ana döngü

    def yurut(self) -> AjanSonucu:
        bos_sayisi = 0
        for _ in range(self.ayar.azami_adim):
            try:
                yanit = self._sor(araclarla=True)
            except DesteklenmiyorHatasi as hata:
                if self.ayar.kip != "oto" or self.kip == "metin":
                    raise
                self._metin_kipine_gec(f"sağlayıcı araç çağrısını desteklemiyor ({hata})")
                continue
            self._adim("model", yanit.metin, belirtec=yanit.kullanim.toplam)
            if yanit.bitis_nedeni == "ret":
                return self._bitir(yanit.metin or "Model yanıt vermeyi reddetti.", "ret")
            butce = self.ayar.belirtec_butcesi
            if butce is not None and self.kullanim.toplam > butce:
                return self._bitir(yanit.metin, "butce")
            sonuc = self._yerel_adim(yanit) if self.kip == "yerel" else self._metin_adimi(yanit)
            if isinstance(sonuc, AjanSonucu):
                return sonuc
            if sonuc == "bos":
                bos_sayisi += 1
                if bos_sayisi >= 2:
                    return self._bitir("", "bos_yanit")
            if self.ardisik_hata >= self.ayar.ardisik_hata_siniri:
                return self._bitir(yanit.metin, "hata_dongusu")
        return self._son_yanit()

    def _yerel_adim(self, yanit: Yanit) -> AjanSonucu | str:
        cagrilar = yanit.arac_cagrilari
        if not cagrilar:
            karar = coz(yanit.metin, self.ajan.kutu.tanimlar())
            if karar.tur == "eylem" and self.ayar.kip == "oto":
                self._metin_kipine_gec("model araçları düz metinle çağırıyor")
                return self._metin_adimi(yanit)
            if not yanit.metin.strip():
                self.mesajlar.append(Mesaj.kullanici(sablon("ajan_son_yanit", self.ayar.dil)))
                return "bos"
            return self._bitir(yanit.metin, "yanit")
        if self._dongu_mu(cagrilar):
            return self._bitir(yanit.metin, "dongu")
        self.mesajlar.append(yanit.mesaj())
        for cagri in cagrilar:
            sonuc = self._arac_yurut(cagri)
            self.mesajlar.append(Mesaj.arac(cagri.kimlik, sonuc.icerik, cagri.ad, hata=sonuc.hata))
        return "devam"

    def _metin_adimi(self, yanit: Yanit) -> AjanSonucu | str:
        karar = coz(yanit.metin, self.ajan.kutu.tanimlar())
        if karar.tur == "yanit":
            return self._bitir(karar.yanit, "yanit")
        self.mesajlar.append(Mesaj.asistan(yanit.metin.strip()))
        if karar.tur == "belirsiz":
            self.belirsiz += 1
            if self.belirsiz >= 2:
                return self._bitir(yanit.metin, "bicim")
            if not yanit.metin.strip():
                return "bos"
            self.mesajlar.append(Mesaj.kullanici(sablon("ajan_bicim_uyarisi", self.ayar.dil)))
            return "devam"
        self.belirsiz = 0
        cagri = AracCagrisi(
            kimlik=f"metin_{len(self.adimlar)}", ad=karar.arac, argumanlar=karar.girdi
        )
        if self._dongu_mu([cagri]):
            return self._bitir(yanit.metin, "dongu")
        sonuc = self._arac_yurut(cagri)
        self.mesajlar.append(
            Mesaj.kullanici(sablon("ajan_gozlem", self.ayar.dil, gozlem=sonuc.icerik))
        )
        return "devam"

    def _son_yanit(self) -> AjanSonucu:
        if not self.ayar.son_yanit_iste:
            return self._bitir("", "adim_siniri")
        self.mesajlar.append(Mesaj.kullanici(sablon("ajan_son_yanit", self.ayar.dil)))
        yanit = self._sor(araclarla=False)
        self._adim("model", yanit.metin, belirtec=yanit.kullanim.toplam)
        metin = yanit.metin
        if self.kip == "metin":
            karar = coz(metin, self.ajan.kutu.tanimlar())
            metin = karar.yanit if karar.tur == "yanit" else metin
        return self._bitir(metin, "adim_siniri")
