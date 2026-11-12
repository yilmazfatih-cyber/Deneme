#!/usr/bin/env python3
"""
DIRECTORY.md üreticisi.

TheAlgorithms/Python'daki `scripts/build_directory_md.py` ile aynı fikir: depo
ağacını dolaş, algoritma dosyalarını bul, klasör yapısını iç içe bir Markdown
listesine çevir. Fark: çıktı Prettier'ın Markdown biçimiyle birebir uyumludur
(`-` madde işareti, başlıklar arasında boş satır) ve başlıklar Türkçe büyük
harf kuralına göre üretilir.

Kullanım:
    python3 betikler/dizin_olustur.py            # DIRECTORY.md dosyasını yazar
    python3 betikler/dizin_olustur.py --kontrol  # güncel değilse 1 ile çıkar
"""

import argparse
import json
import sys
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent
DIZIN_DOSYASI = "DIRECTORY.md"
BASLIK_SOZLUGU = "basliklar.json"
# Orijinal betik `scripts` klasörünü atlar; bizim karşılığımız `betikler`.
ATLANAN_KLASORLER = frozenset({"betikler"})
ALGORITMA_UZANTILARI = frozenset({".py", ".ipynb"})


def algoritma_dosyalari(kok: Path = KOK) -> list[str]:
    """
    Kökten itibaren algoritma dosyalarının göreli yollarını (POSIX biçiminde,
    sıralı) döndürür. `.` ya da `_` ile başlayan, adında `venv` geçen ve
    ATLANAN_KLASORLER içindeki klasörler ile `__init__.py` dosyaları atlanır.

    >>> "arama/ikili_arama.py" in algoritma_dosyalari()
    True
    >>> any(yol.startswith("betikler/") for yol in algoritma_dosyalari())
    False
    """
    sonuc = []
    for yol in kok.rglob("*"):
        goreli = yol.relative_to(kok)
        klasorler = goreli.parts[:-1]
        if any(k[0] in "._" or "venv" in k or k in ATLANAN_KLASORLER for k in klasorler):
            continue
        if yol.is_file() and yol.suffix in ALGORITMA_UZANTILARI and yol.name != "__init__.py":
            sonuc.append(goreli.as_posix())
    return sorted(sonuc)


def turkce_buyuk_harf(harf: str) -> str:
    """
    Tek harfi Türkçe kurala göre büyütür: i -> İ, ı -> I.

    >>> turkce_buyuk_harf("i"), turkce_buyuk_harf("ı"), turkce_buyuk_harf("ş")
    ('İ', 'I', 'Ş')
    """
    return {"i": "İ", "ı": "I"}.get(harf, harf.upper())


def baslik_yap(ad: str, sozluk: dict[str, str] | None = None) -> str:
    """
    Dosya ya da klasör adını okunur başlığa çevirir. Sözlükte karşılığı varsa
    onu kullanır (ASCII dosya adlarında olmayan ç, ğ, ı, ö, ş, ü harfleri için).

    `str.title()` Türkçede yanlıştır: "ikili".title() == "Ikili" olur.

    >>> baslik_yap("ikili_arama.py")
    'İkili Arama'
    >>> baslik_yap("siralama", {"siralama": "Sıralama"})
    'Sıralama'
    """
    kok_ad = ad.removesuffix(".py").removesuffix(".ipynb")
    if sozluk and kok_ad in sozluk:
        return sozluk[kok_ad]
    kelimeler = [k for k in kok_ad.split("_") if k]
    return " ".join(turkce_buyuk_harf(k[0]) + k[1:] for k in kelimeler)


def capa_yap(baslik: str) -> str:
    """
    Başlık için GitHub tarzı bağlantı çapası (anchor) üretir. Dikkat: burada
    Türkçe kural DEĞİL, dilden bağımsız küçük harf dönüşümü kullanılır; GitHub
    da başlık çapasını öyle üretir.

    >>> capa_yap("Dinamik Programlama")
    'dinamik-programlama'
    >>> capa_yap("Sıralama")
    'sıralama'
    """
    return "-".join(baslik.strip().lower().split())


def sozlugu_oku(kok: Path = KOK) -> dict[str, str]:
    """basliklar.json varsa okur; yoksa boş sözlük döndürür."""
    dosya = kok / BASLIK_SOZLUGU
    if not dosya.exists():
        return {}
    return json.loads(dosya.read_text(encoding="utf-8"))


def dizin_metni(kok: Path = KOK) -> str:
    """
    DIRECTORY.md içeriğini üretir: numaralı içindekiler, her üst klasör için
    bağlantılı bir başlık ve iç içe madde listesi.
    """
    sozluk = sozlugu_oku(kok)
    yollar = [y for y in algoritma_dosyalari(kok) if "/" in y]
    bolumler = list(dict.fromkeys(y.split("/")[0] for y in yollar))

    satirlar = [
        "# Dizin",
        "",
        "<!-- Bu dosya betikler/dizin_olustur.py ile üretilir; elle düzenleme. -->",
        "",
        "## İçindekiler",
        "",
    ]
    for sira, bolum in enumerate(bolumler, start=1):
        # Numaralı liste: son numara, klasör (bölüm) sayısını tek bakışta gösterir.
        baslik = baslik_yap(bolum, sozluk)
        satirlar.append(f"{sira}. [{baslik}](#{capa_yap(baslik)})")

    for bolum in bolumler:
        satirlar += ["", f"## [{baslik_yap(bolum, sozluk)}]({bolum})", ""]
        yazilan_klasorler: set[tuple[str, ...]] = set()
        for yol in (y for y in yollar if y.split("/")[0] == bolum):
            parcalar = yol.split("/")
            # Bölüm klasörünün altındaki ara klasörler, kendi başlıklı madde satırını alır.
            for derinlik in range(1, len(parcalar) - 1):
                anahtar = tuple(parcalar[: derinlik + 1])
                if anahtar not in yazilan_klasorler:
                    yazilan_klasorler.add(anahtar)
                    satirlar.append(f"{'  ' * (derinlik - 1)}- {baslik_yap(parcalar[derinlik], sozluk)}")
            girinti = "  " * (len(parcalar) - 2)
            satirlar.append(f"{girinti}- [{baslik_yap(parcalar[-1], sozluk)}]({yol})")
    return "\n".join(satirlar) + "\n"


def main(argv: list[str] | None = None) -> int:
    ayristirici = argparse.ArgumentParser(description="DIRECTORY.md üretir.")
    ayristirici.add_argument("--kontrol", action="store_true", help="yazma; güncel değilse 1 döndür")
    ayristirici.add_argument("--kok", type=Path, default=KOK, help="depo kökü")
    secenekler = ayristirici.parse_args(argv)

    beklenen = dizin_metni(secenekler.kok)
    hedef = secenekler.kok / DIZIN_DOSYASI
    if secenekler.kontrol:
        mevcut = hedef.read_text(encoding="utf-8") if hedef.exists() else ""
        if mevcut != beklenen:
            print(f"{DIZIN_DOSYASI} güncel değil: python3 betikler/dizin_olustur.py çalıştır", file=sys.stderr)
            return 1
        return 0
    hedef.write_text(beklenen, encoding="utf-8")
    print(f"{DIZIN_DOSYASI} yazıldı ({beklenen.count('.py)')} dosya)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
