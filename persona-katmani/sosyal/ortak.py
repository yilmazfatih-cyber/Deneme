"""Kaynak C ortak katmanı: kayıt veri sınıfları, sözlükler (yaş bandı, cinsiyet, yaratıcı türü), duygu sözlüğü ve DB yazıcıları.

Kural (ADR-002, ADR-009): kişi düzeyi veri yok. Yorum metni ve yazar kimliği hiçbir tabloya yazılmaz; yalnız duygu sayımı.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

SOSYAL = Path(__file__).resolve().parent
PK = SOSYAL.parent
DEPO = PK.parent
sys.path.insert(0, str(PK / "db"))
import pk_db  # noqa: E402  (aynı DB, aynı denetim)

PLATFORMLAR = ("facebook", "instagram", "tiktok", "x")
YAS_BANTLARI = ("18-24", "25-34", "35-44", "45-54", "55+")
_BANT_ARALIK = {"18-24": (18, 24), "25-34": (25, 34), "35-44": (35, 44), "45-54": (45, 54), "55+": (55, 120)}
YARATICI_TURLERI = ("indirim", "duygusal", "bilgi", "sosyal_kanit", "kitlik")
BICIMLER = ("gorsel", "video", "carousel", "story", "reels", "metin")


# ───────────────────────── DB ─────────────────────────
def db_yolu() -> Path:
    return Path(os.environ.get("PK_DB", pk_db.KOK / "persona.sqlite"))


def baglan() -> sqlite3.Connection:
    """pk_db.baglan ile aynı bağlantı; PK_DB her çağrıda yeniden okunur (testler için)."""
    pk_db.DB_YOLU = db_yolu()
    c = pk_db.baglan()
    if not c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sosyal_metrik'").fetchone():
        raise SystemExit(f"{pk_db.DB_YOLU}: şema yok. Önce: python3 -I persona-katmani/db/pk_db.py kur && yukle-temel")
    return c


def denetim(c: sqlite3.Connection, eylem: str, nesne: str, ayrinti: dict | None = None) -> None:
    pk_db.denetim(c, eylem, nesne, ayrinti)


def kiraci_hazirla(c: sqlite3.Connection, kiraci: str) -> None:
    """Kiracı yoksa oluşturur (pk_db ornek çalışmadıysa)."""
    c.execute("INSERT OR IGNORE INTO kiraci(id, ad) VALUES (?,?)", (kiraci, kiraci))


# ───────────────────────── Sözlükler ─────────────────────────
def tr_kucuk(s: str) -> str:
    """Türkçe duyarlı küçük harf (I→ı, İ→i)."""
    return s.replace("I", "ı").replace("İ", "i").lower()


def kucuk_varyantlar(s: str) -> str:
    """Türkçe ve İngilizce küçük harf biçimleri (\"Impressions\" → 'ımpressions' ve 'impressions'), satırla ayrılmış."""
    a, b = tr_kucuk(s), s.lower()
    return a if a == b else a + "\n" + b


def yas_bandi(ham: str | None) -> str | None:
    """Platform yaş bandını ortak sözlüğe eşler; 18 altı, bilinmeyen veya eşlenemeyen → None (satır atlanır).

    Örnekler: '55-64','65+','AGE_55_100' → '55+'; 'AGE_18_24','AGE_18_TO_24' → '18-24'; '13-17' → None.
    Standart dışı bantlar (X: 35-49, 50+) en çok örtüşen banda eşlenir (yaklaşık; NOTLAR).
    """
    if ham is None:
        return None
    s = tr_kucuk(str(ham).strip())
    if s in ("hepsi", "all", "tümü", "total", "toplam"):
        return "hepsi"
    sayilar = [int(x) for x in re.findall(r"\d+", s)]
    if not sayilar:
        return None
    alt = sayilar[0]
    ust = sayilar[1] if len(sayilar) > 1 else (120 if ("+" in s or "plus" in s or "üzeri" in s or "over" in s) else alt)
    if ust >= 100:
        ust = 120
    if alt < 18:
        return None  # reşit olmayanlar hiç alınmaz
    en_iyi, en_cok = None, 0
    for bant, (a, u) in _BANT_ARALIK.items():
        ortus = min(ust, u) - max(alt, a) + 1
        if ortus > en_cok:
            en_iyi, en_cok = bant, ortus
    return en_iyi


def cinsiyet(ham: str | None) -> str:
    """K | E | bilinmiyor (platform 'hepsi' toplamı ayrıca 'hepsi' olarak yazılır)."""
    s = tr_kucuk(str(ham or "").strip())
    if s in ("hepsi", "all"):
        return "hepsi"
    if s in ("female", "f", "k", "kadın", "kadin", "women", "woman", "gender_female"):
        return "K"
    if s in ("male", "m", "e", "erkek", "men", "man", "gender_male"):
        return "E"
    return "bilinmiyor"


_KITLIK = re.compile(r"\b(son|tükeniyor|tükenmeden|sınırlı|kaçırma|bugüne özel|last chance|limited|ends soon|only today)\b")
_INDIRIM = re.compile(r"(%|\bindirim|\bkampanya|\bsale\b|\bdiscount|\b\d+\s*off\b|\bucuz)")
_SOSYAL = re.compile(r"(binlerce kişi|en çok satan|en sevilen|en popüler|müşterimiz|herkes bunu|best ?seller|thousands of|most popular|\d+\s*bin kişi)")
_BILGI = re.compile(r"(\?|\bnasıl\b|\bneden\b|\bözellik|\brehber|\bipucu|\bnedir\b|\bkarşılaştır|\bhow to\b|\bfeatures?\b|\bguide\b|\btips?\b|\bteknik)")


def yaratici_turu(metin: str | None) -> str:
    """Başlık/metinden basit anahtar kelime sınıflandırması: indirim > kitlik > sosyal_kanit > bilgi > duygusal."""
    s = kucuk_varyantlar(metin or "")
    if _INDIRIM.search(s):
        return "indirim"
    if _KITLIK.search(s):
        return "kitlik"
    if _SOSYAL.search(s):
        return "sosyal_kanit"
    if _BILGI.search(s):
        return "bilgi"
    return "duygusal"


def metin_ozeti(metin: str | None, uzunluk: int = 60) -> str | None:
    """Şirketin kendi içeriğinin kısa özeti (ilk satır, ≤60 karakter); tam metin saklanmaz."""
    if not metin:
        return None
    ilk = metin.strip().splitlines()[0] if metin.strip() else ""
    return (ilk[: uzunluk - 1] + "…") if len(ilk) > uzunluk else ilk or None


# ───────────────────────── Duygu (sözlük yöntemi) ─────────────────────────
OLUMLU = {"harika", "güzel", "süper", "teşekkür", "teşekkürler", "mükemmel", "bayıldım", "beğendim", "sevdim", "tavsiye", "kaliteli",
          "hızlı", "memnun", "memnunum", "şahane", "efsane", "başarılı", "uygun", "love", "great", "good", "amazing", "thanks", "perfect",
          "nice", "awesome", "excellent"}
OLUMSUZ = {"kötü", "berbat", "rezalet", "pahalı", "geç", "gelmedi", "iade", "şikayet", "şikâyet", "bozuk", "yavaş", "sorun", "maalesef",
           "değmez", "sahte", "yalan", "dolandırıcı", "kırık", "eksik", "bad", "terrible", "worst", "expensive", "late", "broken", "scam",
           "disappointed", "awful", "hayal"}
_OLUMSUZLUK = {"değil", "not", "never", "hiç"}
KONU_SOZLUK = {
    "fiyat": {"fiyat", "pahalı", "ucuz", "indirim", "price", "expensive", "cheap", "tl"},
    "kargo": {"kargo", "teslimat", "teslim", "gelmedi", "geç", "shipping", "delivery"},
    "kalite": {"kalite", "kaliteli", "bozuk", "kırık", "dayanıklı", "quality", "broken"},
    "hizmet": {"hizmet", "destek", "müşteri", "ilgi", "çağrı", "service", "support"},
    "beden": {"beden", "numara", "kalıp", "dar", "bol", "size"},
}


def yorum_duygusu(metin: str) -> str:
    """Tek yorum → 'olumlu' | 'olumsuz' | 'notr'. Metin bellekte işlenir, saklanmaz."""
    kelimeler = re.findall(r"[\wçğıöşüâî']+", tr_kucuk(metin))
    ing = [k.replace("ı", "i") for k in kelimeler]  # İngilizce büyük I → ı dönüşümünü geri al
    pos = sum(1 for k, e in zip(kelimeler, ing) if k in OLUMLU or e in OLUMLU or any(k.startswith(o) for o in ("beğen", "sevdi", "teşekkür")))
    neg = sum(1 for k, e in zip(kelimeler, ing) if k in OLUMSUZ or e in OLUMSUZ)
    if pos > neg and any(k in _OLUMSUZLUK for k in kelimeler):
        pos, neg = neg, pos  # "güzel değil" → olumsuz
    return "olumlu" if pos > neg else "olumsuz" if neg > pos else "notr"


@dataclass
class DuyguOzeti:
    icerik_id: str
    tarih: str
    yorum_sayisi: int
    olumlu: float
    notr: float
    olumsuz: float
    one_cikan_konular: list[str] = field(default_factory=list)
    yontem: str = "sozluk"


def duygu_ozetle(icerik_id: str, tarih: str, metinler: Iterable[str]) -> DuyguOzeti | None:
    """Yorum metinlerini sayıma indirger; metinler döndürülmez, saklanmaz. Yorum yoksa None."""
    say = {"olumlu": 0, "notr": 0, "olumsuz": 0}
    konu: dict[str, int] = {}
    n = 0
    for m in metinler:
        n += 1
        say[yorum_duygusu(m)] += 1
        kel = set(re.findall(r"[\wçğıöşü]+", tr_kucuk(m)))
        for k, sozluk in KONU_SOZLUK.items():
            if kel & sozluk:
                konu[k] = konu.get(k, 0) + 1
    if n == 0:
        return None
    one = [k for k, _ in sorted(konu.items(), key=lambda kv: (-kv[1], kv[0]))[:3]]
    return DuyguOzeti(icerik_id, tarih, n, say["olumlu"] / n, say["notr"] / n, say["olumsuz"] / n, one, "sozluk")


class LLMDuyguSiniflandirici:
    """LLM ile duygu sınıflandırma arayüzü (yalnız arayüz; çağrı yok). ADR-009 riski: metin sağlayıcıya gider.

    Uygulanırsa: kimliksiz metin, toplu istek, yanıt yalnız etiket; 06 §5. Bkz. NOTLAR.md.
    """

    yontem = "llm"

    def siniflandir(self, metinler: list[str]) -> list[str]:  # pragma: no cover
        raise NotImplementedError("LLM duygu yolu bu sürümde kapalı; sözlük yöntemini kullanın (NOTLAR.md).")


# ───────────────────────── Kayıt sınıfları ─────────────────────────
@dataclass
class HesapKaydi:
    platform: str
    hesap_kimligi: str
    hesap_adi: str | None
    tur: str  # reklam_hesabi | sayfa | profil


@dataclass
class IcerikKaydi:
    id: str  # '<platform>:<icerik_kimligi>'
    platform: str
    hesap_kimligi: str
    tur: str  # reklam | organik
    bicim: str | None = None
    yaratici_turu: str | None = None
    yayin_zamani: str | None = None
    konu: str | None = None
    metin_ozeti: str | None = None
    kampanya_id: str | None = None  # yalnız kampanya tablosunda varsa bağlanır
    dis_kampanya_id: str | None = None  # platform kampanya kimliği (saklanmaz; eşleme ipucu)


@dataclass
class MetrikKaydi:
    icerik_id: str
    tarih: str
    yas_bandi: str = "hepsi"
    cinsiyet: str = "hepsi"
    bolge: str = "hepsi"
    gosterim: int = 0
    erisim: int | None = None
    tiklama: int = 0
    etkilesim: int | None = None
    video_izlenme: int | None = None
    video_3sn: int | None = None
    video_tam: int | None = None
    donusum: int | None = None
    harcama_tl: float | None = None


@dataclass
class KonuHacmi:
    platform: str
    konu: str
    tarih: str
    hacim: int
    kaynak: str = "api"  # api | export | tahmini


# ───────────────────────── Yazıcılar ─────────────────────────
def hesap_id(kiraci: str, platform: str, hesap_kimligi: str) -> str:
    return f"{kiraci}:{platform}:{hesap_kimligi}"


def kaydet_hesap(c: sqlite3.Connection, kiraci: str, h: HesapKaydi, son_cekim: str | None = None) -> str:
    hid = hesap_id(kiraci, h.platform, h.hesap_kimligi)
    c.execute("""INSERT INTO sosyal_hesap(id, kiraci_id, platform, hesap_adi, tur, son_cekim) VALUES (?,?,?,?,?,?)
                 ON CONFLICT(id) DO UPDATE SET hesap_adi=COALESCE(excluded.hesap_adi, hesap_adi), tur=excluded.tur,
                 son_cekim=COALESCE(excluded.son_cekim, son_cekim)""", (hid, kiraci, h.platform, h.hesap_adi, h.tur, son_cekim))
    return hid


def kaydet_icerik(c: sqlite3.Connection, kiraci: str, ic: IcerikKaydi) -> None:
    """İçeriği yazar; yoksa hesabı oluşturur. kampanya_id yalnız kampanya tablosunda varsa bağlanır."""
    hid = hesap_id(kiraci, ic.platform, ic.hesap_kimligi)
    var = c.execute("SELECT h.kiraci_id FROM sosyal_icerik i JOIN sosyal_hesap h ON h.id=i.hesap_id WHERE i.id=?", (ic.id,)).fetchone()
    if var and var[0] != kiraci:
        raise ValueError(f"{ic.id} başka bir kiracıya ait; kiracılar arası içerik paylaşılmaz.")
    if not c.execute("SELECT 1 FROM sosyal_hesap WHERE id=?", (hid,)).fetchone():
        kaydet_hesap(c, kiraci, HesapKaydi(ic.platform, ic.hesap_kimligi, None, "reklam_hesabi" if ic.tur == "reklam" else "sayfa"))
    kamp = None
    for aday in (ic.kampanya_id, ic.dis_kampanya_id and f"{ic.platform}:{ic.dis_kampanya_id}"):
        if aday and c.execute("SELECT 1 FROM kampanya WHERE id=? AND kiraci_id=?", (aday, kiraci)).fetchone():
            kamp = aday
            break
    c.execute("""INSERT INTO sosyal_icerik(id, hesap_id, kampanya_id, tur, bicim, yaratici_turu, yayin_zamani, konu, metin_ozeti)
                 VALUES (?,?,?,?,?,?,?,?,?)
                 ON CONFLICT(id) DO UPDATE SET kampanya_id=COALESCE(excluded.kampanya_id, kampanya_id), tur=excluded.tur,
                 bicim=COALESCE(excluded.bicim, bicim), yaratici_turu=COALESCE(excluded.yaratici_turu, yaratici_turu),
                 yayin_zamani=COALESCE(excluded.yayin_zamani, yayin_zamani), konu=COALESCE(excluded.konu, konu),
                 metin_ozeti=COALESCE(excluded.metin_ozeti, metin_ozeti)""",
              (ic.id, hid, kamp, ic.tur, ic.bicim, ic.yaratici_turu or yaratici_turu(ic.metin_ozeti), ic.yayin_zamani, ic.konu,
               metin_ozeti(ic.metin_ozeti)))


_METRIK_ALAN = ("gosterim", "erisim", "tiklama", "etkilesim", "video_izlenme", "video_3sn", "video_tam", "donusum", "harcama_tl")


def kaydet_metrikler(c: sqlite3.Connection, kayitlar: Iterable[MetrikKaydi]) -> int:
    """UNIQUE (icerik, tarih, yaş, cinsiyet, bölge) çakışmasında satırı günceller. Boş kırılım 'hepsi' olur."""
    n = 0
    sql = (f"INSERT INTO sosyal_metrik(icerik_id, tarih, yas_bandi, cinsiyet, bolge, {', '.join(_METRIK_ALAN)}) "
           f"VALUES ({','.join('?' * (5 + len(_METRIK_ALAN)))}) ON CONFLICT(icerik_id, tarih, yas_bandi, cinsiyet, bolge) DO UPDATE SET "
           + ", ".join(f"{a}=excluded.{a}" for a in _METRIK_ALAN))
    for m in kayitlar:
        c.execute(sql, (m.icerik_id, m.tarih[:10], m.yas_bandi or "hepsi", m.cinsiyet or "hepsi", m.bolge or "hepsi",
                        *[getattr(m, a) for a in _METRIK_ALAN]))
        n += 1
    return n


def kaydet_duygu(c: sqlite3.Connection, ozetler: Iterable[DuyguOzeti]) -> int:
    n = 0
    for d in ozetler:
        c.execute("""INSERT INTO sosyal_duygu_ozeti(icerik_id, tarih, yorum_sayisi, olumlu, notr, olumsuz, one_cikan_konular, yontem)
                     VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(icerik_id, tarih) DO UPDATE SET yorum_sayisi=excluded.yorum_sayisi,
                     olumlu=excluded.olumlu, notr=excluded.notr, olumsuz=excluded.olumsuz,
                     one_cikan_konular=excluded.one_cikan_konular, yontem=excluded.yontem""",
                  (d.icerik_id, d.tarih[:10], d.yorum_sayisi, d.olumlu, d.notr, d.olumsuz, json.dumps(d.one_cikan_konular, ensure_ascii=False), d.yontem))
        n += 1
    return n


def kaydet_konu_hacmi(c: sqlite3.Connection, kayitlar: Iterable[KonuHacmi]) -> int:
    n = 0
    for k in kayitlar:
        c.execute("""INSERT INTO sosyal_konu_hacmi(platform, konu, tarih, hacim, kaynak) VALUES (?,?,?,?,?)
                     ON CONFLICT(platform, konu, tarih) DO UPDATE SET hacim=excluded.hacim, kaynak=excluded.kaynak""",
                  (k.platform, k.konu, k.tarih[:10], int(k.hacim), k.kaynak))
        n += 1
    return n
