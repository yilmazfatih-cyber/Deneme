#!/usr/bin/env python3
"""Hotjar komutları: anket ve geri bildirim analizi (API ya da arayüzden indirilen CSV/XLSX).

  kontrol                           API anahtarı ve site denetimi (Responses API yalnız Ask Scale planında)
  anketler                          anket listesi (ID, ad, tür, durum)
  indir ANKET_ID [--bas TARIH]      tüm yanıtları yerel/girdi/ altına CSV olarak indirir ve özetler
  ozet DOSYA [--grup SUTUN]         NPS/puan dağılımı, seçenekler, sık kelimeler, gruplara göre kırılım
  ornek DOSYA [--soru S] [--n 40]   açık uçlu yanıtlardan sınırlı, çeşitli örnek (tema çıkarmak için)
  tema DOSYA --kurallar DOSYA       tema kurallarını TÜM yanıtlara uygular; pay, örnek, eşleşmeyenler
Ortak: --filtre 'Puan<=6' · --filtre 'Sayfa URL~/odeme' · --filtre 'Cihaz=mobile' (tekrarlanabilir)
Isı haritası CSV'si ("Element CSS selector" sütunlu) `ozet` ile otomatik tanınır.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parent))

from analitik import ayarlar as A  # noqa: E402
from analitik import (  # noqa: E402
    bicim,
    boru_kapandi,
    csvoku,
    metin,
    ozetle,
    rapor,
    utf8_cikti,
)
from analitik.hotjar import Hotjar, duzlestir  # noqa: E402
from analitik.istemci import ApiHatasi  # noqa: E402


class KomutHatasi(Exception):
    pass


def _dosya(yol: str) -> Path:
    aday = Path(yol)
    if not aday.exists():
        ikinci = A.yerel_dizin() / "girdi" / yol
        if ikinci.exists():
            return ikinci
        raise KomutHatasi(f"Dosya bulunamadı: {yol} (yerel/girdi/ altına koyup yolunu verin)")
    return aday


def _tablo_yukle(yol: str, filtreler: Sequence[str]) -> Tuple[Path, List[str], List[List[str]], int]:
    dosya = _dosya(yol)
    basliklar, satirlar = csvoku.oku(dosya)
    satirlar = ozetle.devam_satirlarini_birlestir(basliklar, satirlar)
    toplam = len(satirlar)
    satirlar = ozetle.satir_filtrele(basliklar, satirlar, filtreler)
    return dosya, basliklar, satirlar, toplam


def _metin_sutunu(basliklar: Sequence[str], satirlar: List[List[str]], soru: Optional[str]) -> str:
    if soru:
        csvoku.sutun(basliklar, satirlar, soru)
        return soru if soru in basliklar else next(b for b in basliklar if soru.lower() in b.lower())
    adaylar = []
    for b in basliklar:
        tur = csvoku.sutun_turu(csvoku.sutun(basliklar, satirlar, b))
        if tur["tur"] == "metin":
            adaylar.append((tur["dolu"], b))
    if not adaylar:
        raise KomutHatasi('Açık uçlu metin sütunu bulunamadı; --soru "<sütun adı>" ile belirtin.')
    return max(adaylar)[1]


def _olcek_sutunu(basliklar: Sequence[str], satirlar: List[List[str]]) -> Optional[str]:
    for b in basliklar:
        tur = csvoku.sutun_turu(csvoku.sutun(basliklar, satirlar, b))
        if tur["tur"] == "sayi" and tur.get("olcek"):
            return b
    return None


def _filtre_metni(filtreler: Sequence[str], toplam: int, kalan: int) -> str:
    return f" · filtre: {' ve '.join(filtreler)} ({bicim.sayi(kalan)}/{bicim.sayi(toplam)} satır)" if filtreler else ""


# --- API -------------------------------------------------------------------------------------------


def k_kontrol(arg) -> None:
    ayar = A.yukle()
    hj = Hotjar(ayar)
    anketler = hj.anketler()
    print(
        f"✓ Hotjar API çalışıyor · site {hj.site} · {len(anketler)} anket" + (" (DEMO, sentetik)" if ayar.demo else "")
    )


def k_anketler(arg) -> None:
    hj = Hotjar(A.yukle())
    tablo = [
        [
            a.get("id"),
            bicim.kisalt(a.get("name") or "", 40),
            a.get("type") or "",
            "açık" if a.get("is_enabled") else "kapalı",
            str(a.get("created_time") or "")[:10],
            str(len([q for q in a.get("questions") or [] if q.get("type") not in ("statement", "thank-you")])),
        ]
        for a in hj.anketler()
    ]
    print(bicim.tablo(["ID", "ad", "tür", "durum", "oluşturma", "soru"], tablo, hizala="lllllr"))


def k_indir(arg) -> None:
    ayar = A.yukle()
    hj = Hotjar(ayar)
    anket = hj.anket(arg.anket_id)
    if not anket.get("questions"):
        anket = next((a for a in hj.anketler() if a.get("id") == arg.anket_id), anket)
    bas = csvoku.tarihe(arg.bas, "iso") if arg.bas else None
    yanitlar = list(hj.yanitlar(arg.anket_id, bas))
    basliklar, satirlar = duzlestir(anket, yanitlar)
    kisa = arg.anket_id.replace("survey_", "")[:12]
    hedef = Path(arg.dosya) if arg.dosya else ayar.alt_dizin("girdi") / f"hotjar-anket-{kisa}.csv"
    hedef.parent.mkdir(parents=True, exist_ok=True)
    with hedef.open("w", newline="", encoding="utf-8") as f:
        yazici = csv.writer(f)
        yazici.writerow(basliklar)
        yazici.writerows(satirlar)
    print(f"{bicim.sayi(len(yanitlar))} yanıt indirildi → {A.goreli(hedef)} · anket: {anket.get('name', arg.anket_id)}")
    print(ozetle.csv_ozet(basliklar, satirlar, hedef.name, limit=6))


# --- dosya analizleri ------------------------------------------------------------------------------


def k_ozet(arg) -> None:
    ayar = A.yukle()
    dosya, basliklar, satirlar, toplam = _tablo_yukle(arg.dosya, arg.filtre)
    govde = ozetle.csv_ozet(basliklar, satirlar, dosya.name, limit=arg.limit, grup=arg.grup)
    if arg.filtre:
        govde += f"\nFiltre: {' ve '.join(arg.filtre)} ({bicim.sayi(len(satirlar))}/{bicim.sayi(toplam)} satır)"
    rapor_yolu = (
        rapor.yaz(ayar, f"hotjar-ozet-{dosya.stem}", f"Hotjar özeti: {dosya.name}", govde) if arg.rapor else None
    )
    print(govde)
    if rapor_yolu:
        print(rapor.alt_bilgi(rapor_yolu=rapor_yolu))


def k_ornek(arg) -> None:
    dosya, basliklar, satirlar, toplam = _tablo_yukle(arg.dosya, arg.filtre)
    sutun = _metin_sutunu(basliklar, satirlar, arg.soru)
    olcek = _olcek_sutunu(basliklar, satirlar)
    i_metin = basliklar.index(sutun)
    i_olcek = basliklar.index(olcek) if olcek else None
    dolu = [s for s in satirlar if s[i_metin].strip()]
    puanlar: Dict[str, str] = {}
    for s in dolu:
        puanlar.setdefault(" ".join(s[i_metin].split()), s[i_olcek] if i_olcek is not None else "")
    ornek = metin.ornekle([s[i_metin] for s in dolu], n=arg.n, tohum=arg.tohum)
    print(
        f"Örnek · `{bicim.kisalt(sutun, 60)}` · {len(ornek)}/{bicim.sayi(len(dolu))} dolu yanıt "
        f"(tekrarsız, uzunluğa göre dengeli){_filtre_metni(arg.filtre, toplam, len(satirlar))}"
    )
    for i, m in enumerate(ornek, 1):
        anahtar = " ".join(m.rstrip("…").split())
        puan = next((p for k, p in puanlar.items() if k.startswith(anahtar[:40])), "") if olcek else ""
        print(f"{i}. " + (f"[{puan}] " if puan else "") + m)
    if olcek:
        print(f"[ ] içindeki sayı: `{bicim.kisalt(olcek, 50)}`")
    print("Sıradaki adım: temaları yerel/temalar.json'a yazın, sonra `hj.py tema` ile tüm yanıtlara uygulayın.")


def _kurallar(yol: str) -> List[Dict]:
    veri = json.loads(_dosya(yol).read_text(encoding="utf-8-sig"))
    temalar = veri.get("temalar") if isinstance(veri, dict) else veri
    if not temalar or not all("ad" in t and "kelimeler" in t for t in temalar):
        raise KomutHatasi(
            'Kural dosyası {"temalar": [{"ad": ..., "kelimeler": [...]}]} biçiminde olmalı '
            "(örnek: kit/ornekler/temalar.json)."
        )
    return temalar


def k_tema(arg) -> None:
    ayar = A.yukle()
    dosya, basliklar, satirlar, toplam = _tablo_yukle(arg.dosya, arg.filtre)
    temalar = _kurallar(arg.kurallar)
    sutun = _metin_sutunu(basliklar, satirlar, arg.soru)
    i_metin = basliklar.index(sutun)
    yorum_sutunlari = [i for i, b in enumerate(basliklar) if b.startswith(sutun) and b.endswith("(yorum)")]
    metinler = [" ".join([s[i_metin]] + [s[i] for i in yorum_sutunlari]).strip() for s in satirlar]
    sonuc, eslesmeyen, n = metin.tema_say(metinler, temalar)
    if not n:
        raise KomutHatasi("Seçilen sütunda dolu yanıt yok.")
    tablo = [
        [
            t["ad"],
            bicim.sayi(t["sayi"]),
            bicim.yuzde(t["pay"]),
            bicim.kisalt(t["ornekler"][0], 70) if t["ornekler"] else "",
        ]
        for t in sonuc
    ]
    eslesmeyen_sayi = sum(1 for m in metinler if m.strip() and not metin.tema_eslestir(m, temalar))
    cikti = [
        f"TEMALAR · `{bicim.kisalt(sutun, 60)}` · {bicim.sayi(n)} dolu yanıt · kurallar: {Path(arg.kurallar).name}"
        f"{_filtre_metni(arg.filtre, toplam, len(satirlar))} (bir yanıt birden çok temaya girebilir)",
        bicim.tablo(["tema", "yanıt", "pay", "örnek"], tablo, hizala="lrrl"),
        f"Eşleşmeyen: {bicim.sayi(eslesmeyen_sayi)} ({bicim.yuzde(eslesmeyen_sayi / n)})"
        + (": " + " / ".join(f"“{e}”" for e in eslesmeyen) if eslesmeyen else ""),
    ]
    if arg.grup:
        gruplar = csvoku.sutun(basliklar, satirlar, arg.grup)
        sayac: Dict[str, List[str]] = {}
        for g, m in zip(gruplar, metinler):
            if m.strip():
                sayac.setdefault(g.strip() or "(boş)", []).append(m)
        ust = sorted(sayac.items(), key=lambda kv: -len(kv[1]))[:5]
        grup_tablosu = []
        for t in sonuc[: arg.limit]:
            satir = [t["ad"]]
            for _, liste in ust:
                eslesen = sum(1 for m in liste if t["ad"] in metin.tema_eslestir(m, temalar))
                satir.append(bicim.yuzde(eslesen / len(liste), 0))
            grup_tablosu.append(satir)
        cikti.append(f"Gruba göre pay (`{arg.grup}`; n: " + ", ".join(f"{g}={len(liste)}" for g, liste in ust) + "):")
        cikti.append(bicim.tablo(["tema"] + [bicim.kisalt(g, 14) for g, _ in ust], grup_tablosu))
    govde = "\n".join(cikti)
    rapor_yolu = (
        rapor.yaz(ayar, f"hotjar-tema-{dosya.stem}", f"Anket temaları: {dosya.name}", govde) if arg.rapor else None
    )
    print(govde)
    if rapor_yolu:
        print(rapor.alt_bilgi(rapor_yolu=rapor_yolu))


def ayristirici() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        prog="hj.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    alt = ap.add_subparsers(dest="komut", required=True)
    alt.add_parser("kontrol").set_defaults(func=k_kontrol)
    alt.add_parser("anketler").set_defaults(func=k_anketler)
    p = alt.add_parser("indir")
    p.add_argument("anket_id")
    p.add_argument("--bas", help="bu tarihten (YYYY-AA-GG) yeni yanıtlar")
    p.add_argument("--dosya", help="hedef CSV yolu")
    p.set_defaults(func=k_indir)
    for ad, func in (("ozet", k_ozet), ("ornek", k_ornek), ("tema", k_tema)):
        p = alt.add_parser(ad)
        p.add_argument("dosya")
        p.add_argument("--filtre", action="append", default=[])
        if ad == "ozet":
            p.add_argument("--grup", help="sayısal sütunları bu sütuna göre kır (ör. Cihaz)")
            p.add_argument("--limit", type=int, default=8)
            p.add_argument("--rapor", action="store_true")
        if ad == "ornek":
            p.add_argument("--soru", help="açık uçlu sütun (varsayılan: en dolu metin sütunu)")
            p.add_argument("--n", type=int, default=40)
            p.add_argument("--tohum", type=int, default=7)
        if ad == "tema":
            p.add_argument("--kurallar", required=True)
            p.add_argument("--soru")
            p.add_argument("--grup")
            p.add_argument("--limit", type=int, default=8)
            p.add_argument("--rapor", action="store_true")
        p.set_defaults(func=func)
    return ap


def main(argv=None) -> int:
    utf8_cikti()
    arg = ayristirici().parse_args(argv)
    try:
        arg.func(arg)
    except (ApiHatasi, A.AyarHatasi, KomutHatasi, ValueError, KeyError) as hata:
        print(f"HATA: {hata}")
        return 2
    except BrokenPipeError:
        return boru_kapandi()
    return 0


if __name__ == "__main__":
    sys.exit(main())
