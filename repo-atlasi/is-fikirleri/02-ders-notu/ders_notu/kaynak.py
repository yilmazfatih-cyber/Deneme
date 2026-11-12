"""Ders kaynağını bulma: yerel dosya ya da (yalnızca izinli alan adlarında) yt-dlp ile indirme.

yt-dlp API'si yt-dlp/yt-dlp @ 412e7f0 (2026-11-04, sürüm 2026.10.26) klonunda doğrulandı:
- yt_dlp/YoutubeDL.py: YoutubeDL(params) bağlam yöneticisi, extract_info(url, download=...); kullanılan parametreler
  paths, outtmpl, restrictfilenames, quiet, no_warnings, noprogress, noplaylist, playlist_items, allowed_extractors,
  match_filter, progress_hooks, max_filesize, socket_timeout, retries, sleep_interval_requests, writesubtitles,
  writeautomaticsub, subtitleslangs, subtitlesformat, skip_download, format.
- allowed_extractors ve subtitleslangs düzenli ifadedir, büyük/küçük harf duyarsız tam eşleşir
  (utils/_utils.py orderedSet_from_options). Bu yüzden dil kodu re.escape ile verilir.
- match_filter, process_info'nun başında, altyazı ya da medya indirilmeden önce çağrılır (_match_entry); burada atılan
  hata yt-dlp'den dışarı çıkar ve indirme başlamaz.
- İndirilen dosya info['requested_downloads'][i]['filepath'], altyazı info['requested_subtitles'][dil]['filepath']
  alanındadır (_write_subtitles). max_filesize yalnızca sunucu boyutu bildirirse uygulanır (downloader/http.py) ve
  aşılınca hata vermeden indirmez; boyutu bildirilmeyen akış için progress_hooks kancası baytları sayar.
- extractor/genericembeds.py: HTML5MediaEmbedIE (IE_NAME 'html5'); extractor/common.py _parse_html5_media_entries,
  <track kind="subtitles"> etiketindeki srclang (yoksa lang, o da yoksa label) değerini dil anahtarı yapar; üçü de
  yoksa anahtar None olur.
"""

import ipaddress
import re
import socket
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

# BCP 47 benzeri dil kodu: "tr", "tr-TR", "pt_BR". Sayfadan gelen dil anahtarı dosya adına girer; "../" gibi
# değerler bu süzgeçten geçemez.
GUVENLI_DIL = re.compile(r"[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{1,8})*")
_YEREL_SONEKLER = (".localhost", ".local", ".internal", ".lan", ".intranet", ".home.arpa")
_URL_KIMLIK = re.compile(r"(https?://)[^\s/@]+@")
_URL_SORGU = re.compile(r"(https?://[^\s?#'\"]*)[?#][^\s'\"]*")


class KaynakHatasi(Exception):
    pass


@dataclass
class Kaynak:
    baslik: str
    adres: str
    altyazi: Path | None = None
    medya: Path | None = None
    uyarilar: list[str] = field(default_factory=list)


def gizle(metin: str) -> str:
    """Metindeki URL'lerden kullanıcı adı/parola ve sorgu dizgesini (ör. imzalı bağlantı jetonu) çıkarır."""
    return _URL_SORGU.sub(r"\1?...", _URL_KIMLIK.sub(r"\1", metin))


def url_mi(metin: str) -> bool:
    """http(s) adresi mi? Bozuk adres de adres sayılır; nedenini adres_reddi açıklar."""
    return metin.strip().lower().startswith(("http://", "https://"))


def alan_normal(ad: str) -> str:
    """Karşılaştırma biçimi: küçük harf, baştaki/sondaki nokta yok, Türkçe karakterli alan adı punycode."""
    ad = ad.strip()
    if "://" in ad:
        try:
            ad = urlsplit(ad).hostname or ""
        except ValueError:
            return ""
    ad = ad.strip(".").lower()
    try:
        return ad.encode("idna").decode("ascii")
    except UnicodeError:
        return ad


def alan_izinli_mi(url: str, izinli: list[str]) -> bool:
    """Yalnızca müşterinin kendi (ya da lisanslı) alan adları: alan veya alt alan adı eşleşmeli."""
    try:
        host = alan_normal(urlsplit(url).hostname or "")
    except ValueError:
        return False
    return bool(host) and any(host == a or host.endswith("." + a) for a in map(alan_normal, izinli) if a)


def _ip(host: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    try:
        return ipaddress.ip_address(host)
    except ValueError:
        pass
    try:  # "2130706433", "127.1", "0x7f.0.0.1": işletim sisteminin de IP sayacağı yazımlar
        return ipaddress.ip_address(socket.inet_aton(host))
    except (OSError, ValueError):
        return None


def yerel_ag_mi(host: str) -> bool:
    """Loopback, özel, bağlantı-yerel, ayrılmış ya da çok noktaya yayın adresi; localhost ve tek etiketli ad.

    DNS çözümlemesi yapılmaz: yerel IP'ye çözülen bir alan adını yakalamak barındırılan hizmette ağ katmanının işidir.
    """
    host = host.strip("[]").rstrip(".").lower()
    if host == "localhost" or host.endswith(_YEREL_SONEKLER) or ("." not in host and ":" not in host):
        return True
    ip = _ip(host)
    if ip is None:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return not ip.is_global or ip.is_multicast


def adres_reddi(url: str, izinli: list[str], yerel_aga_izin: bool = False) -> str | None:
    """Adres indirilemezse nedenini döndürür; indirilebilirse None."""
    if not url or any(c.isspace() or ord(c) < 32 or c == "\\" for c in url):
        return "Adres boş ya da boşluk, denetim karakteri veya ters bölü içeriyor."
    try:
        parca = urlsplit(url)
        host = parca.hostname or ""
    except ValueError:
        return f"Adres çözümlenemedi: {gizle(url)}"
    if parca.scheme not in ("http", "https"):
        return f"Yalnızca http ve https adresleri indirilir: {gizle(url)}"
    if "@" in parca.netloc:
        return "Kullanıcı adı ya da parola içeren adresler reddedilir."
    if not alan_izinli_mi(url, izinli):
        return (
            f"{host or '(boş)'} izinli alan adları arasında değil. Bu araç yalnızca size ait ya da kullanım hakkına "
            "sahip olduğunuz içerik içindir; alan adını --izinli-alan ile ekleyin."
        )
    if yerel_ag_mi(host) and not yerel_aga_izin:
        return f"{host} yerel ağ ya da özel bir adres; yalnızca --yerel-aga-izin ile kullanılabilir."
    return None


def url_suzgeci(izinli: list[str], yerel_aga_izin: bool = False, medya_indirilecek: bool = False):
    """yt-dlp match_filter işlevi: indirilecek her adres izinli alanda olmalı, değilse indirme başlamadan durur.

    Denetlenenler: sayfa (yönlendirme sonrası webpage_url), seçilen altyazılar ve medya indirilecekse seçilen biçimlerin
    url / manifest_url / fragment_base_url alanları.
    """

    def suzgec(bilgi: dict, *, incomplete=False) -> None:
        adresler = [bilgi.get("webpage_url")]
        if not incomplete:
            altyazilar = (bilgi.get("requested_subtitles") or {}).values()
            adresler += [a.get("url") for a in altyazilar if isinstance(a, dict)]
            if medya_indirilecek:
                bicimler = [bilgi, *(bilgi.get("requested_formats") or [])]
                adresler += [b.get(k) for b in bicimler for k in ("url", "manifest_url", "fragment_base_url")]
        for adres in adresler:
            if isinstance(adres, str) and (neden := adres_reddi(adres, izinli, yerel_aga_izin)):
                raise KaynakHatasi(f"İndirme durduruldu: {neden}")
        return None

    return suzgec


def boyut_kancasi(azami_bayt: int):
    """yt-dlp progress_hooks kancası: indirilen bayt sınırı aşınca indirmeyi keser."""

    def kanca(durum: dict) -> None:
        if durum.get("status") == "downloading" and (durum.get("downloaded_bytes") or 0) > azami_bayt:
            mb = max(azami_bayt // (1024 * 1024), 1)
            raise KaynakHatasi(f"İndirme {mb} MB sınırını aştığı için durduruldu (--azami-boyut-mb).")

    return kanca


def baslik_yap(ad: str) -> str:
    """Dosya adından başlık: "kesirler-1" → "Kesirler 1" (Türkçe büyük harf: i → İ)."""
    ad = " ".join(ad.replace("-", " ").replace("_", " ").split())
    if not ad:
        return "Ders"
    return ad[:1].replace("i", "İ").upper() + ad[1:]


def _dil_eki_at(ad: str) -> str:
    """"kesirler.tr" → "kesirler"; dil koduna benzemeyen ek ("ders.2024") korunur."""
    govde, nokta, ek = ad.rpartition(".")
    return govde if nokta and govde and GUVENLI_DIL.fullmatch(ek) else ad


def yerel_kaynak(yol: Path, diller: list[str]) -> Kaynak:
    if not yol.is_file():
        raise KaynakHatasi(f"Dosya bulunamadı: {yol.name or yol}")
    if yol.suffix.lower() in (".vtt", ".srt"):
        return Kaynak(baslik_yap(_dil_eki_at(yol.stem)), yol.name, altyazi=yol)
    diller = [d for d in diller if GUVENLI_DIL.fullmatch(d)]  # "../x" gibi değerler yol parçası olamaz
    adaylar = [yol.with_suffix(f".{d}{uzanti}") for d in diller for uzanti in (".vtt", ".srt")]
    adaylar += [yol.with_suffix(".vtt"), yol.with_suffix(".srt")]
    altyazi = next((a for a in adaylar if a.is_file()), None)
    return Kaynak(baslik_yap(yol.stem), yol.name, altyazi=altyazi, medya=yol)


def _ilk_girdi(bilgi) -> tuple[dict, list[str]]:
    """Web sayfasındaki birden çok video oynatma listesi olarak döner; yalnızca ilki işlenir."""
    if not isinstance(bilgi, dict):
        raise KaynakHatasi("Sayfadan video bilgisi alınamadı.")
    if bilgi.get("_type") not in ("playlist", "multi_video"):
        return bilgi, []
    girdiler = [g for g in bilgi.get("entries") or [] if isinstance(g, dict)]
    if not girdiler:
        raise KaynakHatasi("Sayfada video bulunamadı.")
    toplam = bilgi.get("playlist_count")
    toplam = toplam if isinstance(toplam, int) else len(girdiler)
    return girdiler[0], [f"Sayfada {toplam} video var; yalnızca ilki işlendi."] if toplam > 1 else []


def _dil_normal(kod: str) -> str:
    return kod.replace("_", "-").lower()


def altyazi_dili(bilgi: dict, diller: list[str]) -> str | None:
    """Tercih sırasına göre altyazı anahtarı: önce elle yazılmış, sonra otomatik altyazı.

    "TR", "tr_TR", "tr-TR" anahtarları "tr" tercihiyle eşleşir; dili olmayan (None) ya da dil koduna benzemeyen
    anahtarlar atlanır.
    """
    for tur in ("subtitles", "automatic_captions"):
        mevcut = [k for k in (bilgi.get(tur) or {}) if isinstance(k, str) and GUVENLI_DIL.fullmatch(k)]
        for dil in map(_dil_normal, diller):
            for kod in mevcut:
                if _dil_normal(kod) == dil or _dil_normal(kod).startswith(dil + "-"):
                    return kod
    return None


def ytdlp_ile_indir(
    url: str,
    hedef: Path,
    diller: list[str],
    izinli: list[str],
    ydl_sinifi=None,
    bekleme_sn: float = 1.0,
    azami_bayt: int = 2048 * 1024 * 1024,
    yerel_aga_izin: bool = False,
) -> Kaynak:
    if neden := adres_reddi(url, izinli, yerel_aga_izin):
        raise KaynakHatasi(neden)
    if ydl_sinifi is None:
        try:
            from yt_dlp import YoutubeDL as ydl_sinifi  # isteğe bağlı bağımlılık
        except ImportError as hata:
            raise KaynakHatasi("Adresten indirmek için yt-dlp gerekir: pip install -r requirements.txt") from hata

    hedef.mkdir(parents=True, exist_ok=True)
    ortak = {
        "paths": {"home": str(hedef)},
        "outtmpl": {"default": "%(id)s.%(ext)s"},
        "restrictfilenames": True,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "noplaylist": True,
        "playlist_items": "1",
        # Yalnızca genel sayfa okuyucu ve HTML5 <video>/<track>: YouTube, Vimeo gibi platform okuyucuları yüklenmez,
        # sayfaya gömülü platform videosu da izlenmez.
        "allowed_extractors": ["generic", "html5"],
        "match_filter": url_suzgeci(izinli, yerel_aga_izin),
        "progress_hooks": [boyut_kancasi(azami_bayt)],
        "max_filesize": azami_bayt,
        "socket_timeout": 30,
        "retries": 3,
        "sleep_interval_requests": bekleme_sn,  # sunucuya nazik ol
    }
    try:
        with ydl_sinifi(ortak) as ydl:
            girdi, uyarilar = _ilk_girdi(ydl.extract_info(url, download=False))
        dil = altyazi_dili(girdi, diller)
        if dil:  # altyazı varsa medya indirilmez: hem hızlı hem saygılı
            ayar = {**ortak, "skip_download": True, "writesubtitles": True, "writeautomaticsub": True}
            ayar.update({"subtitleslangs": [re.escape(dil)], "subtitlesformat": "vtt/srt/best"})
        else:  # altyazı yoksa yalnız ses, o yoksa en düşük kaliteli ses+görüntü; konuşma ASR ile yazıya dökülür
            ayar = {**ortak, "format": "bestaudio/worst", "match_filter": url_suzgeci(izinli, yerel_aga_izin, True)}
        with ydl_sinifi(ayar) as ydl:
            sonuc, _ = _ilk_girdi(ydl.extract_info(url, download=True))
    except KaynakHatasi:
        raise
    except Exception as hata:  # yt-dlp'nin DownloadError'ı, ağ hataları; mesajdaki adresler gizlenir
        raise KaynakHatasi(f"yt-dlp indiremedi: {gizle(str(hata))}") from hata

    baslik = str(sonuc.get("title") or girdi.get("title") or "Ders")
    if dil:
        yol = ((sonuc.get("requested_subtitles") or {}).get(dil) or {}).get("filepath")
        if not yol or not Path(yol).is_file():
            raise KaynakHatasi("Altyazı indirilemedi.")
        return Kaynak(baslik, url, altyazi=Path(yol), uyarilar=uyarilar)
    yol = next((d.get("filepath") for d in sonuc.get("requested_downloads") or [] if d.get("filepath")), None)
    if not yol or not Path(yol).is_file():
        raise KaynakHatasi("Medya indirilemedi: boyut sınırı aşılmış ya da sunucu dosyayı vermemiş olabilir.")
    return Kaynak(baslik, url, medya=Path(yol), uyarilar=uyarilar)
