"""Metin sınıflandırıcı: KAP bildirimi / haber metninden ağaç türünü ve parametreleri çıkarır.

Kural tabanlıdır (anahtar kelime + sayı yakalama). Dil modeli gerekmez; çevrimdışı çalışır.
Çıkaramadığı parametreleri None bırakır; motor bunları 'eksik' olarak raporlar ve
kullanıcı `--param anahtar=deger` ile tamamlar.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from .agaclar import AGACLAR

# Türkçe küçük harfe çevirme (İ→i, I→ı)
_TR = str.maketrans({"İ": "i", "I": "ı", "Ğ": "ğ", "Ü": "ü", "Ş": "ş", "Ö": "ö", "Ç": "ç"})


def kucult(s: str) -> str:
    return s.translate(_TR).lower()


# (tür, [anahtar kelime desenleri], ağırlık) — ilk eşleşen değil, en yüksek puan kazanır
KURALLAR: list[tuple[str, list[str], float]] = [
    ("bedelsiz_sermaye_artirimi", [r"bedelsiz", r"iç kaynak", r"sermaye düzeltmesi olumlu fark", r"emisyon prim"], 1.0),
    ("bedelli_sermaye_artirimi", [r"bedelli", r"rüçhan", r"nominal değer üzerinden", r"tahsisli"], 1.0),
    ("temettu", [r"temettü", r"kâr payı", r"kar payı", r"brüt .* tl .*pay başına", r"pay başına brüt", r"hisse başına brüt", r"nakit kâr", r"nakit kar"], 1.0),
    ("pay_geri_alim", [r"geri alı[mn]", r"pay(ların)? geri", r"geri alım program"], 1.2),
    ("birlesme_devralma", [r"birleşme", r"devralma", r"devir alma", r"satın alma(sı)?na ilişkin", r"pay alım teklifi", r"zorunlu çağrı", r"çağrı yoluyla", r"hisse devri sözleşmesi"], 1.0),
    ("ortaklik_yapisi", [r"pay devri", r"ortaklık yapısı", r"hâkim ortak", r"hakim ortak", r"kontrol değişikliği", r"blok satış", r"paylarını .*devret", r"pay alım satım bildirimi"], 0.9),
    ("yeni_sozlesme", [r"sözleşme imzala", r"yeni iş ilişkisi", r"sipariş ald", r"ihracat sözleşmesi", r"anlaşma imzala", r"sözleşme bedeli"], 1.0),
    ("ihale", [r"ihale"], 1.1),
    ("finansal_rapor", [r"finansal rapor", r"bilanço", r"net dönem kâr", r"net dönem kar", r"çeyrek.*kâr", r"çeyrek.*kar", r"favök", r"net kâr", r"net kar", r"zarar açıkla"], 0.9),
    ("kredi_derecelendirme_sirket", [r"kredi derecelendirme", r"kredi notunu", r"fitch", r"moody", r"s&p", r"jcr", r"saha kurumsal"], 0.8),
    ("borclanma_araci", [r"tahvil", r"bono ihrac", r"borçlanma arac", r"eurobond", r"sukuk", r"kira sertifikas", r"ihraç tavanı"], 1.0),
    ("halka_arz", [r"halka arz", r"ikincil halka arz", r"izahname", r"talep toplama"], 1.1),
    ("yonetim_degisikligi", [r"genel müdür", r"ceo", r"cfo", r"yönetim kurulu başkan", r"istifa", r"atand", r"görevden"], 0.8),
    ("dava_yaptirim", [r"dava", r"idari para cezas", r"rekabet kurulu", r"mahkeme", r"tahkim", r"yaptırım", r"spk .*ceza", r"soruşturma açıl"], 0.9),
    ("varlik_islemi", [r"maddi duran varlık", r"gayrimenkul sat", r"iştirak sat", r"bağlı ortaklık sat", r"finansal duran varlık", r"arsa sat", r"fabrika sat", r"hisselerinin satış"], 0.9),
    ("tesvik_belgesi", [r"teşvik belgesi", r"yatırım teşvik"], 1.2),
    ("tcmb_faiz_karari", [r"para politikası kurulu", r"politika faizi", r"ppk", r"tcmb.*faiz", r"merkez bankası.*faiz", r"bir hafta vadeli repo"], 1.3),
    ("tcmb_enflasyon_raporu", [r"enflasyon raporu", r"yıl sonu enflasyon tahmini", r"tahminini .*yükselt", r"tahminini .*düşür"], 1.3),
    ("enflasyon_verisi", [r"tüfe", r"tüik.*enflasyon", r"enflasyon.*açıkland", r"yıllık enflasyon", r"aylık enflasyon", r"üfe"], 1.2),
    ("kredi_notu_ulke", [r"türkiye'nin (kredi )?notu", r"türkiye.*kredi not", r"ülke notu", r"görünüm.*(pozitif|negatif|durağan)", r"ba3", r"bb-"], 1.1),
    ("jeopolitik_sok", [r"savaş", r"saldırı", r"füze", r"hürmüz", r"ateşkes", r"barış", r"ambargo", r"yaptırım paketi", r"iran", r"israil", r"boğaz.*kapa"], 1.0),
    ("siyasi_belirsizlik", [r"kurultay", r"chp", r"kayyum", r"seçim", r"anayasa", r"hükümet", r"cumhurbaşkan", r"bakan.*istifa", r"mutlak butlan"], 0.9),
    ("piyasa_guven_sorusturma", [r"fon soruşturma", r"manipülasyon", r"portföy yönetim şirket", r"tasfiye", r"masak", r"tutukland", r"borsa istanbul genel müdür"], 1.1),
    ("endeks_saglayici_karari", [r"msci", r"ftse", r"endeks sağlayıcı", r"gelişen piyasa.*sınıf", r"askıya ald"], 1.2),
    ("kur_hareketi", [r"dolar/tl", r"usd/try", r"kur.*(sıçra|yüksel|düş)", r"rezerv", r"swap", r"müdahale", r"döviz sat"], 1.0),
    ("buyume_verisi", [r"gsyh", r"gsyih", r"büyüme.*çeyrek", r"ekonomi.*büyüdü", r"milli gelir"], 1.2),
    ("maliye_butce_ovp", [r"orta vadeli program", r"ovp", r"bütçe", r"asgari ücret", r"emekli (maaş|zam)", r"memur (maaş|zam)", r"vergi paketi", r"ötv", r"kdv", r"kurumlar vergisi", r"torba"], 1.0),
    ("enerji_fiyat_duzenlemesi", [r"elektrik.*zam", r"doğalgaz.*zam", r"doğal gaz.*zam", r"epdk", r"botaş", r"tarife", r"brent", r"petrol fiyat"], 1.0),
    ("fed_karari", [r"\bfed\b", r"fomc", r"federal reserve", r"powell", r"warsh"], 1.3),
    ("sektor_duzenlemesi", [r"bddk", r"kredi büyüme sınır", r"kredi kartı.*sınır", r"ithalat.*vergi", r"gümrük vergisi", r"tavan fiyat", r"zorunlu karşılık", r"makro ihtiyati"], 1.0),
]

_SAYI = r"(\d{1,3}(?:[.\s]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)"


def _sayi(s: str) -> float | None:
    s = s.strip()
    if re.fullmatch(r"\d{1,3}(?:[.\s]\d{3})+(?:,\d+)?", s):  # 1.250.000,50 biçimi
        s = s.replace(".", "").replace(" ", "").replace(",", ".")
    else:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def yuzdeler(metin: str) -> list[float]:
    """Metindeki tüm yüzde değerlerini sırayla döndürür (%25, yüzde 25, 25%)."""
    m = kucult(metin)
    bulunan: list[float] = []
    for d in re.finditer(r"(?:%\s*|yüzde\s+)" + _SAYI, m):
        v = _sayi(d.group(1))
        if v is not None:
            bulunan.append(v)
    for d in re.finditer(_SAYI + r"\s*%", m):
        v = _sayi(d.group(1))
        if v is not None:
            bulunan.append(v)
    return bulunan


def baz_puan(metin: str) -> float | None:
    m = kucult(metin)
    d = re.search(_SAYI + r"\s*baz puan", m)
    if d:
        v = _sayi(d.group(1))
        if v is None:
            return None
        if re.search(r"indir|düşür|çek|gevşe", m):
            return -v
        if re.search(r"art(ır|tır)|yükselt|sıkılaş", m):
            return v
        return v
    # "yüzde 37'den yüzde 36'ya"
    d = re.search(r"(?:%|yüzde)\s*" + _SAYI + r"['’]?(?:den|dan|ten|tan)\s+(?:%|yüzde)\s*" + _SAYI, m)
    if d:
        a, b = _sayi(d.group(1)), _sayi(d.group(2))
        if a is not None and b is not None:
            return round((b - a) * 100, 1)
    if re.search(r"sabit (tut|bırak|kal)|değiştirmedi|aynı seviyede", m):
        return 0.0
    return None


def tutar_tl(metin: str) -> float | None:
    """'1,5 milyar TL', '410 milyon dolar' → TL/orijinal birim sayısı (birim ayrıca döner değil; büyüklük)."""
    m = kucult(metin)
    d = re.search(_SAYI + r"\s*(milyar|milyon|bin)\s*(tl|₺|dolar|\$|usd|euro|avro|€)?", m)
    if not d:
        return None
    v = _sayi(d.group(1))
    if v is None:
        return None
    carpan = {"milyar": 1e9, "milyon": 1e6, "bin": 1e3}[d.group(2)]
    return v * carpan


@dataclass
class Siniflandirma:
    tur: str
    puan: float
    adaylar: list[tuple[str, float]]
    parametreler: dict[str, Any] = field(default_factory=dict)
    ipuclari: list[str] = field(default_factory=list)


def tur_bul(metin: str) -> list[tuple[str, float]]:
    m = kucult(metin)
    puanlar: dict[str, float] = {}
    for tur, desenler, agirlik in KURALLAR:
        p = 0.0
        for d in desenler:
            if re.search(d, m):
                p += agirlik
        if p:
            puanlar[tur] = p
    # Makro bağlam: hisse kodu yoksa ve makro anahtar varsa makroyu öne al
    return sorted(puanlar.items(), key=lambda x: -x[1])


def _var(m: str, *desenler: str) -> bool:
    return any(re.search(d, m) for d in desenler)


def parametre_cikar(tur: str, metin: str) -> tuple[dict[str, Any], list[str]]:  # noqa: C901 - kural tablosu
    m = kucult(metin)
    y = yuzdeler(metin)
    p: dict[str, Any] = {}
    ip: list[str] = []

    if tur == "temettu":
        p["nakit"] = not _var(m, r"bedelsiz pay", r"kâr payından .*bedelsiz", r"kar payından .*bedelsiz", r"nakit temettü dağıtmayarak")
        if _var(m, r"nakit temettü dağıtmayarak", r"nakit kâr payı dağıtılmamas", r"nakit kar payı dağıtılmamas"):
            p["nakit"] = False
        d = re.search(r"(?:pay|hisse) başına brüt\s*" + _SAYI + r"\s*tl", m)
        if d:
            p["brut_hisse_basina_tl"] = _sayi(d.group(1))
            ip.append("Temettü verimi için hisse fiyatını --param fiyat_tl=… ile verin; verim hesaplanır.")
        if _var(m, r"artır", r"yükselt"):
            pass
    elif tur == "bedelli_sermaye_artirimi":
        if y:
            p["oran"] = max(y)
        p["nominalden"] = bool(_var(m, r"nominal", r"1[,.]00 tl", r"1 tl"))
        if _var(m, r"borç", r"kredi.*kapat", r"finansal borç", r"yükümlülük"):
            p["amac"] = "borc"
        elif _var(m, r"yatırım", r"kapasite", r"fabrika", r"tesis"):
            p["amac"] = "yatirim"
        elif _var(m, r"iştirak", r"satın al", r"devral"):
            p["amac"] = "istirak"
        elif _var(m, r"işletme sermayesi", r"nakit ihtiyac"):
            p["amac"] = "isletme_sermayesi"
        else:
            p["amac"] = "belirsiz"
        if _var(m, r"taahhüt", r"rüçhan hakkını kullan", r"katılacağını"):
            p["ortak_taahhudu"] = True
        elif _var(m, r"kullanmayacağ", r"katılmayacağ"):
            p["ortak_taahhudu"] = False
    elif tur == "bedelsiz_sermaye_artirimi":
        if y:
            p["oran"] = max(y)
        p["kaynak"] = "kar_payi" if _var(m, r"kâr payı", r"kar payı", r"temettü") else "ic_kaynak"
        d = re.search(_SAYI + r"\s*tl'?(?:den|dan)? işlem gören|fiyat[ıi]\s*" + _SAYI + r"\s*tl", m)
        if d:
            p["fiyat_tl"] = _sayi(d.group(1) or d.group(2))
    elif tur == "pay_geri_alim":
        p["yeni_program"] = bool(_var(m, r"program.*başla", r"karar verilmiştir", r"yetki", r"başlatıl", r"fon ayrıl"))
        if _var(m, r"adet .*geri alın", r"geri alınmıştır", r"geri alım işlemi"):
            p["yeni_program"] = False
        p["dusus_sonrasi"] = bool(_var(m, r"düşüş", r"gerile", r"fiyat.*(olumsuz|değer kayb)"))
        if _var(m, r"borç", r"kredi"):
            p["finansman"] = "borc"
    elif tur == "birlesme_devralma":
        if _var(m, r"teklif ald", r"devralınmas", r"satın alınmas", r"şirketimiz pay.*(için teklif|çağrı)"):
            p["rol"] = "hedef"
        elif _var(m, r"satın al", r"devral", r"iktisap", r"edinil"):
            p["rol"] = "alici"
        p["zorunlu_cagri"] = bool(_var(m, r"zorunlu (pay alım teklifi|çağrı)")) and not _var(m, r"doğmaz", r"doğmamakta", r"muaf")
        if _var(m, r"hisse değişim", r"pay karşılığı", r"hisse ile"):
            p["odeme"] = "hisse"
        elif _var(m, r"nakit"):
            p["odeme"] = "nakit"
        if y:
            p["prim"] = y[0]
    elif tur == "ortaklik_yapisi":
        if y:
            p["pay_orani"] = max(y)
        if _var(m, r"kurucu", r"aile", r"hâkim ortak.*sat", r"hakim ortak.*sat"):
            p["alici_tipi"] = "kurucu_cikis"
        elif _var(m, r"yönetim kurulu (üyesi|başkanı).*(alım|satın al)", r"genel müdür.*al"):
            p["alici_tipi"] = "yonetici_alim"
        elif _var(m, r"yönetim kurulu (üyesi|başkanı).*sat", r"genel müdür.*sat"):
            p["alici_tipi"] = "yonetici_satis"
        elif _var(m, r"fon", r"finansal yatırımcı", r"portföy"):
            p["alici_tipi"] = "finansal"
        elif _var(m, r"holding", r"a\.ş\.", r"stratejik"):
            p["alici_tipi"] = "stratejik"
        p["cagri"] = bool(_var(m, r"çağrı")) and not _var(m, r"doğma(z|mış|makta)", r"muaf")
    elif tur == "yeni_sozlesme":
        t = tutar_tl(metin)
        if t is not None:
            p["tutar"] = t
            ip.append("Ciroya oran için --param tutar_ciro_orani=… verin (bedel / son 12 ay ciro, %).")
        if _var(m, r"ihracat", r"yurt dışı", r"nato", r"abd", r"avrupa", r"müşteri.*ülke"):
            p["karsi_taraf"] = "ihracat"
        elif _var(m, r"ssb", r"savunma sanayii başkanlığ", r"bakanlığ", r"kamu", r"belediye", r"tcdd", r"devlet", r"genel müdürlüğü"):
            p["karsi_taraf"] = "kamu"
        elif _var(m, r"grup şirket", r"ilişkili taraf", r"bağlı ortaklığ"):
            p["karsi_taraf"] = "grup_ici"
        else:
            p["karsi_taraf"] = "yerli_ozel"
        d = re.search(r"\b(\d{1,2})\s*(yıl|ay)\b", m)
        if d:
            v = float(d.group(1))
            p["vade_yil"] = v if d.group(2) == "yıl" else round(v / 12, 2)
        p["doviz"] = bool(_var(m, r"dolar", r"\$", r"usd", r"euro", r"avro", r"€"))
    elif tur == "finansal_rapor":
        d = re.search(r"(%|yüzde)\s*" + _SAYI + r".*(art|yüksel|büyü)", m)
        if d:
            p["net_kar_degisim"] = _sayi(d.group(2))
        d = re.search(r"(%|yüzde)\s*" + _SAYI + r".*(azal|düş|gerile|darald)", m)
        if d and "net_kar_degisim" not in p:
            v = _sayi(d.group(2))
            p["net_kar_degisim"] = -v if v is not None else None
        if _var(m, r"beklenti(nin|lerin) (üzerinde|üstünde)", r"beklentiyi aş"):
            p["beklenti_farki"] = 15.0
        elif _var(m, r"beklenti(nin|lerin) altında", r"beklentiyi karşılayamad"):
            p["beklenti_farki"] = -15.0
        elif _var(m, r"beklenti(ye|lere) (paralel|uyumlu|yakın)"):
            p["beklenti_farki"] = 0.0
        p["tek_seferlik"] = bool(_var(m, r"tek seferlik", r"varlık satış", r"ertelenmiş vergi", r"yeniden değerleme"))
        if _var(m, r"zarar"):
            p.setdefault("beklenti_farki", -15.0)
    elif tur in ("kredi_derecelendirme_sirket", "kredi_notu_ulke"):
        if _var(m, r"yükselt", r"artır", r"not artış"):
            p["eylem"] = "artis"
        elif _var(m, r"görünüm.*negatif", r"negatife", r"pozitiften durağan", r"durağana (çevir|döndür|indir|revize)"):
            p["eylem"] = "gorunum_negatif"
        elif _var(m, r"görünüm.*pozitif", r"pozitif.*görünüm", r"pozitife"):
            p["eylem"] = "gorunum_pozitif"
        elif _var(m, r"indir", r"düşür", r"not kır"):
            p["eylem"] = "indirim"
        elif _var(m, r"güncellemedi", r"pas geç", r"yayımlamadı", r"değerlendirme yapmadı"):
            p["eylem"] = "pas_gecti"
        elif _var(m, r"teyit", r"korudu", r"değiştirmedi", r"sabit bırak"):
            p["eylem"] = "teyit"
        if tur == "kredi_notu_ulke":
            p["beklenti"] = "artis" if _var(m, r"artış bekle", r"bekleniyordu", r"beklenti.*artış") else "teyit"
        else:
            p["ulke_tavani"] = bool(_var(m, r"ülke (notu|tavanı)", r"türkiye'nin notu"))
    elif tur == "borclanma_araci":
        p["doviz"] = bool(_var(m, r"dolar", r"usd", r"eurobond", r"euro", r"avro", r"\$", r"€"))
        if _var(m, r"refinans", r"yeniden finansman", r"itfa"):
            p["amac"] = "refinansman"
        elif _var(m, r"yatırım"):
            p["amac"] = "yatirim"
        elif _var(m, r"işletme sermayesi"):
            p["amac"] = "isletme_sermayesi"
        else:
            p["amac"] = "belirsiz"
        if _var(m, r"ihracat", r"döviz gelir"):
            p["doviz_geliri_var"] = True
    elif tur == "halka_arz":
        p["tur"] = "ikincil" if _var(m, r"ikincil", r"spo", r"mevcut pay.*sat", r"halka açıklık oranı.*artır") else "ilk"
        if _var(m, r"ortak satış", r"mevcut payların satış", r"pay sahibi.*sat"):
            p["satan"] = "ortak"
        elif _var(m, r"sermaye artırım", r"yeni pay"):
            p["satan"] = "sirket"
        if y:
            p["iskonto"] = y[0]
        if _var(m, r"%\s*25|yüzde 25.*sermaye"):
            p["buyukluk_pd_orani"] = 20.0
    elif tur == "yonetim_degisikligi":
        if _var(m, r"soruşturma", r"gözaltı", r"tutukl", r"usulsüz"):
            p["neden"] = "sorusturma"
        elif _var(m, r"istifa"):
            p["neden"] = "istifa"
        elif _var(m, r"görev süresi", r"emekli", r"planlı", r"devir teslim"):
            p["neden"] = "gorev_suresi"
        elif _var(m, r"terfi", r"atand"):
            p["neden"] = "terfi"
        elif _var(m, r"sağlık"):
            p["neden"] = "saglik"
        if _var(m, r"genel müdür", r"ceo", r"icra kurulu başkan"):
            p["pozisyon"] = "ceo"
        elif _var(m, r"mali işler", r"cfo", r"finans.*müdür"):
            p["pozisyon"] = "cfo"
        elif _var(m, r"yönetim kurulu başkan"):
            p["pozisyon"] = "yk_baskani"
        elif _var(m, r"yönetim kurulu üye", r"bağımsız üye"):
            p["pozisyon"] = "yk_uyesi"
        p["ardil_belli"] = bool(_var(m, r"yerine .* atan", r"atanmıştır", r"getirilmiştir", r"vekâleten"))
    elif tur == "dava_yaptirim":
        if _var(m, r"lehine", r"lehimize", r"reddine", r"iptal edilmiş", r"beraat", r"kaldırıl"):
            p["lehte"] = True
        elif _var(m, r"aleyh", r"ceza.*(verildi|uyguland|kesildi)", r"mahkûm", r"tazminat.*hükm"):
            p["lehte"] = False
        p["kesinlesti"] = bool(_var(m, r"kesinleş")) and not _var(m, r"kesinleşme(miş|di)")
        if _var(m, r"itiraz", r"temyiz", r"istinaf", r"yargı yolu"):
            p["kesinlesti"] = False
        p["faaliyet_etkisi"] = bool(_var(m, r"lisans", r"faaliyet(in|i) durdur", r"ruhsat iptal", r"kapatma"))
        t = tutar_tl(metin)
        if t is not None:
            p["tutar"] = t
            ip.append("Özkaynağa oran için --param tutar_ozkaynak_orani=… verin.")
    elif tur == "varlik_islemi":
        p["islem"] = "satis" if _var(m, r"satış", r"satıl", r"devredil", r"elden çıkar") else "alim"
        p["ana_faaliyet"] = not _var(m, r"gayrimenkul", r"arsa", r"bina", r"ges\b", r"güneş enerji", r"otel")
        if y:
            p["defter_degerine_gore"] = y[0]
    elif tur == "tesvik_belgesi":
        if _var(m, r"stratejik"):
            p["tesvik_turu"] = "stratejik"
        elif _var(m, r"hit-?30", r"yüksek teknoloji"):
            p["tesvik_turu"] = "hit30"
        elif _var(m, r"öncelikli"):
            p["tesvik_turu"] = "oncelikli"
        elif _var(m, r"bölgesel"):
            p["tesvik_turu"] = "bolgesel"
        else:
            p["tesvik_turu"] = "genel"
        t = tutar_tl(metin)
        if t is not None:
            p["tutar"] = t
            ip.append("Aktife oran için --param yatirim_aktif_orani=… verin.")
    elif tur == "ihale":
        if _var(m, r"iptal"):
            p["sonuc"] = "iptal"
        elif _var(m, r"kaybed", r"başka.*(firma|şirket).*(kazan|kald)"):
            p["sonuc"] = "kaybedildi"
        elif _var(m, r"en (iyi|avantajlı|düşük) teklif", r"en uygun teklif"):
            p["sonuc"] = "en_iyi_teklif"
        elif _var(m, r"kazan", r"uhdesinde kal", r"sözleşme imzala", r"üzerinde kal"):
            p["sonuc"] = "kazanildi"
        t = tutar_tl(metin)
        if t is not None:
            p["tutar"] = t
            ip.append("Ciroya oran için --param tutar_ciro_orani=… verin.")
    elif tur in ("tcmb_faiz_karari", "fed_karari"):
        bp = baz_puan(metin)
        if bp is not None:
            p["degisim_bp"] = bp
        if _var(m, r"beklenti(ler)?(y)?(le|e) (uyumlu|paralel)", r"bekleniyordu", r"beklendiği gibi"):
            p["beklenti_bp"] = p.get("degisim_bp", 0)
        elif _var(m, r"sürpriz", r"beklenmiyordu", r"beklentilerin (üzerinde|ötesinde)"):
            p["beklenti_bp"] = 0 if p.get("degisim_bp", 0) != 0 else -100
        d = re.search(r"beklenti.*?" + _SAYI + r"\s*baz puan", m)
        if d:
            v = _sayi(d.group(1))
            if v is not None:
                p["beklenti_bp"] = -v if _var(m, r"indirim bekle") else v
        if _var(m, r"temkinli", r"sıkı duruş", r"veriye bağlı", r"veri bağımlı", r"ölçülü", r"ihtiyatlı", r"şahin"):
            anahtar = "metin_tonu" if tur == "tcmb_faiz_karari" else "ton"
            p[anahtar] = "sahin"
        elif _var(m, r"indirim(ler)?(e|in) devam", r"gevşeme", r"güvercin", r"alan (açıldı|var)"):
            anahtar = "metin_tonu" if tur == "tcmb_faiz_karari" else "ton"
            p[anahtar] = "guvercin"
        d = re.search(r"(?:%|yüzde)\s*" + _SAYI + r"['’]?(?:ye|ya|e|a) (indir|çek|düşür|yükselt|çıkar)", m)
        if d:
            p["yeni_faiz"] = _sayi(d.group(1))
    elif tur == "enflasyon_verisi":
        d = re.search(r"aylık.*?(?:%|yüzde)\s*" + _SAYI, m)
        if d:
            p["aylik"] = _sayi(d.group(1))
        d = re.search(r"yıllık.*?(?:%|yüzde)\s*" + _SAYI, m)
        if d:
            p["yillik"] = _sayi(d.group(1))
        d = re.search(r"beklenti.*?(?:%|yüzde)\s*" + _SAYI, m)
        if d:
            p["beklenti_aylik"] = _sayi(d.group(1))
        d = re.search(r"(?:önceki ay|eylül|ağustos|temmuz|haziran|mayıs|nisan|mart|şubat|ocak|aralık|kasım|ekim)['’]?(?:de|da|te|ta)\s*(?:yıllık\s*)?(?:%|yüzde)\s*" + _SAYI, m)
        if d:
            p["onceki_yillik"] = _sayi(d.group(1))
        if "beklenti_aylik" not in p:
            if _var(m, r"beklentinin (üzerinde|üstünde)", r"beklentiyi aş"):
                p["beklenti_aylik"] = (p.get("aylik") or 0) - 0.4
            elif _var(m, r"beklentinin altında"):
                p["beklenti_aylik"] = (p.get("aylik") or 0) + 0.4
        if "onceki_yillik" not in p and p.get("yillik") is not None:
            if _var(m, r"yüksel", r"artış", r"seri (bitti|sona erdi|kırıldı)"):
                p["onceki_yillik"] = p["yillik"] - 0.1
            elif _var(m, r"geriled", r"düş"):
                p["onceki_yillik"] = p["yillik"] + 0.5
    elif tur == "tcmb_enflasyon_raporu":
        if _var(m, r"yükselt", r"yukarı"):
            p["tahmin_degisim_puan"] = 1.0
        elif _var(m, r"düşür", r"aşağı"):
            p["tahmin_degisim_puan"] = -1.0
        elif _var(m, r"korudu", r"değiştirmedi"):
            p["tahmin_degisim_puan"] = 0.0
    elif tur == "jeopolitik_sok":
        p["yon"] = "yumusama" if _var(m, r"ateşkes", r"barış", r"anlaşma", r"müzakere", r"açıld", r"yumuşa") else "tirmanma"
        if _var(m, r"savaş", r"işgal", r"hürmüz.*kapa", r"nükleer"):
            p["siddet"] = "yuksek"
        elif _var(m, r"saldırı", r"füze", r"iha", r"vur"):
            p["siddet"] = "orta"
        else:
            p["siddet"] = "dusuk"
        if _var(m, r"petrol.*(yüksel|art|sıçra|aştı)", r"brent.*(yüksel|art|aştı)", r"hürmüz"):
            p["petrol_yonu"] = "artis"
        elif _var(m, r"petrol.*(düş|gerile)"):
            p["petrol_yonu"] = "dusus"
        else:
            p["petrol_yonu"] = "notr"
        p["turkiye_dogrudan"] = bool(_var(m, r"türkiye.*(hedef|saldır|taraf)", r"sınır"))
    elif tur == "siyasi_belirsizlik":
        p["yon"] = "azaldi" if _var(m, r"ertelen", r"reddedil", r"düştü", r"uzlaş", r"rahatla", r"sona erdi") else "artti"
        if _var(m, r"kurultay", r"chp", r"kayyum", r"mutlak butlan"):
            p["konu"] = "muhalefet_dava"
        elif _var(m, r"seçim"):
            p["konu"] = "secim"
        elif _var(m, r"bakan", r"kabine", r"hükümet"):
            p["konu"] = "hukumet_degisikligi"
        elif _var(m, r"merkez bankası başkan", r"bağımsızlı"):
            p["konu"] = "kurum_bagimsizligi"
        else:
            p["konu"] = "diger"
        p["ekonomi_yonetimi_etkilenir"] = bool(_var(m, r"şimşek", r"karahan", r"ekonomi yönetimi", r"program", r"merkez bankası başkan"))
    elif tur == "piyasa_guven_sorusturma":
        if _var(m, r"tutukl"):
            p["asama"] = "tutuklama"
        elif _var(m, r"tasfiye"):
            p["asama"] = "tasfiye"
        elif _var(m, r"iddianame", r"karar", r"sonuç"):
            p["asama"] = "sonuc"
        else:
            p["asama"] = "baslangic"
        p["kapsam_genislik"] = "genis" if _var(m, r"\d+ fon", r"milyar", r"portföy yönetim şirketleri", r"onlarca", r"\d{2,} (kişi|isim)") else "dar"
        p["duzenleyici_etkilendi"] = bool(_var(m, r"spk (yönetici|daire|eski)", r"borsa istanbul (genel müdür|yönetici)", r"eski spk"))
    elif tur == "endeks_saglayici_karari":
        if _var(m, r"askıya", r"ertele"):
            p["eylem"] = "askiya_alma"
        elif _var(m, r"sınıf.*(düşür|uyar)", r"sınırda piyasa", r"frontier"):
            p["eylem"] = "sinif_dusurme_uyarisi"
        elif _var(m, r"yükselt"):
            p["eylem"] = "sinif_yukseltme"
        else:
            p["eylem"] = "olagan_revizyon"
        p["hisse_etkisi"] = bool(_var(m, r"eklendi", r"çıkarıldı", r"dahil edil"))
    elif tur == "kur_hareketi":
        if y:
            p["gunluk_degisim"] = y[0]
        d = re.search(_SAYI + r"\s*milyar dolar (azal|gerile|düş|erid)", m)
        if d:
            p["rezerv_degisim_haftalik_mlr"] = -(_sayi(d.group(1)) or 0)
        d = re.search(_SAYI + r"\s*milyar dolar (art|yüksel)", m)
        if d:
            p["rezerv_degisim_haftalik_mlr"] = _sayi(d.group(1))
        p["mudahale"] = bool(_var(m, r"müdahale", r"döviz sat", r"koridor"))
    elif tur == "buyume_verisi":
        if y:
            p["yillik"] = y[0]
        d = re.search(r"beklenti.*?(?:%|yüzde)\s*" + _SAYI, m)
        if d:
            p["beklenti"] = _sayi(d.group(1))
        elif _var(m, r"beklentinin (üzerinde|üstünde)"):
            p["beklenti"] = (p.get("yillik") or 0) - 1
        elif _var(m, r"beklentinin altında", r"en düşük"):
            p["beklenti"] = (p.get("yillik") or 0) + 1
    elif tur == "maliye_butce_ovp":
        if _var(m, r"orta vadeli program", r"ovp"):
            p["konu"] = "ovp"
        elif _var(m, r"bütçe"):
            p["konu"] = "butce"
        elif _var(m, r"asgari ücret"):
            p["konu"] = "asgari_ucret"
        elif _var(m, r"emekli", r"memur"):
            p["konu"] = "maas_zammi"
        elif _var(m, r"ötv.*(akaryakıt|motorin|benzin)", r"(akaryakıt|motorin|benzin).*ötv"):
            p["konu"] = "otv_akaryakit"
        elif _var(m, r"indirim", r"istisna", r"muafiyet", r"sıfırla"):
            p["konu"] = "vergi_indirimi"
        else:
            p["konu"] = "vergi_artisi"
        if _var(m, r"gerçekçi", r"beklentiyle uyumlu", r"piyasa beklentisine yakın"):
            p["hedef_gercekci"] = True
        elif _var(m, r"iyimser", r"ulaşılması zor", r"hedefin (altında|üzerinde) kal"):
            p["hedef_gercekci"] = False
        if y and p["konu"] in ("asgari_ucret", "maas_zammi"):
            p["zam_orani"] = y[0]
            p["sikilastirici"] = y[0] <= 30
    elif tur == "enerji_fiyat_duzenlemesi":
        if y:
            p["zam_orani"] = max(y)
        if _var(m, r"sanayi") and _var(m, r"mesken", r"konut"):
            p["kesim"] = "her_ikisi"
        elif _var(m, r"sanayi", r"ticarethane"):
            p["kesim"] = "sanayi"
        else:
            p["kesim"] = "mesken"
    elif tur == "sektor_duzenlemesi":
        p["yon"] = "gevsetici" if _var(m, r"kaldır", r"gevşet", r"esnet", r"teşvik", r"indirim") else "sikilastirici"
        p["kalici"] = bool(_var(m, r"kanun", r"yönetmelik", r"kalıcı")) and not _var(m, r"geçici", r"ay süreyle", r"yıl sonuna kadar")
        for s_ad, desen in [("banka", r"bddk|banka|kredi"), ("enerji", r"epdk|enerji|elektrik"), ("otomotiv", r"otomotiv|araç"),
                            ("perakende", r"perakende|market"), ("insaat", r"inşaat|konut")]:
            if re.search(desen, m):
                p["sektor"] = s_ad
                break
        else:
            p["sektor"] = "diger"
    return p, ip


HISSE_KODU = re.compile(r"\b([A-Z]{4,5})\b")


def hisse_bul(metin: str, bilinen: set[str] | None = None) -> str | None:
    """Metindeki büyük harfli 4–5 karakterlik BIST kodu adaylarından ilkini döndürür."""
    for d in HISSE_KODU.finditer(metin):
        kod = d.group(1)
        if kod in {"TCMB", "TÜİK", "TUIK", "SPK", "BDDK", "MSCI", "FTSE", "BIST", "KAP", "EPDK", "MASAK", "FAVÖK", "OVP", "GSYH", "NATO", "ABD"}:
            continue
        if bilinen is None or kod in bilinen:
            return kod
    return None


def siniflandir(metin: str, tur: str | None = None) -> Siniflandirma:
    adaylar = tur_bul(metin)
    if tur is None:
        if not adaylar:
            raise ValueError("Metin hiçbir ağaç türüyle eşleşmedi; --tur ile belirtin. Türler: " + ", ".join(AGACLAR))
        tur = adaylar[0][0]
    puan = dict(adaylar).get(tur, 0.0)
    p, ip = parametre_cikar(tur, metin)
    return Siniflandirma(tur=tur, puan=puan, adaylar=adaylar[:5], parametreler=p, ipuclari=ip)
