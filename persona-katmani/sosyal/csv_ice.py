"""Reklam yöneticisi dışa aktarım CSV'lerini ortak şemaya okur (API anahtarı yokken; ADR-009 madde 4).

Desteklenen: Meta Ads Manager (Age, Gender kırılımlı), TikTok Ads "Audience" raporu, X Ads "Audience" raporu.
Başlıklar Türkçe veya İngilizce olabilir; bilinmeyen sütunlar yok sayılır, tanınan metrik sütunu yoksa açık hata.
"""
from __future__ import annotations

import csv
import hashlib
import io
import re
from datetime import date, datetime
from pathlib import Path

from .ortak import IcerikKaydi, MetrikKaydi, cinsiyet, kucuk_varyantlar, yas_bandi, yaratici_turu

# ortak alan → başlık eşanlamlıları (küçük harf, Türkçe duyarlı)
SUTUNLAR: dict[str, tuple[str, ...]] = {
    "tarih": ("day", "date", "by day", "reporting starts", "gün", "tarih", "raporlama başlangıcı", "başlangıç tarihi", "time"),
    "yas": ("age", "yaş", "age range", "yaş aralığı"),
    "cinsiyet": ("gender", "cinsiyet"),
    "bolge": ("region", "bölge", "location", "konum", "il"),
    "platform": ("platform", "publisher platform", "yayıncı platformu"),
    "icerik_ad": ("ad name", "reklam adı", "ad", "tweet text", "tweet metni", "promoted tweet", "creative name", "kreatif adı"),
    "icerik_kimlik": ("ad id", "reklam kimliği", "reklam id", "tweet id", "promoted tweet id"),
    "kampanya_ad": ("campaign name", "kampanya adı", "campaign", "kampanya"),
    "gosterim": ("impressions", "gösterimler", "gösterim"),
    "erisim": ("reach", "erişim"),
    "tiklama": ("link clicks", "bağlantı tıklamaları", "clicks (destination)", "url clicks", "clicks", "tıklamalar", "tıklama"),
    "tum_tiklama": ("clicks (all)", "tıklamalar (tümü)"),
    "etkilesim": ("post engagement", "gönderi etkileşimi", "engagements", "etkileşimler", "etkileşim"),
    "video_izlenme": ("video plays", "video oynatmaları", "video views", "video görüntülemeleri", "video izlenmeleri"),
    "video_3sn": ("3-second video plays", "3 saniyelik video oynatmaları", "video views at 2s", "2-second video views",
                  "2 saniyelik video görüntülemeleri", "3s/100% video views", "3 sn video izlenmeleri"),
    "video_tam": ("video plays at 100%", "videonun %100'ünün oynatılması", "video views at 100%", "video completions",
                  "100% video views", "video tamamlanma", "%100 video izlenmeleri"),
    "donusum": ("results", "sonuçlar", "conversions", "dönüşümler", "purchases", "satın almalar"),
    "harcama": ("amount spent (try)", "harcanan tutar (try)", "cost", "maliyet", "spend", "harcama", "total spend", "toplam harcama"),
}
METRIK_ALANLARI = ("gosterim", "erisim", "tiklama", "tum_tiklama", "etkilesim", "video_izlenme", "video_3sn", "video_tam", "donusum", "harcama")
PLATFORM_ESLEME = {"meta": "facebook", "facebook": "facebook", "instagram": "instagram", "tiktok": "tiktok", "x": "x", "twitter": "x"}


def _normal(baslik: str) -> list[str]:
    """Başlığın Türkçe ve İngilizce küçük harf biçimleri."""
    temiz = baslik.strip().strip('"').lstrip(chr(0xFEFF))
    return [re.sub(r"\s+", " ", v) for v in kucuk_varyantlar(temiz).split("\n")]


def sutun_esle(basliklar: list[str]) -> dict[str, str]:
    """Ortak alan → dosyadaki başlık. Para birimi farklı harcama başlıkları ('Amount spent (USD)') da tanınır."""
    esles: dict[str, str] = {}
    for b in basliklar:
        nler = _normal(b)
        for alan, adlar in SUTUNLAR.items():
            if alan not in esles and any(n in adlar for n in nler):
                esles[alan] = b
                break
        else:
            if "harcama" not in esles and any(re.match(r"(amount spent|harcanan tutar|cost|spend)\b", n) for n in nler):
                esles["harcama"] = b
    return esles


def _sayi(s: str | None, ondalik_virgul: bool) -> float | None:
    if s is None:
        return None
    s = re.sub(r"[^\d,.\-]", "", str(s))
    if s in ("", "-", ".", ","):
        return None
    if ondalik_virgul:
        s = s.replace(".", "").replace(",", ".")
    else:
        s = s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def _tarih(s: str | None) -> str | None:
    if not s:
        return None
    s = s.strip()[:19]
    for bicim in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%d.%m.%Y", "%d/%m/%Y", "%Y/%m/%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(s if " " in bicim else s[:10], bicim).date().isoformat()
        except ValueError:
            pass
    return None


def oku(platform: str, metin: str, dosya_adi: str = "dosya.csv", varsayilan_tarih: str | None = None,
        kampanya_id: str | None = None) -> tuple[list[IcerikKaydi], list[MetrikKaydi], dict]:
    """CSV metnini içerik ve metrik kayıtlarına çevirir. Döner: (içerikler, metrikler, rapor)."""
    platform = PLATFORM_ESLEME.get(platform.lower())
    if not platform:
        raise ValueError("platform: meta | facebook | instagram | tiktok | x")
    ornek = metin[:4096]
    try:
        ayrac = csv.Sniffer().sniff(ornek, delimiters=",;\t").delimiter
    except csv.Error:
        ayrac = ";" if ornek.count(";") > ornek.count(",") else ","
    ondalik_virgul = ayrac == ";"  # Türkçe Excel dışa aktarımı: ';' ayraç, ',' ondalık
    okuyucu = csv.DictReader(io.StringIO(metin.lstrip(chr(0xFEFF))), delimiter=ayrac)
    basliklar = okuyucu.fieldnames or []
    esle = sutun_esle(basliklar)
    if not any(a in esle for a in METRIK_ALANLARI):
        raise ValueError(f"{dosya_adi}: tanınan metrik sütunu yok. Başlıklar: {basliklar}. Beklenen ör.: Impressions/Gösterimler, Age/Yaş.")
    if "gosterim" not in esle:
        raise ValueError(f"{dosya_adi}: 'Impressions' / 'Gösterimler' sütunu zorunlu.")
    taninmayan = [b for b in basliklar if b not in esle.values()]
    dosya_kok = hashlib.sha256(dosya_adi.encode()).hexdigest()[:8]
    icerikler: dict[str, IcerikKaydi] = {}
    metrikler: dict[tuple, MetrikKaydi] = {}
    atlanan = 0
    bugun = varsayilan_tarih or date.today().isoformat()
    for r in okuyucu:
        al = lambda alan: (r.get(esle[alan]) or "").strip() if alan in esle else None  # noqa: E731
        ilk = (next(iter(r.values()), "") or "").strip().lower()
        if ilk.startswith(("total", "toplam", "genel toplam")):
            atlanan += 1
            continue
        y = yas_bandi(al("yas")) if "yas" in esle else "hepsi"
        if y is None:
            atlanan += 1  # 13-17, bilinmeyen yaş
            continue
        g = cinsiyet(al("cinsiyet")) if "cinsiyet" in esle else "hepsi"
        p = platform
        if "platform" in esle and platform in ("facebook", "instagram"):
            p = "instagram" if "instagram" in (al("platform") or "").lower() else "facebook"
        ad = al("icerik_ad") or al("kampanya_ad") or ""
        kimlik = al("icerik_kimlik") or (hashlib.sha256(ad.encode()).hexdigest()[:10] if ad else f"csv-{dosya_kok}")
        iid = f"{p}:{kimlik}"
        sayi = lambda alan: _sayi(al(alan), ondalik_virgul)  # noqa: E731
        v3 = sayi("video_3sn")
        if iid not in icerikler:
            icerikler[iid] = IcerikKaydi(iid, p, f"csv-{p}", "reklam", None, yaratici_turu(ad), None, None, ad or None, kampanya_id=kampanya_id)
        if v3 and v3 > 0:
            icerikler[iid].bicim = "video"
        elif icerikler[iid].bicim is None:
            icerikler[iid].bicim = "gorsel" if "video_3sn" not in esle else None
        tarih = _tarih(al("tarih")) or bugun
        tik = sayi("tiklama")
        if tik is None:
            tik = sayi("tum_tiklama")
        anahtar = (iid, tarih, y, g, al("bolge") or "hepsi")
        m = metrikler.get(anahtar)
        if m is None:
            m = metrikler[anahtar] = MetrikKaydi(iid, tarih, y, g, al("bolge") or "hepsi", 0, None, 0)
        # aynı anahtar ikinci kez gelirse topla (ör. 'Unknown' cinsiyetler birleşir)
        m.gosterim += int(sayi("gosterim") or 0)
        m.tiklama += int(tik or 0)
        for alan, hedef in (("erisim", "erisim"), ("etkilesim", "etkilesim"), ("video_izlenme", "video_izlenme"), ("video_3sn", "video_3sn"),
                            ("video_tam", "video_tam"), ("donusum", "donusum")):
            v = sayi(alan)
            if v is not None:
                setattr(m, hedef, int((getattr(m, hedef) or 0) + v))
        h = sayi("harcama")
        if h is not None:
            m.harcama_tl = round((m.harcama_tl or 0) + h, 2)
    for ic in icerikler.values():
        ic.bicim = ic.bicim or "gorsel"
    rapor = {"satir": len(metrikler), "icerik": len(icerikler), "atlanan": atlanan, "taninan": sorted(esle), "yok_sayilan": taninmayan,
             "ayrac": ayrac}
    return list(icerikler.values()), list(metrikler.values()), rapor


def dosya_oku(platform: str, yol: str, **kw):
    ham = Path(yol).read_bytes()
    if ham[:2] in (b"\xff\xfe", b"\xfe\xff"):
        metin = ham.decode("utf-16")
    else:
        try:
            metin = ham.decode("utf-8-sig")
        except UnicodeDecodeError:
            metin = ham.decode("cp1254")  # eski Türkçe Excel
    return oku(platform, metin, Path(yol).name, **kw)
