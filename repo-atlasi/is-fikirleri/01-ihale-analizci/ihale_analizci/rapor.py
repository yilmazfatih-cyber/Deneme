"""Uyum kontrol listesi: Markdown (okumak için) ve CSV (Excel'de takip için)."""

import csv
import re
from pathlib import Path

from .cikaricilar import KATEGORILER, Bulgu
from .metin import kisalt

CSV_SUTUNLARI = ["durum", "kategori", "baslik", "deger", "uyari", "dosya", "bolum", "alt_madde", "satir", "alinti", "yontem"]

# Belge ve model metni rapora girerken Markdown/HTML olarak yorumlanmamalı: "![](http://...)" uzak resim
# yükletip veri sızdırabilir, "<img>" ve "[bağlantı](...)" da öyle. Bu karakterler ters bölüyle kaçırılır.
_MD_OZEL = re.compile(r"([\\`*_\[\]<>|#])")
# Excel, "=", "+", "-", "@", sekme ya da satır başı ile başlayan hücreyi formül sayar (CSV/formül enjeksiyonu).
_FORMUL_BASI = ("=", "+", "-", "@", "\t", "\r")


def _md_kacis(metin: str) -> str:
    return _MD_OZEL.sub(r"\\\1", " ".join(str(metin).split()))


def _csv_hucre(deger):
    """Formül gibi başlayan metnin önüne ' koyar; Excel onu düz metin olarak gösterir."""
    if isinstance(deger, str) and deger.startswith(_FORMUL_BASI):
        return "'" + deger
    return deger


def kontrol_listesi_md(bulgular: list[Bulgu], eksikler: list[tuple[str, str]], belgeler: list[str], notlar: list[str]) -> str:
    belge_listesi = ", ".join(_md_kacis(b) for b in belgeler) or "—"
    satirlar = [
        "# İhale uyum kontrol listesi",
        "",
        f"- **İncelenen belgeler:** {belge_listesi}",
        *[f"- {_md_kacis(n)}" for n in notlar],
        "- **Uyarı:** Bu liste teklif hazırlığına yardımcı olur, hukuki görüş değildir. "
        "Her maddeyi kaynağından doğrulayın.",
        "",
        "## Özet",
        "",
        "| Kategori | Bulunan madde | Bulunamayan kontrol |",
        "| --- | --- | --- |",
    ]
    for kod, ad in KATEGORILER.items():
        bulunan = sum(1 for b in bulgular if b.kategori == kod)
        eksik = sum(1 for k, _ in eksikler if k == kod)
        satirlar.append(f"| {ad} | {bulunan} | {eksik} |")
    for kod, ad in KATEGORILER.items():
        grup = [b for b in bulgular if b.kategori == kod]
        if not grup:
            continue
        satirlar += ["", f"## {ad}", ""]
        for b in grup:
            deger = f": {_md_kacis(b.deger)}" if b.deger else ""
            etiket = " _(yerel LLM)_" if b.yontem == "llm" else ""
            satirlar.append(f"- [ ] **{_md_kacis(b.baslik)}**{deger}{etiket}")
            if b.uyari:
                satirlar.append(f"  - Dikkat: {_md_kacis(b.uyari)}")
            satirlar.append(f"  - Kaynak: {_md_kacis(b.birim.kaynak())}")
            satirlar.append(f"  - Alıntı: “{_md_kacis(kisalt(b.birim.metin, 300))}”")
    if eksikler:
        satirlar += ["", "## Belgede bulunamayanlar", ""]
        for kod, baslik in eksikler:
            satirlar.append(f"- [ ] **{baslik}** ({KATEGORILER[kod]}): bulunamadı, şartnameyi elle kontrol edin.")
    return "\n".join(satirlar) + "\n"


def kontrol_listesi_csv(bulgular: list[Bulgu], eksikler: list[tuple[str, str]], yol: Path) -> None:
    """Türkçe Excel ';' ayırıcı bekler (ondalık ayırıcı virgül); BOM, Türkçe karakterleri korur."""
    with open(yol, "w", encoding="utf-8-sig", newline="") as dosya:
        yazici = csv.writer(dosya, delimiter=";")
        yazici.writerow(CSV_SUTUNLARI)
        for b in bulgular:
            k = b.birim
            satir = ["açık", b.kategori, b.baslik, b.deger, b.uyari, k.dosya, k.bolum, k.alt_madde or "", k.satir, k.metin, b.yontem]
            yazici.writerow([_csv_hucre(h) for h in satir])
        for kod, baslik in eksikler:
            yazici.writerow(["bulunamadı", kod, baslik, "", "Belgede bulunamadı", "", "", "", "", "", "kural"])
