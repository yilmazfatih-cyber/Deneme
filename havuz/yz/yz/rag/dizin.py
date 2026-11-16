"""RAG dizini: parçalar + BM25 + vektör deposu; karma arama (RRF) ve diskte kalıcılık.

Arama kipleri: "bm25" (sözcük), "vektor" (gömme), "karma" (ikisinin RRF birleşimi; varsayılan).
RRF (Reciprocal Rank Fusion): puan(d) = Σ 1 / (60 + sıra_i(d)); puanları farklı ölçekte iki
listeyi ayar gerektirmeden birleştirir.
Disk düzeni (klasör): parcalar.jsonl, vektorler.npy, meta.json (gömme türü ve ayarları).
BM25 yüklemede parçalardan yeniden kurulur (hızlıdır; dosyası yoktur).
Kim kullanır: rag/yanit.py, arac/hazir/belge.py, cli.py (`indeksle`, `sor`), sunucu, mcp.
Genişletme: yeniden sıralama → `yeniden_siralayici` kancası (rag/siralama.py'deki örnek).
"""

from __future__ import annotations

import json
import threading
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from yz.hatalar import VeriHatasi
from yz.rag.bm25 import BM25
from yz.rag.gomme import GomebilirSaglayici, Gomme, KarmaGomme, gomme_durumdan
from yz.rag.parcala import Parca, belgeyi_parcala
from yz.rag.vektor_deposu import VektorDeposu
from yz.rag.yukleyici import Belge

AramaKipi = Literal["karma", "bm25", "vektor"]
RRF_K = 60


@dataclass
class AramaSonucu:
    """Bir arama isabeti ve neden bulunduğu."""

    parca: Parca
    puan: float  # karma kipte RRF puanı; diğerlerinde kendi puanı
    bm25_puani: float = 0.0
    benzerlik: float = 0.0  # vektör kosinüs benzerliği
    bm25_sirasi: int | None = None
    vektor_sirasi: int | None = None
    notlar: list[str] = field(default_factory=list)


YenidenSiralayici = Callable[[str, list[AramaSonucu]], list[AramaSonucu]]


def rrf_birlestir(siralamalar: Sequence[Sequence[int]], k: int = RRF_K) -> list[tuple[int, float]]:
    """Sıralı kimlik listelerini RRF ile birleştirir: [(kimlik, puan), …] (azalan)."""
    puanlar: dict[int, float] = {}
    for liste in siralamalar:
        for sira, kimlik in enumerate(liste, start=1):
            puanlar[kimlik] = puanlar.get(kimlik, 0.0) + 1.0 / (k + sira)
    return sorted(puanlar.items(), key=lambda ikili: (-ikili[1], ikili[0]))


class RagDizini:
    """Parça deposu ve arama."""

    def __init__(
        self,
        gomme: Gomme | None = None,
        *,
        hedef_belirtec: int = 220,
        ortusme_cumle: int = 1,
        bm25_kipi: str = "kok",
        yeniden_siralayici: YenidenSiralayici | None = None,
    ) -> None:
        self.gomme: Gomme = gomme if gomme is not None else KarmaGomme()
        self.hedef_belirtec = hedef_belirtec
        self.ortusme_cumle = ortusme_cumle
        self.parcalar: list[Parca] = []
        self.bm25 = BM25(kip=bm25_kipi)
        self.vektorler = VektorDeposu()
        self.yeniden_siralayici = yeniden_siralayici
        self._kilit = threading.Lock()
        self._belge_kimlikleri: set[str] = set()

    def __len__(self) -> int:
        return len(self.parcalar)

    @property
    def belgeler(self) -> list[str]:
        """Dizindeki belgelerin kaynak adları (eklenme sırasıyla, tekrarsız)."""
        return list(dict.fromkeys(p.kaynak for p in self.parcalar))

    def ekle(self, belgeler: Sequence[Belge]) -> int:
        """Belgeleri parçalayıp dizine ekler; eklenen parça sayısını döndürür.

        Aynı belge (kaynak + içerik) ikinci kez eklenmez. KarmaGomme kullanılıyorsa ve dizin
        boşsa IDF ağırlıkları bu belgelerden öğrenilir.
        """
        with self._kilit:
            yeni: list[Parca] = []
            for belge in belgeler:
                if belge.kimlik in self._belge_kimlikleri:
                    continue
                self._belge_kimlikleri.add(belge.kimlik)
                yeni.extend(belgeyi_parcala(belge, self.hedef_belirtec, self.ortusme_cumle))
            if not yeni:
                return 0
            metinler = [p.metin for p in yeni]
            if isinstance(self.gomme, KarmaGomme) and not self.parcalar:
                self.gomme.idf_ogren(metinler)
            self.vektorler.ekle(self.gomme.gom(metinler))
            self.bm25.ekle(metinler)
            self.parcalar.extend(yeni)
            return len(yeni)

    def ara(
        self, sorgu: str, k: int = 4, kip: AramaKipi = "karma", aday_sayisi: int = 30
    ) -> list[AramaSonucu]:
        """En ilgili `k` parçayı döndürür."""
        if not self.parcalar or not sorgu.strip():
            return []
        bm25 = self.bm25.ara(sorgu, aday_sayisi) if kip != "vektor" else []
        vektor: list[tuple[int, float]] = []
        if kip != "bm25":
            vektor = self.vektorler.ara(self.gomme.gom([sorgu]), aday_sayisi)
        bm25_sira = {i: s for s, (i, _) in enumerate(bm25, start=1)}
        vektor_sira = {i: s for s, (i, _) in enumerate(vektor, start=1)}
        bm25_puan = dict(bm25)
        benzerlik = dict(vektor)
        if kip == "bm25":
            sirali = bm25
        elif kip == "vektor":
            sirali = vektor
        else:
            sirali = rrf_birlestir([[i for i, _ in bm25], [i for i, _ in vektor]])
        sonuclar = [
            AramaSonucu(
                parca=self.parcalar[i],
                puan=puan,
                bm25_puani=bm25_puan.get(i, 0.0),
                benzerlik=benzerlik.get(i, 0.0),
                bm25_sirasi=bm25_sira.get(i),
                vektor_sirasi=vektor_sira.get(i),
            )
            for i, puan in sirali[: max(k, aday_sayisi if self.yeniden_siralayici else k)]
        ]
        if self.yeniden_siralayici is not None:
            sonuclar = self.yeniden_siralayici(sorgu, sonuclar)
        return sonuclar[:k]

    # ------------------------------------------------------------------ kalıcılık

    def kaydet(self, klasor: str | Path) -> None:
        klasor = Path(klasor)
        klasor.mkdir(parents=True, exist_ok=True)
        with self._kilit:
            satirlar = [json.dumps(p.sozluk(), ensure_ascii=False) for p in self.parcalar]
            (klasor / "parcalar.jsonl").write_text("\n".join(satirlar) + "\n", encoding="utf-8")
            self.vektorler.kaydet(klasor / "vektorler.npy")
            meta: dict[str, Any] = {
                "surum": 1,
                "gomme": self.gomme.durum(),
                "hedef_belirtec": self.hedef_belirtec,
                "ortusme_cumle": self.ortusme_cumle,
                "bm25_kipi": self.bm25.kip,
                "parca_sayisi": len(self.parcalar),
            }
            (klasor / "meta.json").write_text(
                json.dumps(meta, ensure_ascii=False), encoding="utf-8"
            )

    @classmethod
    def yukle(cls, klasor: str | Path, saglayici: GomebilirSaglayici | None = None) -> RagDizini:
        klasor = Path(klasor)
        meta_yolu = klasor / "meta.json"
        if not meta_yolu.is_file():
            raise VeriHatasi(
                f"Dizin bulunamadı: {klasor}. Önce belgeleri dizinleyin: "
                f"python -m yz indeksle <klasör> --dizin {klasor}"
            )
        meta = json.loads(meta_yolu.read_text(encoding="utf-8"))
        dizin = cls(
            gomme_durumdan(meta["gomme"], saglayici),
            hedef_belirtec=int(meta.get("hedef_belirtec", 220)),
            ortusme_cumle=int(meta.get("ortusme_cumle", 1)),
            bm25_kipi=str(meta.get("bm25_kipi", "kok")),
        )
        satirlar = (klasor / "parcalar.jsonl").read_text(encoding="utf-8").splitlines()
        dizin.parcalar = [Parca(**json.loads(s)) for s in satirlar if s.strip()]
        dizin._belge_kimlikleri = {p.belge_kimligi for p in dizin.parcalar}
        dizin.vektorler = VektorDeposu.yukle(klasor / "vektorler.npy")
        dizin.bm25.ekle([p.metin for p in dizin.parcalar])
        if len(dizin.vektorler) != len(dizin.parcalar):
            raise VeriHatasi(
                f"Dizin bozuk: {len(dizin.parcalar)} parça ama {len(dizin.vektorler)} vektör var. "
                "Dizini yeniden kurun."
            )
        return dizin
