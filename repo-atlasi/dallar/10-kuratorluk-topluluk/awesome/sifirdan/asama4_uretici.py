"""Aşama 4 — Veriden README üretici (JSON -> Markdown).

Elle düzenlenen tek bir README yarım milyon yıldızı bile taşıyabilir (sindresorhus/awesome
hâlâ öyle), ama liste büyüdükçe "veri ayrı, görünüm ayrı" mimarisi kazanır:
awesome-selfhosted her yazılımı ayrı bir YAML dosyasında tutar ve README'yi bir bot
üretir; awesome-python ise ters yönde gider (README tek kaynak, site ondan üretilir).

Bu üretici:
1. Veriyi doğrular (zorunlu alanlar, şema, açıklama biçimi, yinelenen adres).
2. Kategorileri ve girdileri yerel alfabeye (ya da bir metriğe) göre sıralar.
3. İçindekiler'i GitHub'ın kimlik kuralıyla kendisi üretir (elle tutulan
   İçindekiler'in kayması diye bir sorun kalmaz).
4. Çıktıyı biçimlendiricilerle (Prettier) kararlı yazar: '-' madde, '_vurgu_',
   başlıktan sonra boş satır, dosya sonunda tek satır sonu.
5. Denetim kipi: diskteki README üretilenle aynı değilse hata verir. CI'da "biri
   README'yi elle düzenlemiş ya da veriyi değiştirip üretmeyi unutmuş" durumunu yakalar.
"""

from __future__ import annotations

import difflib
import json
from pathlib import Path

from asama1_ayristirici import ascii_katla, github_kimligi, kucult, siralama_anahtari
from asama2_denetim import url_normallestir

ROZET = "[![Awesome](https://awesome.re/badge.svg)](https://awesome.re)"


class VeriHatasi(ValueError):
    def __init__(self, hatalar: list[str]) -> None:
        super().__init__("\n".join(hatalar))
        self.hatalar = hatalar


def dogrula(veri: dict, en_az_girdi: int = 1) -> list[str]:
    """Şema ve içerik denetimi. Boş liste = veri temiz."""
    hatalar = []
    for alan in ("baslik", "aciklama", "kategoriler"):
        if not veri.get(alan):
            hatalar.append(f"'{alan}' alanı zorunlu")
    gorulen: dict[str, str] = {}
    for k_no, kategori in enumerate(veri.get("kategoriler") or [], start=1):
        k_ad = kategori.get("ad") or f"#{k_no}"
        if not kategori.get("ad"):
            hatalar.append(f"{k_no}. kategorinin 'ad' alanı yok")
        girdiler = kategori.get("girdiler") or []
        if len(girdiler) < en_az_girdi:
            hatalar.append(f"'{k_ad}' kategorisinde en az {en_az_girdi} girdi olmalı ({len(girdiler)} var)")
        for g_no, girdi in enumerate(girdiler, start=1):
            yer = f"{k_ad} > {girdi.get('ad') or f'#{g_no}'}"
            for alan in ("ad", "url", "aciklama"):
                if not girdi.get(alan):
                    hatalar.append(f"{yer}: '{alan}' alanı zorunlu")
            url = girdi.get("url") or ""
            if url and not url.startswith(("https://", "http://")):
                hatalar.append(f"{yer}: adres http(s) ile başlamalı")
            aciklama = (girdi.get("aciklama") or "").strip()
            if aciklama and not aciklama.endswith((".", "!", "?")):
                hatalar.append(f"{yer}: açıklama nokta ile bitmeli")
            if url:
                anahtar = url_normallestir(url)
                if anahtar in gorulen:
                    hatalar.append(f"{yer}: adres '{gorulen[anahtar]}' girdisinde de var")
                gorulen.setdefault(anahtar, yer)
    return hatalar


def _sirala(ogeler: list[dict], yontem: str, yerel: str, metrik: str | None) -> list[dict]:
    if yontem == "veri":
        return list(ogeler)
    alfabe = sorted(ogeler, key=lambda o: siralama_anahtari(o["ad"], yerel))
    if yontem == "metrik" and metrik:
        # büyükten küçüğe; eşitlikte alfabetik (sorted kararlıdır)
        return sorted(alfabe, key=lambda o: -(o.get(metrik) or 0))
    return alfabe


def _capa(ad: str, ascii_capa: bool) -> tuple[str, str]:
    """(başlık önü HTML'i, İçindekiler'de kullanılacak kimlik) döner."""
    kimlik = github_kimligi(ad)
    if ascii_capa:
        sade = github_kimligi(ascii_katla(kucult(ad, "tr")))
        if sade != kimlik:
            return f'<a id="{sade}"></a>', sade
    return "", kimlik


def uret(veri: dict) -> str:
    """Doğrulanmış veriden README metni üretir. Bozuk veride VeriHatasi fırlatır."""
    hatalar = dogrula(veri, veri.get("en_az_girdi", 1))
    if hatalar:
        raise VeriHatasi(hatalar)
    yerel = veri.get("yerel", "en")
    siralama = veri.get("siralama", "alfabetik")
    metrik = veri.get("metrik_alani")
    ascii_capa = veri.get("ascii_capa", False)
    toc_basligi = veri.get("icindekiler_basligi", "Contents")

    kategoriler = _sirala(veri["kategoriler"], "veri" if siralama == "veri" else "alfabetik", yerel, None)
    baslik = veri["baslik"] + (f" {ROZET}" if veri.get("rozet", True) else "")
    satirlar = [f"# {baslik}", "", f"> {veri['aciklama']}", "", f"## {toc_basligi}", ""]

    capalar = [_capa(k["ad"], ascii_capa) for k in kategoriler]
    satirlar += [f"- [{k['ad']}](#{kimlik})" for k, (_, kimlik) in zip(kategoriler, capalar)]

    for kategori, (on_ek, _) in zip(kategoriler, capalar):
        satirlar += ["", f"## {on_ek}{kategori['ad']}", ""]
        if kategori.get("aciklama"):
            satirlar += [f"_{kategori['aciklama']}_", ""]
        for girdi in _sirala(kategori["girdiler"], siralama, yerel, metrik):
            satirlar.append(f"- [{girdi['ad']}]({girdi['url']}) - {girdi['aciklama'].strip()}")

    if veri.get("katki_dosyasi"):
        # awesome kuralı: Contributing bölümü İçindekiler'de yer almaz, en altta durur.
        satirlar += ["", "## Contributing", "", f"Katkı kuralları için [{veri['katki_dosyasi']}]({veri['katki_dosyasi']})."]
    return "\n".join(satirlar) + "\n"


def tazelik_farki(mevcut: str, uretilen: str, dosya: str = "README.md") -> str:
    """Boş dize: dosya güncel. Değilse birleşik fark (unified diff) döner."""
    if mevcut == uretilen:
        return ""
    fark = difflib.unified_diff(
        mevcut.splitlines(keepends=True), uretilen.splitlines(keepends=True), f"{dosya} (diskteki)", f"{dosya} (üretilen)"
    )
    return "".join(fark)


def dosyadan_uret(veri_yolu: str | Path) -> str:
    return uret(json.loads(Path(veri_yolu).read_text(encoding="utf-8")))
