"""Araç kutusu: bir oturumda kullanılabilecek araçlar + izin listesi + onay kancası.

`cagir(cagri)` modelin araç çağrısını güvenle yürütür ve her durumda bir gözlem metni döndürür:
    bilinmeyen araç    → "böyle bir araç yok; kullanılabilenler: …"
    izin verilmeyen    → izin listesinin açıklaması
    tehlikeli araç     → onay kancası sorulur; kanca yoksa VARSAYILAN RET (güvenli taraf). Kanca,
                         doğrulanmış argümanları görür; araç TAM OLARAK onaylanan argümanlarla çalışır
    hatalı argüman     → Arac.calistir'in hata iletisi (model düzeltsin diye)
Kim kullanır: ajan/dongu.py, sunucu (araçlı sohbet), mcp/kopru.py.
Genişletme: araç eklemek için `AracKutusu([...])` listesine ekleyin; ince izin kuralı için
`onay` kancasına kendi işlevinizi verin (ajan/onay.py örnekleri).
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Any

from yz.arac.tanim import Arac, AracSonucu
from yz.guvenlik.izin import AracIzinListesi
from yz.hatalar import AracHatasi
from yz.saglayici.tipler import AracCagrisi, AracTanimi

OnayKancasi = Callable[[Arac, dict[str, Any]], bool]


class AracKutusu:
    """Ada göre araç deposu."""

    def __init__(
        self,
        araclar: Iterable[Arac] = (),
        *,
        izin: AracIzinListesi | None = None,
        onay: OnayKancasi | None = None,
    ) -> None:
        self._araclar: dict[str, Arac] = {}
        self.izin = izin or AracIzinListesi()
        self.onay = onay
        for a in araclar:
            self.ekle(a)

    def ekle(self, arac: Arac) -> None:
        if arac.ad in self._araclar:
            raise AracHatasi(f"`{arac.ad}` adında bir araç zaten var; farklı bir ad verin.")
        self._araclar[arac.ad] = arac

    def __contains__(self, ad: object) -> bool:
        return ad in self._araclar

    def __len__(self) -> int:
        return len(self._araclar)

    @property
    def adlar(self) -> list[str]:
        """Kullanılabilir (izinli) araçların adları."""
        return [ad for ad in self._araclar if self.izin.izinli_mi(ad)]

    def al(self, ad: str) -> Arac:
        return self._araclar[ad]

    def tanimlar(self) -> list[AracTanimi]:
        """Modele sunulacak tanımlar (izin verilmeyenler hiç gösterilmez)."""
        return [self._araclar[ad].tanim() for ad in self.adlar]

    def cagir(self, cagri: AracCagrisi) -> AracSonucu:
        arac = self._araclar.get(cagri.ad)
        if arac is None:
            return AracSonucu(
                f"Hata: `{cagri.ad}` adında bir araç yok. Kullanılabilen araçlar: "
                f"{', '.join(self.adlar) or '(yok)'}.",
                hata=True,
            )
        if not self.izin.izinli_mi(arac.ad):
            return AracSonucu(f"Hata: {self.izin.neden(arac.ad)}", hata=True)
        if not arac.tehlikeli:
            return arac.calistir(cagri.argumanlar)
        if self.onay is None:
            return AracSonucu(
                f"Hata: `{arac.ad}` onay gerektiren bir araç ve onay verilmedi. "
                "Bu araç olmadan devam et.",
                hata=True,
            )
        # Kanca, aracın GERÇEKTEN çalışacağı (doğrulanmış, düzeltilmiş) argümanları görür ve araç tam
        # olarak onlarla çalışır. Ham argümanı onaylatıp düzeltilmişi çalıştırmak, "Yol"/"yol" gibi
        # anahtar oyunlarıyla onaylanmamış bir değerin çalışmasına yol açardı.
        kwargs, hata_iletisi = arac.hazirla(cagri.argumanlar)
        if kwargs is None:
            return AracSonucu(hata_iletisi, hata=True)
        if not self.onay(arac, kwargs):
            return AracSonucu(
                f"Kullanıcı `{arac.ad}` aracının çalışmasını onaylamadı. Başka bir yol öner.",
                hata=True,
            )
        return arac.yurut(kwargs)
