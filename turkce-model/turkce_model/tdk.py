"""TDK Güncel Türkçe Sözlük: kelime listesi, madde indirme, derlem ve kök sözlüğü.

``sozluk.gov.tr/robots.txt`` tüm tarayıcılara izin verir (``User-agent: *`` / ``Allow: /``). Yine de
indirici naziktir: istekler arasında bekler, sunucu yavaşlarsa geri çekilir ve kaldığı yerden devam eder.
İndirilen içeriğin hakları TDK'ye aittir: yalnızca kişisel araştırmada kullanın, depoya koymayın, paylaşmayın.
"""

from __future__ import annotations

import html
import json
import random
import re
import sys
import time
import zlib
from collections.abc import Iterable, Iterator
from pathlib import Path

from .metin import UNLULER, kucuk, normallestir, son_unlu, unlu_uyumu

KELIME_LISTESI_URLLERI = (
    "https://sozluk.gov.tr/data/autocomplete.json",
    "https://sozluk.gov.tr/autocomplete.json",  # eski adres
)
GTS_URL = "https://sozluk.gov.tr/gts"
KULLANICI_AJANI = "turkce-model/0.1 (kisisel arastirma betigi; yavas indirme)"


def _oturum():
    import requests

    s = requests.Session()
    s.headers.update({"User-Agent": KULLANICI_AJANI, "Accept": "application/json"})
    return s


# --------------------------------------------------------------------------------------------
# İndirme
# --------------------------------------------------------------------------------------------


def kelime_listesi_indir(hedef: Path) -> list[str]:
    """Sözlükteki tüm madde başlarını (≈ 81 bin) indirir ve satır satır ``hedef`` dosyasına yazar."""
    import requests

    oturum = _oturum()
    son_hata: Exception | None = None
    for url in KELIME_LISTESI_URLLERI:
        try:
            yanit = oturum.get(url, timeout=120)
            yanit.raise_for_status()
            veri = yanit.json()
        except (requests.RequestException, ValueError) as e:
            son_hata = e
            continue
        kelimeler = _benzersiz_maddeler(veri)
        if kelimeler:
            hedef.parent.mkdir(parents=True, exist_ok=True)
            hedef.write_text("\n".join(kelimeler) + "\n", encoding="utf-8")
            return kelimeler
    raise RuntimeError(f"TDK kelime listesi indirilemedi: {son_hata}")


def _benzersiz_maddeler(veri: object) -> list[str]:
    gorulen: set[str] = set()
    sonuc: list[str] = []
    for x in veri if isinstance(veri, list) else []:
        m = x.get("madde") if isinstance(x, dict) else x
        if isinstance(m, str):
            m = m.strip()
            if m and m not in gorulen:
                gorulen.add(m)
                sonuc.append(m)
    return sonuc


def kelime_listesi_oku(yol: Path) -> list[str]:
    return [s for s in yol.read_text(encoding="utf-8").splitlines() if s.strip()]


def _tamamlananlar(cikti: Path) -> set[str]:
    tamam: set[str] = set()
    if not cikti.exists():
        return tamam
    with cikti.open(encoding="utf-8") as f:
        for satir in f:
            try:
                kayit = json.loads(satir)
            except json.JSONDecodeError:
                continue  # yarıda kesilmiş son satır
            if kayit.get("durum") in ("tamam", "yok"):
                tamam.add(kayit["ara"])
    return tamam


def maddeleri_indir(
    kelimeler: list[str],
    cikti: Path,
    bekleme: float = 0.35,
    ornek: int | None = None,
    tohum: int = 0,
    en_fazla_deneme: int = 6,
    ilerleme_her: int = 200,
    oturum=None,
    yaz=print,
) -> dict[str, int]:
    """Her kelimeyi ``/gts?ara=`` ile sorgular, ham JSON'u ``cikti`` (JSONL) dosyasına ekler.

    Kaldığı yerden devam eder: ``tamam``/``yok`` durumundaki kelimeler atlanır, ``hata`` olanlar
    yeniden denenir. ``ornek`` verilirse tohumla belirlenen sabit bir rastgele alt küme indirilir.
    """
    import requests

    oturum = oturum or _oturum()
    secilen = kelimeler
    if ornek:
        secilen = random.Random(tohum).sample(kelimeler, min(ornek, len(kelimeler)))
    tamam = _tamamlananlar(cikti)
    hedefler = [k for k in secilen if k not in tamam]
    sayac = {"tamam": 0, "yok": 0, "hata": 0, "atlanan": len(secilen) - len(hedefler)}
    if not hedefler:
        yaz(f"Yapılacak bir şey yok: {len(secilen)} kelimenin hepsi indirilmiş.")
        return sayac

    cikti.parent.mkdir(parents=True, exist_ok=True)
    if cikti.exists() and cikti.stat().st_size > 0:
        with cikti.open("rb") as f:
            f.seek(-1, 2)
            yarim = f.read(1) != b"\n"
        if yarim:
            with cikti.open("a", encoding="utf-8") as f:
                f.write("\n")

    yaz(
        f"{len(hedefler)} madde indirilecek ({sayac['atlanan']} zaten var). "
        f"Bekleme {bekleme} sn → tahmini süre ~{_sure(len(hedefler) * (bekleme + 0.15))}. "
        "Ctrl+C ile durdurup aynı komutla devam edebilirsiniz."
    )
    basla = time.time()
    try:
        with cikti.open("a", encoding="utf-8") as f:
            for i, kelime in enumerate(hedefler, 1):
                durum, sonuc = _tek_madde(oturum, kelime, en_fazla_deneme, requests, yaz)
                sayac[durum] += 1
                f.write(json.dumps({"ara": kelime, "durum": durum, "sonuc": sonuc}, ensure_ascii=False) + "\n")
                f.flush()
                if i % ilerleme_her == 0 or i == len(hedefler):
                    hiz = i / max(time.time() - basla, 1e-9)
                    kalan = (len(hedefler) - i) / max(hiz, 1e-9)
                    yaz(f"  {i}/{len(hedefler)}  {hiz:.1f} madde/sn  kalan ~{_sure(kalan)}  {sayac}")
                time.sleep(bekleme)
    except KeyboardInterrupt:
        yaz("\nDurduruldu. Aynı komutu yeniden çalıştırınca kaldığı yerden devam eder.")
    return sayac


def _tek_madde(oturum, kelime: str, en_fazla_deneme: int, requests, yaz) -> tuple[str, object]:
    for deneme in range(en_fazla_deneme):
        try:
            yanit = oturum.get(GTS_URL, params={"ara": kelime}, timeout=30)
            if yanit.status_code == 200:
                veri = yanit.json()
                if isinstance(veri, list):
                    return "tamam", veri
                return "yok", veri.get("error") if isinstance(veri, dict) else None
            if yanit.status_code in (429, 500, 502, 503, 504):
                bekle = _geri_cekil(deneme, yanit.headers.get("Retry-After"))
                yaz(f"  sunucu {yanit.status_code} döndü, {bekle:.0f} sn bekleniyor…")
                time.sleep(bekle)
                continue
            return "hata", f"HTTP {yanit.status_code}"
        except (requests.RequestException, ValueError) as e:
            bekle = _geri_cekil(deneme, None)
            yaz(f"  bağlantı sorunu ({type(e).__name__}), {bekle:.0f} sn bekleniyor…")
            time.sleep(bekle)
    return "hata", "deneme sınırı aşıldı"


def _geri_cekil(deneme: int, retry_after: str | None) -> float:
    if retry_after and retry_after.isdigit():
        return min(float(retry_after), 300.0)
    return min(2.0 ** (deneme + 1), 120.0) + random.random()


def _sure(saniye: float) -> str:
    saniye = int(saniye)
    s, d = saniye // 3600, (saniye % 3600) // 60
    return f"{s} sa {d} dk" if s else f"{d} dk {saniye % 60} sn"


def maddeleri_oku(yol: Path) -> Iterator[dict]:
    """İndirilen JSONL'den benzersiz madde kayıtlarını (``madde_id``'ye göre) döndürür."""
    gorulen: set[str] = set()
    with yol.open(encoding="utf-8") as f:
        for satir in f:
            try:
                kayit = json.loads(satir)
            except json.JSONDecodeError:
                continue
            if kayit.get("durum") != "tamam":
                continue
            for madde in kayit.get("sonuc") or []:
                if not isinstance(madde, dict) or not madde.get("madde"):
                    continue
                mid = str(madde.get("madde_id") or madde["madde"])
                if mid in gorulen:
                    continue
                gorulen.add(mid)
                yield madde


# --------------------------------------------------------------------------------------------
# Derlem
# --------------------------------------------------------------------------------------------

_ETIKET = re.compile(r"<[^>]+>")


def _temiz(s: object) -> str:
    if not isinstance(s, str):
        return ""
    return normallestir(html.unescape(_ETIKET.sub("", s))).replace("\n", " ")


def madde_metni(
    madde: dict, en_fazla_ornek: int = 2, en_fazla_birlesik: int = 15, yazar_ekle: bool = False
) -> str:
    """Bir sözlük maddesini düz metne çevirir (aşama 1 derleminin bir belgesi).

    Çıktı biçimi (örnek uydurmadır)::

        kitap (Arapça kitāb)
        1. isim: Sayfaları bir arada tutulan, basılı ya da yazılı eser
        "Kitabı bitirince arkadaşına verdi."
        2. Bir konuyu kapsamlı biçimde ele alan yazı
        Birleşik sözler: kitap kurdu, el kitabı, …

    Örnek cümlelerin yazar adları varsayılan olarak yazılmaz: küçük bir derlemde binlerce kez
    tekrarlanan özel adlar kelime dağarcığını ve model kapasitesini dil dışı bilgiye harcar.
    """
    bas = _temiz(madde.get("madde"))
    lisan = _temiz(madde.get("lisan"))
    satirlar = [f"{bas} ({lisan})" if lisan else bas]
    anlamlar = madde.get("anlamlarListe") or []
    for sira, anlam in enumerate(anlamlar, 1):
        metin = _temiz(anlam.get("anlam"))
        if not metin:
            continue
        if metin.startswith("►"):
            metin = "bk. " + metin.lstrip("► ").strip()
        ozellik = ", ".join(
            _temiz(o.get("tam_adi")) for o in anlam.get("ozelliklerListe") or [] if o.get("tam_adi")
        )
        on = f"{sira}. " if len(anlamlar) > 1 else ""
        satirlar.append(on + (f"{ozellik}: " if ozellik else "") + metin)
        for ornek in (anlam.get("orneklerListe") or [])[:en_fazla_ornek]:
            cumle = _temiz(ornek.get("ornek"))
            if not cumle:
                continue
            yazar = ", ".join(_temiz(y.get("tam_adi")) for y in ornek.get("yazar") or [] if y.get("tam_adi"))
            satirlar.append(f'"{cumle}"' + (f" ({yazar})" if yazar and yazar_ekle else ""))
    birlesik = [_temiz(b) for b in (madde.get("birlesikler") or "").split(",") if b.strip()]
    if birlesik:
        satirlar.append("Birleşik sözler: " + ", ".join(birlesik[:en_fazla_birlesik]))
    return "\n".join(s for s in satirlar if s)


def dogrulama_mi(anahtar: str, oran_yuzde: float = 1.0) -> bool:
    """Kararlı (her çalıştırmada aynı) doğrulama ayrımı: anahtarın CRC32'sine göre."""
    return (zlib.crc32(anahtar.encode("utf-8")) % 10000) < oran_yuzde * 100


def derlem_olustur(
    maddeler: Iterable[dict], hedef: Path, dogrulama_yuzde: float = 1.0, yazar_ekle: bool = False
) -> dict[str, int]:
    """Maddeleri ``{"id", "madde", "metin", "bolum"}`` satırlarından oluşan JSONL derleme dönüştürür."""
    hedef.parent.mkdir(parents=True, exist_ok=True)
    kayitlar = []
    for madde in maddeler:
        metin = madde_metni(madde, yazar_ekle=yazar_ekle)
        if not metin.strip():
            continue
        mid = str(madde.get("madde_id") or madde.get("madde"))
        bolum = "dogrulama" if dogrulama_mi("tdk:" + mid, dogrulama_yuzde) else "egitim"
        kayitlar.append({"id": mid, "madde": madde.get("madde"), "metin": metin, "bolum": bolum})
    # Küçük örneklemde (--ornek) %1'e hiç belge düşmeyebilir: doğrulama boş kalmasın.
    if len(kayitlar) > 1 and not any(k["bolum"] == "dogrulama" for k in kayitlar):
        kayitlar[-1]["bolum"] = "dogrulama"
    sayac = {"egitim": 0, "dogrulama": 0, "karakter": 0}
    with hedef.open("w", encoding="utf-8") as f:
        for kayit in kayitlar:
            sayac[kayit["bolum"]] += 1
            sayac["karakter"] += len(kayit["metin"])
            f.write(json.dumps(kayit, ensure_ascii=False) + "\n")
    return sayac


def derlem_oku(yol: Path, bolum: str | None = None) -> Iterator[str]:
    with yol.open(encoding="utf-8") as f:
        for satir in f:
            kayit = json.loads(satir)
            if bolum is None or kayit.get("bolum") == bolum:
                yield kayit["metin"]


# --------------------------------------------------------------------------------------------
# Kök sözlüğü
# --------------------------------------------------------------------------------------------

_KOK_HARFLERI = re.compile(r"^[a-zâîûçğıöşüqwx]+$")
_SERT_YUMUSAK = {"p": "b", "ç": "c", "t": "d", "k": "ğ"}


def _kok_mu(kelime: str) -> bool:
    return bool(_KOK_HARFLERI.match(kelime))


def _hece_sayisi(kelime: str) -> int:
    return sum(1 for c in kelime if c in UNLULER)


def taki_bicimi(kok: str, taki: str | None) -> str | None:
    """TDK'nin ``taki`` alanından (``kitap → "bı"``, ``ağız → "ğzı"``, ``hak → "kkı"``) ses değişimli
    kök biçimini çıkarır: ``kitab``, ``ağz``, ``hakk``. Değişim yoksa ``None``.
    """
    if not taki or not kok or kok[-1] in UNLULER:
        return None
    t = kucuk(taki.replace("'", "").replace("-", "").strip())
    if len(t) < 2 or t[-1] not in UNLULER:
        return None
    govde = t[:-1]  # son ünlü iyelik/belirtme ekidir
    if not govde or any(c in UNLULER for c in govde):
        return None
    if len(govde) == 1:
        if govde == kok[-1]:
            return None
        return kok[:-1] + govde  # yumuşama: kitap → kitab, renk → reng
    if len(govde) == 2:
        if govde[0] == govde[1] == kok[-1]:
            return kok + govde[1]  # ikizleşme: hak → hakk
        if len(kok) >= 3 and kok[-3] == govde[0] and kok[-1] == govde[1] and kok[-2] in UNLULER:
            return kok[:-3] + govde  # ünlü düşmesi: ağız → ağz, burun → burn
    return None


def daralma_bicimi(govde: str) -> str | None:
    """Ünlüyle biten fiil gövdesinin ``-yor`` önündeki daralmış biçimi: bekle → bekli, anla → anlı."""
    if not govde or govde[-1] not in "ae":
        return None
    onceki = son_unlu(govde[:-1]) or govde[-1]
    _, i = unlu_uyumu(onceki)
    if govde[-1] == "e" and i in "ıu":  # ince ünlü kalın uyuma geçmez
        i = {"ı": "i", "u": "ü"}[i]
    if govde[-1] == "a" and i in "iü":
        i = {"i": "ı", "ü": "u"}[i]
    return govde[:-1] + i


def _kural_yumusama(kok: str) -> str | None:
    """TDK verisi yoksa: çok heceli ve p/ç/t/k ile biten kelimeler için olası yumuşamış biçim."""
    if len(kok) < 3 or _hece_sayisi(kok) < 2 or kok[-1] not in _SERT_YUMUSAK:
        return None
    if kok[-1] == "k" and kok[-2] == "n":
        return kok[:-1] + "g"  # renk → reng
    return kok[:-1] + _SERT_YUMUSAK[kok[-1]]


def _fiil_mi(madde: dict) -> bool:
    return any(str(a.get("fiil")) == "1" for a in madde.get("anlamlarListe") or [])


def kokleri_cikar(kelimeler: Iterable[str], maddeler: Iterable[dict] = ()) -> list[tuple[str, str, str]]:
    """Tek kelimelik madde başlarından ``(kök, ana_kök, tür)`` listesi çıkarır.

    Türler: ``kok`` (madde başı), ``fiil`` (``-mek/-mak`` atılmış gövde), ``ses`` (ses değişimli biçim,
    TDK ``taki`` alanından), ``kural`` (TDK verisi olmayan kelimeler için kuralla tahmin edilen biçim),
    ``daralma`` (``bekli-yor``).
    """
    bilgi: dict[str, dict] = {}
    for madde in maddeler:
        bas = kucuk(str(madde.get("madde", "")).strip())
        if not _kok_mu(bas):
            continue
        b = bilgi.setdefault(bas, {"fiil": False, "taki": set()})
        b["fiil"] |= _fiil_mi(madde)
        if madde.get("taki"):
            b["taki"].add(madde["taki"])

    sonuc: dict[str, tuple[str, str]] = {}

    def ekle(kok: str, ana: str, tur: str) -> None:
        if kok and _kok_mu(kok) and kok not in sonuc:
            sonuc[kok] = (ana, tur)

    for ham in kelimeler:
        kelime = kucuk(ham.strip())
        if not _kok_mu(kelime):
            continue
        b = bilgi.get(kelime)
        mek = len(kelime) > 3 and kelime.endswith(("mek", "mak"))
        fiil = b["fiil"] if b is not None else mek
        if fiil and mek:
            govde = kelime[:-3]
            ekle(govde, govde, "fiil")
            for taki in b["taki"] if b else ():
                t = kucuk(taki.replace("-", "").strip())
                if t and t[0] not in UNLULER and govde[-1] not in UNLULER and t[0] != govde[-1]:
                    ekle(govde[:-1] + t[0], govde, "ses")  # git-mek: gid-er
            daralmis = daralma_bicimi(govde)
            if daralmis:
                ekle(daralmis, govde, "daralma")
            continue
        ekle(kelime, kelime, "kok")
        if b is not None:
            for taki in b["taki"]:
                bicim = taki_bicimi(kelime, taki)
                if bicim:
                    ekle(bicim, kelime, "ses")
        else:
            bicim = _kural_yumusama(kelime)
            if bicim:
                ekle(bicim, kelime, "kural")
    return [(k, ana, tur) for k, (ana, tur) in sonuc.items()]


def kokleri_yaz(kokler: list[tuple[str, str, str]], hedef: Path) -> None:
    hedef.parent.mkdir(parents=True, exist_ok=True)
    with hedef.open("w", encoding="utf-8") as f:
        f.write("kok\tana\ttur\n")
        for kok, ana, tur in kokler:
            f.write(f"{kok}\t{ana}\t{tur}\n")


def kokleri_oku(yol: Path) -> list[tuple[str, str, str]]:
    satirlar = yol.read_text(encoding="utf-8").splitlines()[1:]
    return [tuple(s.split("\t")) for s in satirlar if s.count("\t") == 2]  # type: ignore[misc]


if __name__ == "__main__":  # pragma: no cover
    print("Kullanım: python -m turkce_model tdk-indir", file=sys.stderr)
