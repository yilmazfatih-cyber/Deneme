"""Aşama 1 — çekirdek: akış bilgisi, dönüştürücü sözleşmesi ve öncelikli kayıt defteri.

markitdown'un kalbi üç fikirdir (packages/markitdown/src/markitdown/_markitdown.py):
  1. Her girdi bir İKİLİ AKIŞA (BinaryIO) çevrilir; dosya, URL, data: URI fark etmez.
  2. Akış hakkında bildiklerimiz/tahminlerimiz StreamInfo'da tutulur (uzantı, MIME,
     karakter kümesi, dosya adı...). Birden fazla tahmin olabilir.
  3. Dönüştürücüler öncelik sırasına göre denenir: accepts() "bakarım" derse
     convert() çağrılır; ilk başarılı sonuç kazanır, hatalar biriktirilir.
"""

from __future__ import annotations

import importlib
import io
import os
import re
import warnings
from dataclasses import asdict, dataclass
from importlib.metadata import entry_points
from typing import BinaryIO

# Küçük değer = önce denenir (asıl projedeki sabitlerle aynı anlam)
ONCELIK_OZEL_BICIM = 0.0  # .docx, .csv gibi belirli biçimler
ONCELIK_GENEL_BICIM = 10.0  # text/*, html, zip gibi "neredeyse her şeyi" kabul edenler


@dataclass(frozen=True, kw_only=True)
class AkisBilgisi:
    """Akış hakkındaki bilgi/tahmin. Her alan boş olabilir."""

    mimetype: str | None = None
    uzanti: str | None = None  # '.docx' gibi, noktalı
    charset: str | None = None
    dosya_adi: str | None = None
    yerel_yol: str | None = None
    url: str | None = None

    def guncelle(self, *digerleri: 'AkisBilgisi', **alanlar) -> 'AkisBilgisi':
        """Kopyala ve güncelle: diğer bilgilerdeki DOLU alanlar ve verilen alanlar üste yazılır."""
        yeni = asdict(self)
        for diger in digerleri:
            yeni.update({k: v for k, v in asdict(diger).items() if v is not None})
        yeni.update(alanlar)
        return AkisBilgisi(**yeni)


@dataclass
class Sonuc:
    markdown: str
    baslik: str | None = None

    def __str__(self) -> str:
        return self.markdown


class Donusturucu:
    """Tüm dönüştürücülerin sözleşmesi.

    accepts(): hızlı karar; çoğunlukla AkisBilgisi'ne bakar. Akıştan okursa
    konumu GERİ ALMAK zorundadır (kayıt defteri bunu denetler).
    convert(): Markdown üretir ya da hata fırlatır.
    """

    def accepts(self, akis: BinaryIO, bilgi: AkisBilgisi, **secenekler) -> bool:
        raise NotImplementedError

    def convert(self, akis: BinaryIO, bilgi: AkisBilgisi, **secenekler) -> Sonuc:
        raise NotImplementedError

    @staticmethod
    def uzanti_veya_mime(bilgi: AkisBilgisi, uzantilar: tuple[str, ...], mime_onekleri: tuple[str, ...]) -> bool:
        uzanti = (bilgi.uzanti or '').lower()
        mime = (bilgi.mimetype or '').lower()
        return uzanti in uzantilar or any(mime.startswith(onek) for onek in mime_onekleri)


class MarkItDownHatasi(Exception):
    pass


class DesteklenmeyenBicim(MarkItDownHatasi):
    pass


class DonusturmeHatasi(MarkItDownHatasi):
    """Kabul eden dönüştürücülerin hepsi hata verdi; denemeler saklanır."""

    def __init__(self, denemeler: list[tuple[str, BaseException]]):
        self.denemeler = denemeler
        ayrinti = '; '.join(f'{ad}: {type(h).__name__}: {h}' for ad, h in denemeler)
        super().__init__(f'Dönüştürme başarısız ({len(denemeler)} deneme): {ayrinti}')


@dataclass
class Kayit:
    donusturucu: Donusturucu
    oncelik: float


def markdown_normalize(metin: str) -> str:
    """Satır sonu boşluklarını sil; art arda 3+ satır sonunu 2'ye indir (en fazla bir boş satır kalır).

    Asıl proje de aynısını yapar. Ek olarak biz baştaki/sondaki boşlukları kırpıp tek satır sonuyla bitiririz.
    """
    metin = '\n'.join(satir.rstrip() for satir in re.split(r'\r?\n', metin))
    return re.sub(r'\n{3,}', '\n\n', metin).strip() + '\n'


class MiniMarkItDown:
    def __init__(self, yerlesikler: bool = True, eklentiler: bool | list[str] = False):
        self._kayitlar: list[Kayit] = []
        if yerlesikler:
            self.yerlesikleri_etkinlestir()
        if eklentiler:
            self.eklentileri_etkinlestir(eklentiler if isinstance(eklentiler, list) else [])

    # --- kayıt defteri -------------------------------------------------------
    def kaydet(self, donusturucu: Donusturucu, oncelik: float = ONCELIK_OZEL_BICIM) -> None:
        """En son kaydedilen, AYNI öncelikteki diğerlerinden önce denenir (başa ekleme)."""
        self._kayitlar.insert(0, Kayit(donusturucu, oncelik))

    def sirali_kayitlar(self) -> list[Kayit]:
        # sorted() kararlıdır: aynı öncelikte ekleme sırası (en yeni önde) korunur
        return sorted(self._kayitlar, key=lambda k: k.oncelik)

    def yerlesikleri_etkinlestir(self) -> None:
        from asama3_donusturuculer import (  # döngüsel içe aktarmayı önlemek için burada
            CsvDonusturucu,
            DocxDonusturucu,
            HtmlDonusturucu,
            JsonDonusturucu,
            DuzMetinDonusturucu,
            ZipDonusturucu,
        )

        # Genel olanlar önce kaydedilir; özel olanlar daha düşük öncelik değeriyle öne geçer
        self.kaydet(DuzMetinDonusturucu(), ONCELIK_GENEL_BICIM)
        self.kaydet(ZipDonusturucu(self), ONCELIK_GENEL_BICIM)
        self.kaydet(HtmlDonusturucu(), ONCELIK_GENEL_BICIM)
        self.kaydet(JsonDonusturucu())
        self.kaydet(CsvDonusturucu())
        self.kaydet(DocxDonusturucu())

    def eklentileri_etkinlestir(self, moduller: list[str]) -> None:
        """Eklenti = register_converters(md) fonksiyonu olan modül.

        Asıl proje eklentileri 'markitdown.plugin' giriş noktası grubundan yükler;
        biz hem 'minimd.eklenti' grubuna hem de açıkça verilen modül adlarına bakarız.
        Bozuk eklenti uygulamayı düşürmez, uyarı verip atlanır.
        """
        adaylar = [ep.load for ep in entry_points(group='minimd.eklenti')]
        adaylar += [lambda ad=ad: importlib.import_module(ad) for ad in moduller]
        for yukle in adaylar:
            try:
                yukle().register_converters(self)
            except Exception as hata:  # noqa: BLE001 - eklenti hatası izole edilir
                warnings.warn(f'Eklenti yüklenemedi, atlanıyor: {hata!r}', stacklevel=2)

    # --- dönüştürme ------------------------------------------------------------
    def convert(self, kaynak: str | bytes | BinaryIO, bilgi: AkisBilgisi | None = None, **secenekler) -> Sonuc:
        if isinstance(kaynak, bytes):
            return self.convert_stream(io.BytesIO(kaynak), bilgi, **secenekler)
        if isinstance(kaynak, str):
            return self.convert_local(kaynak, bilgi, **secenekler)
        return self.convert_stream(kaynak, bilgi, **secenekler)

    def convert_local(self, yol: str, bilgi: AkisBilgisi | None = None, **secenekler) -> Sonuc:
        temel = AkisBilgisi(yerel_yol=yol, uzanti=os.path.splitext(yol)[1] or None, dosya_adi=os.path.basename(yol))
        if bilgi is not None:
            temel = temel.guncelle(bilgi)
        with open(yol, 'rb') as dosya:
            return self.convert_stream(dosya, temel, **secenekler)

    def convert_stream(self, akis: BinaryIO, bilgi: AkisBilgisi | None = None, **secenekler) -> Sonuc:
        from asama2_tahmin import tahminleri_uret

        if not akis.seekable():  # stdin gibi akışları belleğe al: geri sarabilmeliyiz
            akis = io.BytesIO(akis.read())
        tahminler = tahminleri_uret(akis, bilgi or AkisBilgisi())
        return self._donustur(akis, tahminler, **secenekler)

    def _donustur(self, akis: BinaryIO, tahminler: list[AkisBilgisi], **secenekler) -> Sonuc:
        denemeler: list[tuple[str, BaseException]] = []
        konum = akis.tell()
        for bilgi in tahminler + [AkisBilgisi()]:
            for kayit in self.sirali_kayitlar():
                donusturucu = kayit.donusturucu
                ad = type(donusturucu).__name__
                try:
                    kabul = donusturucu.accepts(akis, bilgi, **secenekler)
                except NotImplementedError:
                    kabul = False
                if akis.tell() != konum:
                    raise AssertionError(f'{ad}.accepts() akış konumunu değiştirmemeli')
                if not kabul:
                    continue
                try:
                    sonuc = donusturucu.convert(akis, bilgi, **secenekler)
                except Exception as hata:  # noqa: BLE001 - sıradaki dönüştürücüyü dene
                    denemeler.append((ad, hata))
                    continue
                finally:
                    akis.seek(konum)
                sonuc.markdown = markdown_normalize(sonuc.markdown)
                return sonuc
        if denemeler:
            raise DonusturmeHatasi(denemeler)
        raise DesteklenmeyenBicim('Hiçbir dönüştürücü bu akışı kabul etmedi: biçim desteklenmiyor.')
